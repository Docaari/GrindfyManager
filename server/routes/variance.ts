import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  ALLOWED_PROFILE_LETTERS,
  DEFAULT_PLAYERS_AVG,
} from "../../shared/primedopeDefaults";
import { buildHistoryAggregate } from "../services/historyAggregate";

const router = Router();

function userIdFrom(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

// ---------------------------------------------------------------------------
// Cache — historical stats (1h TTL, per-user)
// Uses app.locals for test isolation (each buildApp() = fresh cache).
// invalidateHistoricalStatsCache uses a generation counter so external
// callers (upload handler) can bust the cache without app reference.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  data: any;
  expiresAt: number;
  generation: number;
}

const invalidationGeneration = new Map<string, number>();

function getGeneration(userId: string): number {
  return invalidationGeneration.get(userId) ?? 0;
}

export function invalidateHistoricalStatsCache(userId: string): void {
  const current = invalidationGeneration.get(userId) ?? 0;
  invalidationGeneration.set(userId, current + 1);
}

export function _resetCacheForTests(): void {
  invalidationGeneration.clear();
}

function getCacheMap(req: Request): Map<string, CacheEntry> {
  const app = req.app;
  if (!app.locals._varianceCache) {
    app.locals._varianceCache = new Map<string, CacheEntry>();
  }
  return app.locals._varianceCache;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

const VALID_WEEKS = [1, 4, 12, 52];
const VALID_PROFILES = ALLOWED_PROFILE_LETTERS as readonly string[];

function classifyTier(buyIn: number): "high" | "mid" | "low" | "entry" | null {
  if (buyIn >= 100) return "high";
  if (buyIn >= 50) return "mid";
  if (buyIn >= 22) return "low";
  if (buyIn >= 10) return "entry";
  return null;
}

function normalizeType(type: string): string {
  if (type === "Satellite" || type === "Add-on") return "Vanilla";
  return type;
}

// ---------------------------------------------------------------------------
// GET /historical-stats (RF-06)
// ---------------------------------------------------------------------------

router.get(
  "/historical-stats",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = userIdFrom(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const cache = getCacheMap(req);
      const cacheKey = `hist:${userId}`;
      const cached = cache.get(cacheKey);
      const gen = getGeneration(userId);

      if (
        cached &&
        cached.expiresAt > Date.now() &&
        cached.generation === gen
      ) {
        return res.json(cached.data);
      }

      const result = await storage.getHistoricalStatsByUser({ userId });

      const response = {
        tiers: result.tiers.map((t: any) => ({
          tier: t.tier,
          type: t.type,
          count: t.count,
          avgBuyIn: t.avg_buy_in ?? t.avgBuyIn,
          avgField: t.avg_field ?? t.avgField,
          roiAdjusted: t.roi_adjusted ?? t.roiAdjusted,
          lowSample: t.count < 20 ? true : undefined,
        })),
        totals: result.totals,
      };

      for (const tier of response.tiers) {
        if (tier.lowSample === undefined) delete tier.lowSample;
      }

      cache.set(cacheKey, {
        data: response,
        expiresAt: Date.now() + CACHE_TTL_MS,
        generation: gen,
      });

      return res.json(response);
    } catch (err) {
      console.error("[variance] historical-stats failed", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /buckets-aggregate (RF-08)
// ---------------------------------------------------------------------------

router.get(
  "/buckets-aggregate",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = userIdFrom(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profileLetter = req.query.profileLetter as string | undefined;
    const weeksStr = req.query.weeks as string | undefined;

    if (!profileLetter || !VALID_PROFILES.includes(profileLetter)) {
      return res
        .status(400)
        .json({ message: "profileLetter deve ser A, B ou C" });
    }

    const weeks = Number(weeksStr);
    if (!weeksStr || !VALID_WEEKS.includes(weeks)) {
      return res
        .status(400)
        .json({ message: "weeks deve ser 1, 4, 12 ou 52" });
    }

    try {
      const planned = await storage.listPlannedTournamentsByProfile({
        userId,
        profileLetter,
      });

      if (!planned || planned.length === 0) {
        return res.json({
          groups: [],
          meta: {
            profileLetter,
            weeks,
            daysInProfile: 0,
            tournamentsPerWeek: 0,
            weeklyInvestment: 0,
          },
        });
      }

      let historicalTiers: any[] = [];
      try {
        const histResult = await storage.getHistoricalStatsByUser({ userId });
        historicalTiers = (histResult.tiers ?? []).map((t: any) => ({
          tier: t.tier,
          type: t.type,
          count: t.count,
          avgBuyIn: t.avg_buy_in ?? t.avgBuyIn,
          avgField: t.avg_field ?? t.avgField,
          roiAdjusted: t.roi_adjusted ?? t.roiAdjusted,
          lowSample: (t.count ?? 0) < 20,
        }));
      } catch {
        // fallback to defaults
      }

      const distinctDays = new Set(planned.map((pt: any) => pt.dayOfWeek));
      const daysInProfile = distinctDays.size;

      const groupMap = new Map<
        string,
        { tier: string; type: string; buyIns: number[]; count: number }
      >();

      for (const pt of planned) {
        const buyIn = Number(pt.buyIn);
        const tier = classifyTier(buyIn);
        if (!tier) continue;

        const type = normalizeType(pt.type);
        const key = `${tier}:${type}`;

        const existing = groupMap.get(key);
        if (existing) {
          existing.buyIns.push(buyIn);
          existing.count += 1;
        } else {
          groupMap.set(key, { tier, type, buyIns: [buyIn], count: 1 });
        }
      }

      const groups: any[] = [];

      for (const [, group] of groupMap) {
        const avgBuyIn =
          group.buyIns.reduce((s, v) => s + v, 0) / group.buyIns.length;
        const countPerWeek = (group.count / 7) * daysInProfile;
        const count = Math.round(countPerWeek * weeks);

        if (count === 0 && countPerWeek === 0) continue;

        const hist = historicalTiers.find(
          (h: any) => h.tier === group.tier && h.type === group.type,
        );

        const tierLabel =
          group.tier.charAt(0).toUpperCase() + group.tier.slice(1);
        const name = `${tierLabel} ${group.type}`;

        groups.push({
          name,
          tier: group.tier,
          type: group.type,
          buyIn: Math.round(avgBuyIn * 100) / 100,
          field: hist ? hist.avgField : DEFAULT_PLAYERS_AVG,
          roi: hist ? hist.roiAdjusted : 0.1,
          countPerWeek,
          count,
          isPKO: group.type === "PKO",
          source: hist ? "historical" : "default",
          lowSample: hist ? hist.lowSample === true : false,
        });
      }

      const tournamentsPerWeek = groups.reduce(
        (s, g) => s + g.countPerWeek,
        0,
      );
      const weeklyInvestment = groups.reduce(
        (s, g) => s + g.buyIn * g.countPerWeek,
        0,
      );

      return res.json({
        groups,
        meta: {
          profileLetter,
          weeks,
          daysInProfile,
          tournamentsPerWeek,
          weeklyInvestment,
        },
      });
    } catch (err) {
      console.error("[variance] buckets-aggregate failed", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /history-aggregate (VR-CALC-2) — import do histórico CSV por período
//   Query: from=YYYY-MM-DD&to=YYYY-MM-DD  OU  lastDays=7|30|90|365
// ---------------------------------------------------------------------------

const ALLOWED_LAST_DAYS = [7, 30, 90, 365];
const MAX_WINDOW_DAYS = 730;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

router.get(
  "/history-aggregate",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = userIdFrom(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const lastDaysStr = req.query.lastDays as string | undefined;
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;
    const weeksStr = req.query.weeks as string | undefined;
    const weeks = weeksStr && VALID_WEEKS.includes(Number(weeksStr))
      ? Number(weeksStr)
      : 12;

    let from: string;
    let to: string;

    if (lastDaysStr) {
      const n = Number(lastDaysStr);
      if (!ALLOWED_LAST_DAYS.includes(n)) {
        return res
          .status(400)
          .json({ message: "lastDays deve ser 7, 30, 90 ou 365" });
      }
      const now = new Date();
      to = toIsoDate(now);
      from = toIsoDate(new Date(now.getTime() - n * 86400_000));
    } else if (fromStr && toStr) {
      if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
        return res
          .status(400)
          .json({ message: "from/to devem ser YYYY-MM-DD" });
      }
      if (fromStr > toStr) {
        return res.status(400).json({ message: "from deve ser <= to" });
      }
      const spanDays =
        (Date.parse(toStr) - Date.parse(fromStr)) / 86400_000;
      if (spanDays > MAX_WINDOW_DAYS) {
        return res
          .status(400)
          .json({ message: `janela máxima ${MAX_WINDOW_DAYS} dias` });
      }
      from = fromStr;
      to = toStr;
    } else {
      return res.status(400).json({
        message: "informe lastDays OU (from + to)",
      });
    }

    try {
      const result = await buildHistoryAggregate({ userId, from, to, weeks });
      return res.json(result);
    } catch (err) {
      console.error("[variance] history-aggregate failed", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

export default router;
