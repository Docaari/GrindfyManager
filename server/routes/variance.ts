import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { buildBankrollHealth } from "../services/bankrollHealth";
import {
  ALLOWED_PROFILE_LETTERS,
  DEFAULT_PLAYERS_AVG,
} from "../../shared/primedopeDefaults";
import {
  matchFamilyStats,
  buildGradeLabel,
  clampRealisticRoiPct,
  plannedBuyInTier,
  plannedType,
  plannedTimeBin,
  plannedRakeDecimal,
  siteFeeShare,
  prizePoolPartOfBuyIn,
  rakeMarkupFromFeeShare,
  filterPlannedByActiveDays,
  describeMatchScope,
  groupPlannedTournaments,
  LOW_SAMPLE_VOLUME,
} from "../services/gradeRoiMatcher";
import { hasKnownRake } from "../../shared/poker-sites";

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

      // Mesmo cruzamento do /grade-roi: dia OFF ou de outro perfil nao conta.
      const aggProfileStates = await storage.listProfileStates(userId);
      const aggFiltered = filterPlannedByActiveDays(
        planned,
        aggProfileStates,
        profileLetter,
      );
      const plannedActive = aggFiltered.rows;

      if (plannedActive.length === 0) {
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

      const distinctDays = new Set(plannedActive.map((pt: any) => pt.dayOfWeek));
      const daysInProfile = distinctDays.size;

      const groupMap = new Map<
        string,
        { tier: string; type: string; buyIns: number[]; count: number; sites: string[] }
      >();

      for (const pt of plannedActive) {
        const buyIn = Number(pt.buyIn);
        const tier = classifyTier(buyIn);
        if (!tier) continue;

        const type = normalizeType(pt.type);
        const key = `${tier}:${type}`;

        const existing = groupMap.get(key);
        if (existing) {
          existing.buyIns.push(buyIn);
          existing.sites.push(pt.site);
          existing.count += 1;
        } else {
          groupMap.set(key, {
            tier,
            type,
            buyIns: [buyIn],
            count: 1,
            sites: [pt.site],
          });
        }
      }

      const groups: any[] = [];

      for (const [, group] of groupMap) {
        const avgBuyIn =
          group.buyIns.reduce((s, v) => s + v, 0) / group.buyIns.length;
        // Rake medio dos sites do bucket (antes ficava 0% e inflava o EV).
        const avgFeeShare =
          group.sites.reduce((s, site) => s + siteFeeShare(site), 0) /
          Math.max(1, group.sites.length);
        // Cada torneio planejado se repete 1x por semana no dia dele. O rateio
        // antigo ((count/7) x diasNoPerfil) existia para diluir a contagem
        // inflada por dias de OUTRO perfil; com o filtro de dias ativos a
        // contagem ja e semanal e o rateio subestimava o volume.
        const countPerWeek = group.count;
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
          buyIn: Math.round(prizePoolPartOfBuyIn(avgBuyIn, avgFeeShare) * 100) / 100,
          rakePct:
            Math.round(rakeMarkupFromFeeShare(avgFeeShare) * 10000) / 10000,
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
// GET /bankroll-health (Fase D #8 / ADR-236 D-5)
// Painel BRM/RoR ao vivo: banca real → varianceEngine. Read-only.
// Reusa cache (D-6) com key dedicada brm:${userId}; invalidacao grati via
// invalidateHistoricalStatsCache (generation por-userId busta brm: tambem).
// ---------------------------------------------------------------------------

router.get(
  "/bankroll-health",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = userIdFrom(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const cache = getCacheMap(req);
      const cacheKey = `brm:${userId}`;
      const cached = cache.get(cacheKey);
      const gen = getGeneration(userId);

      if (
        cached &&
        cached.expiresAt > Date.now() &&
        cached.generation === gen
      ) {
        return res.json(cached.data);
      }

      const result = await buildBankrollHealth(userId);

      cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
        generation: gen,
      });

      return res.json(result);
    } catch (err) {
      // lesson #9 — log antes do fallback. Degrada para 200 gracioso (o card
      // sabe esconder); preferimos nao 500 nesta superficie de diagnostico.
      console.error("[variance] bankroll-health failed", err);
      return res.json({
        bankrollUsd: 0,
        roiMean: null,
        stdDev: null,
        riskOfRuinPct: null,
        classification: null,
        dataSufficiency: "none",
        sampleSize: 0,
        bisOfMargin: null,
        groupsUsed: 0,
      });
    }
  },
);


// ---------------------------------------------------------------------------
// GET /grade-roi — "Importar Grade e ROI"
//
// Uma LINHA POR TORNEIO da grade do perfil, rotulada com o vocabulario da
// Biblioteca de Torneios (tipo + faixa de ABI + site + janela de ~2h) e com o
// ROI que o jogador tem naquele tipo de torneio.
//
// ROI: `roi` (decimal) e o valor CLAMPADO em [-20%, +40%] que alimenta a
// simulacao; `libRoiPct` + `libVolume` sao o valor cru da biblioteca e a
// amostra por tras dele (exibidos em cinza na UI). Sem amostra -> libRoiPct
// null + matchLevel "none" (nao inventa ROI; cai no default declarado).
// ---------------------------------------------------------------------------

// Sem NENHUMA amostra na biblioteca a linha nasce com 15% (decisao do founder:
// numero de partida honesto e visivelmente marcado como "sem amostra"), nunca
// com um ROI que finge vir do historico.
const DEFAULT_ROI_DECIMAL = 0.15;
const DEFAULT_ITM_DECIMAL = 0.15;

router.get("/grade-roi", requireAuth, async (req: Request, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const profileLetter = req.query.profileLetter as string | undefined;
  const weeksStr = req.query.weeks as string | undefined;

  if (!profileLetter || !VALID_PROFILES.includes(profileLetter)) {
    return res.status(400).json({ message: "profileLetter deve ser A, B ou C" });
  }

  const weeks = Number(weeksStr);
  if (!weeksStr || !VALID_WEEKS.includes(weeks)) {
    return res.status(400).json({ message: "weeks deve ser 1, 4, 12 ou 52" });
  }

  const period = (req.query.period as string | undefined) ?? "all";

  try {
    const planned = await storage.listPlannedTournamentsByProfile({
      userId,
      profileLetter,
    });

    // A grade so mostra o perfil ATIVO de cada dia (dias OFF ou de outro perfil
    // ficam invisiveis na tela). Importar sem esse cruzamento trazia torneio que
    // o jogador nao tem na grade daquele perfil.
    const profileStates = await storage.listProfileStates(userId);
    const filtered = filterPlannedByActiveDays(
      planned ?? [],
      profileStates,
      profileLetter,
    );
    const plannedActive = filtered.rows;

    if (plannedActive.length === 0) {
      return res.json({
        rows: [],
        meta: {
          profileLetter,
          weeks,
          period,
          plannedCount: 0,
          matchedCount: 0,
          activeDays: filtered.activeDays,
          activeDaysApplied: filtered.applied,
          skippedInactive: (planned ?? []).length,
        },
      });
    }

    let families: any[] = [];
    try {
      families = await storage.getTournamentLibrary(userId, period, {}, undefined, {
        includeBelowFloor: true,
      });
    } catch (err) {
      // Lesson #9: loga ANTES do fallback. Sem biblioteca a grade ainda importa,
      // so que sem ROI historico (matchLevel "none" em todas as linhas).
      console.error("[variance] grade-roi: biblioteca indisponivel", err);
      families = [];
    }

    // "Mini Kickoff" de segunda a sexta = UMA unidade. O casamento roda sobre o
    // representante (horario predominante), nao sobre cada dia isolado.
    const units = groupPlannedTournaments(plannedActive as any);

    const rows = units.map((unit) => {
      const pt: any = unit.representative;
      const stats = matchFamilyStats(pt, families);
      // buy-in da grade = TOTAL pago. O engine quer a parte do prize pool.
      const buyIn = Number(pt.buyIn);
      const totalBuyIn = Number.isFinite(buyIn) && buyIn > 0 ? buyIn : 0.01;
      const feeShare = siteFeeShare(pt.site);
      const safeBuyIn = Math.max(0.01, prizePoolPartOfBuyIn(totalBuyIn, feeShare));
      const type = plannedType(pt);

      const hasRoi = stats.roiPct !== null && stats.volume > 0;
      const roiDecimal = hasRoi
        ? clampRealisticRoiPct(stats.roiPct as number) / 100
        : DEFAULT_ROI_DECIMAL;

      const itmDecimal =
        stats.itmPct !== null && stats.itmPct > 0
          ? Math.max(0.05, Math.min(0.5, stats.itmPct / 100))
          : DEFAULT_ITM_DECIMAL;

      const scope = describeMatchScope(pt, stats.level);

      return {
        plannedId: pt.id,
        // Nome proprio na frente quando ele e o mesmo em todas as ocorrencias:
        // duas linhas podem compartilhar o rotulo de familia (mesmo site, faixa
        // e horario) e so o nome as distingue na tela.
        name: unit.tournamentName
          ? `${unit.tournamentName} · ${buildGradeLabel(pt)}`
          : buildGradeLabel(pt),
        tournamentName: unit.tournamentName,
        tier: plannedBuyInTier(pt.buyIn),
        type,
        site: pt.site ?? null,
        speed: pt.speed ?? null,
        timeBin: plannedTimeBin(pt.time),
        time: pt.time ?? null,
        dayOfWeek: pt.dayOfWeek ?? null,
        buyIn: Math.round(safeBuyIn * 100) / 100,
        totalBuyIn: Math.round(totalBuyIn * 100) / 100,
        siteFeePct: Math.round(feeShare * 1000) / 10,
        field:
          stats.avgFieldSize && stats.avgFieldSize > 0
            ? Math.round(stats.avgFieldSize)
            : DEFAULT_PLAYERS_AVG,
        roi: Math.round(roiDecimal * 10000) / 10000,
        placesPaidPct: Math.round(itmDecimal * 10000) / 10000,
        // Rake real do site (tournaments.rake_pct nunca e preenchido pelos
        // parsers). Sem isso a simulacao rodava com 0% e superestimava o EV.
        rakePct: Math.round(plannedRakeDecimal(pt) * 10000) / 10000,
        rakeSource: hasKnownRake(pt.site) ? "site" : "default",
        occurrencesPerWeek: unit.occurrencesPerWeek,
        days: unit.days,
        varyingTime: unit.timeBins.length > 1,
        countPerWeek: unit.occurrencesPerWeek,
        count: unit.occurrencesPerWeek * weeks,
        isPKO: type === "PKO" || type === "Mystery",
        // Rastro da biblioteca (exibido em cinza na UI)
        libRoiPct: hasRoi ? Math.round((stats.roiPct as number) * 10) / 10 : null,
        libVolume: stats.volume,
        matchLevel: stats.level,
        // De onde veio o ROI. `siteSampleMissing` avisa que a amostra NAO e do
        // site da linha (era isso que fazia "Bodog" exibir 2423 torneios).
        matchScopeLabel: scope?.label ?? null,
        siteSampleMissing: scope?.siteSampleMissing ?? false,
        lowSample: stats.volume > 0 && stats.volume < LOW_SAMPLE_VOLUME,
        source: hasRoi ? "library" : "default",
      };
    });

    const matchedCount = rows.filter(
      (r: any) => r.source === "library" && !r.siteSampleMissing,
    ).length;

    return res.json({
      rows,
      meta: {
        profileLetter,
        weeks,
        period,
        lineCount: rows.length,
        plannedCount: plannedActive.length,
        matchedCount,
        activeDays: filtered.activeDays,
        activeDaysApplied: filtered.applied,
        skippedInactive: (planned ?? []).length - plannedActive.length,
      },
    });
  } catch (err) {
    console.error("[variance] grade-roi failed", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
