import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { tournaments, grindSessions, plannedTournaments } from "@shared/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { parseFiltersParam, mapFiltersToBackendFormat } from "./helpers";
import { dashboardService } from "../services/dashboardService";

// =============================================================================
// Sprint Bankroll-3 RF-7 — handler exportado para teste unitario.
// =============================================================================
const VALID_PERIODS = new Set(["7d", "30d", "90d", "180d", "all"]);

// =============================================================================
// Wave G (Fase 3 perf) — cache server-side de /api/dashboard/quick-stats.
//
// Load test 2026-05-11 revelou esse endpoint como bottleneck: 4 queries DB/req
// (2 delas full scan da tabela tournaments p/ usuario heavy 18k+ rows),
// p95 ~2000ms @ 100 conexoes concorrentes vs ~83ms do /api/home/overview que
// ja eh cacheado. Mesmo pattern do focusStats/home: Map<userId, {data,expiresAt}>
// + TTL 30s. Invalidator chamado por upload + grind-session mutations.
// =============================================================================
interface QuickStatsCacheEntry { data: any; expiresAt: number; }
const QUICK_STATS_TTL_MS = 30_000;
const QUICK_STATS_CACHE_MAX = 5000;
const _quickStatsCache = new Map<string, QuickStatsCacheEntry>();

function _evictQuickStatsExpired(now: number): void {
  for (const [k, v] of _quickStatsCache) {
    if (v.expiresAt <= now) _quickStatsCache.delete(k);
  }
  if (_quickStatsCache.size > QUICK_STATS_CACHE_MAX) {
    let removed = 0;
    const overflow = _quickStatsCache.size - QUICK_STATS_CACHE_MAX;
    for (const k of _quickStatsCache.keys()) {
      if (removed >= overflow) break;
      _quickStatsCache.delete(k);
      removed++;
    }
  }
}

/** Invalidator publico — chamado por mutations que afetam quick-stats. */
export function invalidateDashboardQuickStatsCache(userId?: string): void {
  if (userId) _quickStatsCache.delete(userId);
  else _quickStatsCache.clear();
}

/** Test-only reset. */
export function _resetDashboardQuickStatsCacheForTests(): void {
  _quickStatsCache.clear();
}

// =============================================================================
// Sprint Flight-1 RF-16: handleGetDashboard exposto para passar param
// `expandFlightSeries` para storage.getDashboardStats. Default: setting do user.
// =============================================================================
export async function handleGetDashboard(req: any, res: any): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const settings = await (storage as any).getUserSettings(userId);
    const settingDefault = !!settings?.reportsExpandFlightSeries;
    const queryParam = req?.query?.expandFlightSeries;
    let expandFlightSeries = settingDefault;
    if (queryParam !== undefined) {
      expandFlightSeries = queryParam === 'true' || queryParam === true;
    }
    const stats = await (storage as any).getDashboardStats(userId, {
      expandFlightSeries,
    });
    res.status(200).json(stats);
  } catch (err) {
    console.error("[handleGetDashboard] failed:", err);
    res.status(500).json({ message: "Failed to fetch dashboard" });
  }
}

export async function handleGetDashboardRoiByPlatform(
  req: any,
  res: any,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const period = (req?.query?.period as string) ?? "30d";
    if (!VALID_PERIODS.has(period)) {
      res.status(400).json({ message: `period invalido: ${period}` });
      return;
    }
    const limitRaw = req?.query?.limit;
    let limit = 10;
    if (limitRaw !== undefined && limitRaw !== "") {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
        res.status(400).json({ message: "limit deve ser entre 1 e 50" });
        return;
      }
      limit = Math.floor(parsed);
    }
    // Implementer Round UX #3: opt-in delta vs periodo anterior.
    const compareRaw = req?.query?.compareWithPrevious;
    const compareWithPrevious =
      compareRaw === "true" || compareRaw === "1" || compareRaw === true;
    const result = await dashboardService.getRoiByPlatform(userId, {
      period: period as any,
      limit,
      compareWithPrevious,
    });
    res.status(200).json(result);
  } catch (err) {
    console.error("[handleGetDashboardRoiByPlatform] failed:", err);
    res.status(500).json({ message: "Failed to fetch ROI by platform" });
  }
}

export function registerDashboardRoutes(app: Express): void {
  // Dashboard routes with filters
  app.get('/api/dashboard/stats', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const rawFilters = parseFiltersParam(req.query.filters);

      // Map frontend filters to backend format
      const filters = mapFiltersToBackendFormat(rawFilters);

      // Sprint Flight-1 RF-16: opts.expandFlightSeries vem de query > setting > false.
      const settings = await (storage as any).getUserSettings?.(userId);
      const settingDefault = !!settings?.reportsExpandFlightSeries;
      const queryParam = req.query.expandFlightSeries;
      let expandFlightSeries = settingDefault;
      if (queryParam !== undefined) {
        expandFlightSeries = queryParam === 'true' || queryParam === true;
      }

      const stats = await storage.getDashboardStats(userId, period, filters, { expandFlightSeries });


      res.json(stats);
    } catch (error) {
      console.error("[GET /api/dashboard/stats] failed:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Quick stats for Home page
  app.get('/api/dashboard/quick-stats', requireAuth, async (req: any, res) => {
    try {
      const userPlatformId = req.user.userPlatformId;

      // Wave G perf: cache hit (TTL 30s). 4 queries DB evitadas; bottleneck no load test.
      const nowTs = Date.now();
      _evictQuickStatsExpired(nowTs);
      const cached = _quickStatsCache.get(userPlatformId);
      if (cached && cached.expiresAt > nowTs) {
        res.setHeader('Cache-Control', 'private, max-age=30');
        return res.json(cached.data);
      }

      // Get basic tournament stats (prize = net profit, não subtrair buyIn).
      // totalTournaments conta eventos distintos (series colapsadas como 1).
      // Exclui baggedAt (Day 1 placeholders sem resultado final).
      const tournamentStats = await db.select({
        totalTournaments: sql<number>`COUNT(DISTINCT COALESCE(${tournaments.seriesId}, ${tournaments.id}))::int`,
        totalProfit: sql<number>`COALESCE(SUM(prize::numeric), 0)`,
        lastSessionDate: sql<string>`MAX(date_played)`
      })
      .from(tournaments)
      .where(and(
        eq(tournaments.userId, userPlatformId),
        isNull(tournaments.grindSessionId),
        isNull(tournaments.baggedAt),
      ));

      // Get grind sessions count
      const sessionCount = await db.select({
        count: sql<number>`COUNT(*)::int`
      })
      .from(grindSessions)
      .where(and(eq(grindSessions.userId, userPlatformId), eq(grindSessions.status, 'completed')));

      // Get planned tournaments count (distinct days with tournaments)
      const gradeCount = await db.select({
        count: sql<number>`COUNT(DISTINCT day_of_week)::int`
      })
      .from(plannedTournaments)
      .where(eq(plannedTournaments.userId, userPlatformId));

      // Get current streak (consecutive profitable days)
      const recentDays = await db.select({
        profit: sql<number>`SUM(prize::numeric)`,
        date: sql<string>`DATE(date_played)`
      })
      .from(tournaments)
      .where(and(
        eq(tournaments.userId, userPlatformId),
        isNull(tournaments.grindSessionId),
        isNull(tournaments.baggedAt),
      ))
      .groupBy(sql`DATE(date_played)`)
      .orderBy(desc(sql`DATE(date_played)`))
      .limit(10);

      let currentStreak = 0;
      for (const day of recentDays) {
        if (Number(day.profit) > 0) {
          currentStreak++;
        } else {
          break;
        }
      }

      const stats = tournamentStats[0];

      const payload = {
        totalTournaments: stats.totalTournaments || 0,
        totalProfit: stats.totalProfit || 0,
        lastSessionDate: stats.lastSessionDate || null,
        currentStreak,
        totalSessions: sessionCount[0]?.count || 0,
        totalGradeDays: gradeCount[0]?.count || 0,
      };
      _quickStatsCache.set(userPlatformId, { data: payload, expiresAt: Date.now() + QUICK_STATS_TTL_MS });
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json(payload);
    } catch (error) {
      console.error("[GET /api/dashboard/quick-stats] failed:", error);
      res.status(500).json({ message: 'Erro ao buscar estatísticas rápidas' });
    }
  });

  app.get('/api/dashboard/performance', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const period = req.query.period as string || "30d";
      const filters = parseFiltersParam(req.query.filters);
      const performance = await storage.getPerformanceByPeriod(userId, period, filters);
      res.json(performance);
    } catch (error) {
      console.error("[GET /api/dashboard/performance] failed:", error);
      res.status(500).json({ message: "Failed to fetch performance data" });
    }
  });

  // Sprint Bankroll-3 RF-7
  app.get('/api/dashboard/roi-by-platform', requireAuth, handleGetDashboardRoiByPlatform);
}
