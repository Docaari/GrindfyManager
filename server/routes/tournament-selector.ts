/**
 * Tournament Selector — Route Handler (RF-01)
 *
 * GET /api/tournament-selector
 *
 * Recebe `date` (YYYY-MM-DD) e devolve a lista de torneios da Suprema +
 * biblioteca pessoal do usuario, ranqueada por score (RF-02).
 *
 * Spec: docs/specs/tournament-selector.md
 * Sequence: docs/architecture/flows/tournament-selector/sequence.md
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { playerBundleCache } from "../services/playerBundle";
import { selectorCache } from "../services/selectorCache";
// Sprint TS-3 fix HIGH-2 (ADR-180 §2.3) — cache compartilhado widget<->tool.
// Key canonica: { userId, date, sources, bankrollMode }. Dual-write mantem
// `selectorCache` legacy p/ back-compat (invalidations cross-system em
// bankrollService/walletService/playerBundle/grade-planner/upload).
import {
  getTournamentSelectorCache,
  setTournamentSelectorCache,
  type CacheKey as TsCacheKey,
} from "../scoring/tournamentSelectorCache";
import { getSupremaTournaments } from "../supremaService";
import { computeTournamentScore } from "../scoring/tournamentScorer";
import {
  COLD_START_PURE_THRESHOLD,
  COLD_START_PARTIAL_THRESHOLD,
} from "../scoring/scoringConstants";
import { computeThresholds } from "../scoring/bankrollRules";
// Sprint AI-0A (HIGH-1): builders de ScoringInputTournament extraidos para
// modulo compartilhado (reusados pelo tournamentScoringService do Coach).
import {
  buildLibraryScoringInput,
  buildSupremaScoringInput,
  dayOfWeekFromDate,
  enrichWithTickets,
  applyTicketBoost,
  type ScoringBuildResult,
} from "../scoring/buildScoringInput";
// Fase F #12 (ADR-237) — Game Selection Score (softness). Eixo SEPARADO,
// camada ACIMA do scorer (mesmo molde do ticket boost). NAO toca o caminho
// calibrado de computeTournamentScore.
import { computeSoftness } from "../scoring/softnessDetector";
import { normalizeBuyInToUSD } from "../scoring/currencyNormalizer";
import type { SoftnessResult } from "../../shared/scoring";
// Sprint TS-3 RF-04 (ADR-178): tristate bankroll filter + telemetria.
import {
  applyBankrollMode,
  buildSelectorTelemetryMetadata,
  type BankrollMode,
  type BankrollRules,
} from "../scoring/bankrollModeFilter";
import { resolveBankrollMode } from "../services/userSettingsService";
// Nota: helper `logSelectorEvent` usado pelo Coach tool; rota widget chama
// `storage.insertSelectorLog` direto p/ preservar timing dos testes legados.
import type {
  ColdStartLevel,
  SelectorTournament,
  SelectorPlayerProfile,
} from "../../shared/scoring";

// =============================================================================
// Public types
// =============================================================================

export interface TournamentSelectorRequest {
  userId: string;
  date?: string;            // YYYY-MM-DD
  sources?: string;         // "suprema,library" default
  minScore?: number;        // 0-100
  minSample?: number;       // sample size threshold for primary buckets
  /** @deprecated Sprint TS-3 RF-04: usar `bankrollMode`. true→hide, false→all. */
  bankrollFilter?: boolean;
  /** Sprint TS-3 RF-04 (ADR-178): tristate. Default herda user_settings. */
  bankrollMode?: BankrollMode;
  lookbackDays?: number;    // default 180
}

export interface TournamentSelectorResponse {
  date: string;
  playerProfile: SelectorPlayerProfile;
  tournaments: SelectorTournament[];
  totalAvailable: number;
  totalReturned: number;
  generatedAt: string;
  cacheHit: boolean;
  bankrollConfigured: boolean;
  bankrollThresholdUSD?: number | null;   // soft limit
  bankrollHardLimitUSD?: number | null;   // hard limit (soft * tolerance)
  warnings: string[];
}

// =============================================================================
// Helpers
// =============================================================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function classifyColdStart(totalTournaments: number): ColdStartLevel {
  if (totalTournaments < COLD_START_PURE_THRESHOLD) return "pure";
  if (totalTournaments < COLD_START_PARTIAL_THRESHOLD) return "partial";
  return false;
}

function filtersHashOf(req: TournamentSelectorRequest, resolvedMode?: BankrollMode): string {
  // Sprint TS-3 RF-04: bankrollMode entra no hash p/ separar cache entre os 3 modos.
  return [
    req.minScore ?? 0,
    req.minSample ?? 0,
    resolvedMode ?? (req.bankrollFilter ? "hide" : "all"),
  ].join("|");
}

// bankrollThreshold removido (Sprint 2 RF-10) — usamos computeThresholds
// do server/scoring/bankrollRules.ts como fonte unica de verdade.

// =============================================================================
// Build ScoringInputTournament for each source — extraido para
// server/scoring/buildScoringInput.ts (Sprint AI-0A HIGH-1, reusado pelo
// tournamentScoringService do Coach). Aqui so a regra de elegibilidade da
// library para uma data (so torneios com dayOfWeek == dow do dia).
// =============================================================================

function libraryToScoringInputForDate(
  l: any,
  date: string,
  exchangeRates: Record<string, number>,
): ScoringBuildResult | null {
  if (l.dayOfWeek == null) return null;
  if (l.dayOfWeek !== dayOfWeekFromDate(date)) return null;
  return buildLibraryScoringInput(l, exchangeRates);
}

// =============================================================================
// Main handler
// =============================================================================

export async function handleTournamentSelector(
  req: TournamentSelectorRequest,
): Promise<TournamentSelectorResponse> {
  // Auth check
  if (!req.userId) {
    throw new Error("Unauthorized: missing userId");
  }

  // Date validation
  let date: string;
  if (req.date == null || req.date === "") {
    date = todayISO();
  } else {
    if (!DATE_REGEX.test(req.date)) {
      throw new Error(`BadRequest: date must be YYYY-MM-DD, got "${req.date}"`);
    }
    date = req.date;
  }

  const sources = req.sources ?? "suprema,library";
  const lookbackDays = req.lookbackDays ?? 180;
  const minScore = req.minScore ?? 0;
  const minSample = req.minSample ?? 0;
  // Sprint TS-3 RF-04 (ADR-178): bankrollMode primario, bankrollFilter alias.
  // Ordem: req.bankrollMode > req.bankrollFilter (alias) > user_settings > 'warn'.
  let bankrollMode: BankrollMode;
  if (req.bankrollMode) {
    bankrollMode = req.bankrollMode;
  } else if (req.bankrollFilter === true) {
    bankrollMode = "hide";
  } else if (req.bankrollFilter === false) {
    bankrollMode = "all";
  } else {
    bankrollMode = await resolveBankrollMode(req.userId);
  }
  const bankrollFilter = bankrollMode === "hide"; // legacy mirror p/ telemetria

  const wantsSuprema = sources.includes("suprema");
  const wantsLibrary = sources.includes("library");
  const filtersHash = filtersHashOf(req, bankrollMode);

  // ---------------------------------------------------------------------------
  // Cache check (30min TTL) — Sprint TS-3 HIGH-2: tenta cache compartilhado
  // primeiro (key canonica { userId, date, sources, bankrollMode }), depois
  // legacy `selectorCache` (back-compat com entries pre-existentes que ainda
  // sao invalidadas por bankroll/wallet/playerBundle).
  // ---------------------------------------------------------------------------
  const sharedCacheKey: TsCacheKey = {
    userId: req.userId,
    date,
    sources,
    bankrollMode,
    // fingerprint opcional (lookbackDays+minScore+minSample) preserva isolacao
    // legacy do widget; Coach tool nao passa entao usa shape canonica curto.
    fingerprint: `lb=${lookbackDays}|ms=${minScore}|mp=${minSample}`,
  };
  const sharedCached = getTournamentSelectorCache<TournamentSelectorResponse>(sharedCacheKey);
  if (sharedCached) {
    return { ...sharedCached, cacheHit: true };
  }
  const cached = selectorCache.get<TournamentSelectorResponse>(
    req.userId, date, sources, lookbackDays, filtersHash,
  );
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  // ---------------------------------------------------------------------------
  // Parallel fetch: bundle + suprema + library + planned + settings
  // ---------------------------------------------------------------------------
  const responseWarnings: string[] = [];

  const bundlePromise = playerBundleCache.getOrLoad(req.userId, lookbackDays);
  const supremaPromise = wantsSuprema
    ? getSupremaTournaments(date).catch((err: Error) => {
        console.error('selector: getSupremaTournaments failed for date', date, err);
        responseWarnings.push("suprema_unavailable");
        return [] as any[];
      })
    : Promise.resolve([] as any[]);
  // CRITICAL #3: usar getTournamentLibraryEntries (entries reais da tabela)
  // em vez de getTournamentLibrary (que agrupa o historico para o dashboard).
  const libraryPromise = wantsLibrary
    ? Promise.resolve(storage.getTournamentLibraryEntries(req.userId)).catch((err: Error) => {
        console.error('selector: getTournamentLibraryEntries failed for user', req.userId, err);
        return [] as any[];
      })
    : Promise.resolve([] as any[]);
  // MEDIUM #9: catches que logam o erro em vez de silenciar
  const plannedPromise = Promise.resolve(storage.getPlannedTournaments(req.userId)).catch((err: Error) => {
    console.error('selector: getPlannedTournaments failed for user', req.userId, err);
    return [] as any[];
  });
  const settingsPromise = Promise.resolve(storage.getUserSettings(req.userId)).catch((err: Error) => {
    console.error('selector: getUserSettings failed for user', req.userId, err);
    return undefined;
  });
  // Sprint D / RF-03.4 (ADR-186) — tickets ativos para boost + bypass.
  // Best-effort: falha -> [] (selector continua funcionando sem boost).
  const ticketsPromise = Promise.resolve(
    (storage as any).getActiveTicketsByUser?.(req.userId) ?? [],
  ).catch((err: Error) => {
    console.error('selector: getActiveTicketsByUser failed for user', req.userId, err);
    return [] as any[];
  });

  const [bundle, supremaList, libraryList, plannedList, userSettings, userTicketsRaw] = await Promise.all([
    bundlePromise,
    supremaPromise,
    libraryPromise,
    plannedPromise,
    settingsPromise,
    ticketsPromise,
  ]);
  const userTickets: any[] = Array.isArray(userTicketsRaw)
    ? userTicketsRaw.map((t: any) => ({
        id: t.id,
        userId: t.userId,
        // Adapta shape do storage cru (targetName/ticketValueUSD) para o que
        // `enrichWithTickets` espera (sourceName/valueUsd).
        sourceName: t.sourceName ?? t.targetName ?? "",
        valueUsd: t.valueUsd ?? t.ticketValueUSD ?? 0,
        expiresAt: t.expiresAt ?? null,
        status: t.status ?? "available",
      }))
    : [];

  // ---------------------------------------------------------------------------
  // Compose alreadyInGrid lookups (Q4)
  //   - Suprema: same externalId in planned of date
  //   - Library: same libraryTemplateId in planned
  // ---------------------------------------------------------------------------
  const plannedExternalIds = new Set<string>();
  const plannedLibraryIds = new Set<string>();
  for (const p of (plannedList || []) as any[]) {
    if (p?.externalId) plannedExternalIds.add(p.externalId);
    if (p?.libraryTemplateId) plannedLibraryIds.add(p.libraryTemplateId);
  }

  // ---------------------------------------------------------------------------
  // Bankroll (RF-10 Sprint 2): soft + hard limits via computeThresholds.
  // HIGH #7: bankrollAmount esta sempre em USD - documentado no schema.
  // ---------------------------------------------------------------------------
  const bankrollAmountStr = userSettings?.bankrollAmount;
  const bankrollAmount = bankrollAmountStr != null ? parseFloat(bankrollAmountStr) : null;
  const bankrollConfigured = bankrollAmount != null && !Number.isNaN(bankrollAmount) && bankrollAmount > 0;
  const bankrollRule = userSettings?.bankrollRule ?? "1pct";
  const thresholds = bankrollConfigured
    ? computeThresholds({ amount: bankrollAmount as number, rule: bankrollRule })
    : null;
  const softLimitUSD = thresholds?.softLimitUSD ?? null;
  const hardLimitUSD = thresholds?.hardLimitUSD ?? null;

  // Exchange rates (default vazio -> currencyNormalizer cai para DEFAULT_EXCHANGE_RATES)
  const exchangeRates: Record<string, number> = (userSettings?.exchangeRates as any) || {};

  // ---------------------------------------------------------------------------
  // Score every tournament
  // ---------------------------------------------------------------------------
  const totalAvailable = (supremaList?.length || 0) + (libraryList?.length || 0);

  const scored: SelectorTournament[] = [];

  // Sprint D / RF-03.4 (ADR-186) — tickets bypass do bankroll filter.
  // Quando torneio tem availableTicket, bankrollOk=true (ja vai cair na
  // grade S com boost +10 — bankroll nao impede).
  function bankrollBandOf(buyInUSD: number, availableTicket?: any | null): {
    bankrollOk: boolean;
    warning: "out_of_bankroll" | "out_of_bankroll_soft" | null;
  } {
    if (availableTicket != null) {
      return { bankrollOk: true, warning: null };
    }
    if (!bankrollConfigured || softLimitUSD == null || hardLimitUSD == null) {
      return { bankrollOk: true, warning: null };
    }
    if (buyInUSD <= softLimitUSD) {
      return { bankrollOk: true, warning: null };
    }
    if (buyInUSD <= hardLimitUSD) {
      return { bankrollOk: true, warning: "out_of_bankroll_soft" };
    }
    return { bankrollOk: false, warning: "out_of_bankroll" };
  }

  // Fase F #12 (ADR-237 D-6) — softness best-effort. Erro no detector ->
  // softness null + log ANTES do fallback (lesson #9); selector segue 200.
  function softnessFor(
    built: ScoringBuildResult,
    rawGuaranteed: unknown,
  ): SoftnessResult | null {
    try {
      const gtdNum = parseFloat(String(rawGuaranteed ?? "0"));
      const guaranteedUSD = normalizeBuyInToUSD(
        Number.isFinite(gtdNum) ? gtdNum : 0,
        built.currency,
        exchangeRates,
      );
      return computeSoftness({
        name: built.sct.name,
        site: built.sct.site,
        buyInUSD: built.buyInUSD,
        guaranteedUSD,
        timeOfDayBucket: built.sct.timeOfDayBucket,
      });
    } catch (err) {
      console.error(
        "[tournament-selector] computeSoftness falhou; softness=null (best-effort)",
        err,
      );
      return null;
    }
  }

  for (const s of (supremaList || []) as any[]) {
    const built = buildSupremaScoringInput(s, date, exchangeRates);
    // Sprint D / RF-03.4 — enriquece SCT com availableTicket antes do score.
    const enrichedSct = enrichWithTickets(built.sct, userTickets, {
      name: built.sct.name,
      date,
      buyInUsd: built.buyInUSD,
    });
    const baseResult = computeTournamentScore(enrichedSct, bundle, { lookbackDays });
    const boosted = applyTicketBoost(
      { score: baseResult.score, grade: baseResult.grade },
      enrichedSct,
    );
    const band = bankrollBandOf(built.buyInUSD, enrichedSct.availableTicket);
    const mergedWarnings = band.warning
      ? [...(baseResult.warnings ?? []), band.warning]
      : baseResult.warnings;

    scored.push({
      id: built.sct.id,
      source: "suprema",
      name: built.sct.name,
      site: built.sct.site,
      buyIn: built.buyInRaw,         // exibimos a moeda nativa (BRL para Suprema)
      buyInUSD: built.buyInUSD,      // TS-C (UX 2026-04-24): usado pelo card para delta de bankroll
      guaranteed: parseFloat(s.guaranteed ?? "0") || undefined,
      startTime: s.startTime ? new Date(s.startTime).toISOString() : undefined,
      time: built.sct.time,
      dayOfWeek: built.sct.dayOfWeek,
      category: built.sct.category,
      speed: built.sct.speed,
      gameType: s.gameType ?? null,
      fieldSizeEstimate: built.sct.fieldSizeEstimate,
      lateRegMinutes: s.lateRegMinutes ?? null,
      startingStack: s.startingStack ?? null,
      blindLevelMinutes: s.blindLevelMinutes ?? null,
      score: boosted.score,
      grade: boosted.grade,
      confidence: baseResult.confidence,
      rationale: baseResult.rationale,
      signals: baseResult.signals,
      warnings: mergedWarnings,
      bankrollOk: band.bankrollOk,
      alreadyInGrid: built.sct.id ? plannedExternalIds.has(built.sct.id) : false,
      // Sprint D / RF-03.4 — passa ticket info pro UI badge.
      availableTicket: enrichedSct.availableTicket ?? null,
      ticketBoost: boosted.ticketBoost ?? 0,
      softness: softnessFor(built, s.guaranteed),
    } as any);
  }

  for (const l of (libraryList || []) as any[]) {
    const built = libraryToScoringInputForDate(l, date, exchangeRates);
    if (!built) continue;
    const enrichedSct = enrichWithTickets(built.sct, userTickets, {
      name: built.sct.name,
      date,
      buyInUsd: built.buyInUSD,
    });
    const baseResult = computeTournamentScore(enrichedSct, bundle, { lookbackDays });
    const boosted = applyTicketBoost(
      { score: baseResult.score, grade: baseResult.grade },
      enrichedSct,
    );
    const band = bankrollBandOf(built.buyInUSD, enrichedSct.availableTicket);
    const mergedWarnings = band.warning
      ? [...(baseResult.warnings ?? []), band.warning]
      : baseResult.warnings;

    scored.push({
      id: built.sct.id,
      source: "library",
      name: built.sct.name,
      site: built.sct.site,
      buyIn: built.buyInRaw,
      buyInUSD: built.buyInUSD,      // TS-C (UX 2026-04-24)
      time: built.sct.time,
      dayOfWeek: built.sct.dayOfWeek,
      category: built.sct.category,
      speed: built.sct.speed,
      fieldSizeEstimate: built.sct.fieldSizeEstimate,
      score: boosted.score,
      grade: boosted.grade,
      confidence: baseResult.confidence,
      rationale: baseResult.rationale,
      signals: baseResult.signals,
      warnings: mergedWarnings,
      bankrollOk: band.bankrollOk,
      alreadyInGrid: plannedLibraryIds.has(l.id),
      availableTicket: enrichedSct.availableTicket ?? null,
      ticketBoost: boosted.ticketBoost ?? 0,
      softness: softnessFor(built, l.guaranteed),
    } as any);
  }

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------
  let filtered = scored;

  if (minScore > 0) {
    filtered = filtered.filter((t) => t.score >= minScore);
  }

  if (minSample > 0) {
    filtered = filtered.filter((t) => {
      const buyS = t.signals.buyInRoi.sample;
      const catS = t.signals.categoryRoi.sample;
      return buyS >= minSample && catS >= minSample;
    });
  }

  // Sprint TS-3 RF-04 (ADR-178): tristate substitui filter booleano.
  // - mode='hide'  -> omite above_hard_limit (band.bankrollOk=false).
  // - mode='warn'  -> mantem todos + anexa bankrollWarning quando relevante.
  // - mode='all'   -> sem filtro nem warning.
  // bankrollOk continua usado p/ legacy "out_of_bankroll" warning string.
  const brRules: BankrollRules = {
    bankrollConfigured,
    bankrollAmountUSD: bankrollConfigured ? (bankrollAmount as number) : null,
    rule: bankrollRule,
    softLimitUSD,
    hardLimitUSD,
    rulePct: thresholds?.rulePct ?? 0,
  };
  const applied = applyBankrollMode(
    filtered.map((t) => ({ ...t, buyInUSD: t.buyInUSD ?? t.buyIn ?? 0 })),
    brRules,
    bankrollMode,
  );
  filtered = applied.tournaments as any;

  // Sort: score DESC -> confidence DESC -> startTime ASC
  const confRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const cr = (confRank[b.confidence] ?? 0) - (confRank[a.confidence] ?? 0);
    if (cr !== 0) return cr;
    return (a.startTime ?? a.time).localeCompare(b.startTime ?? b.time);
  });

  // ---------------------------------------------------------------------------
  // Player profile
  // ---------------------------------------------------------------------------
  const coldStart = classifyColdStart(bundle.totalTournaments);
  const playerProfile: SelectorPlayerProfile = {
    totalTournaments: bundle.totalTournaments,
    lookbackDays,
    lookbackTournaments: bundle.lookbackTournaments,
    coldStart,
    overallRoi: bundle.overallRoi,
  };

  const response: TournamentSelectorResponse = {
    date,
    playerProfile,
    tournaments: filtered,
    totalAvailable,
    totalReturned: filtered.length,
    generatedAt: new Date().toISOString(),
    cacheHit: false,
    bankrollConfigured,
    bankrollThresholdUSD: softLimitUSD,
    bankrollHardLimitUSD: hardLimitUSD,
    warnings: responseWarnings,
  };

  // Cache result — Sprint TS-3 HIGH-2: dual-write.
  // 1. Shared cache (Coach tool le do mesmo storage).
  setTournamentSelectorCache(sharedCacheKey, response);
  // 2. Legacy cache (back-compat: invalidations cross-system continuam wired).
  selectorCache.set(req.userId, date, sources, lookbackDays, filtersHash, response);

  // Async log: view. Sprint TS-3 RF-04: metadata agora carrega `bankrollMode`
  // + `invokedBy: 'widget'` (DRY com Coach tool via buildSelectorTelemetryMetadata).
  // Mantemos a chamada direta a `storage.insertSelectorLog` (back-compat com
  // testes que espionam o mock — helper logSelectorEvent reimporta o storage
  // num microtask adicional, quebra timing dos testes legados).
  const telemetryMetadata = buildSelectorTelemetryMetadata({
    bankrollMode,
    invokedBy: "widget",
    source: sources,
    cacheHit: false,
    totalReturned: response.totalReturned,
    filtersApplied: {
      sources,
      minScore,
      minSample,
      bankrollFilter,
      lookbackDays,
    },
  });
  Promise.resolve().then(async () => {
    try {
      await storage.insertSelectorLog({
        userId: req.userId,
        eventType: "view",
        metadata: telemetryMetadata,
      });
    } catch (err) {
      // Nunca bloqueia response (lesson #9: logue antes de fallback).
      console.error('selector: insertSelectorLog (view) failed for user', req.userId, err);
    }
  });

  return response;
}

// =============================================================================
// Express route registration
//
// HIGH #6: Rate limiter dedicado por usuario (30 req/min) — spec RF-01.
// =============================================================================

const selectorRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Muitas requisicoes ao Tournament Selector. Tente novamente em 1 minuto.',
  },
});

export function registerTournamentSelectorRoutes(app: Express): void {
  app.get("/api/tournament-selector", requireAuth, selectorRateLimit, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const date = (req.query.date as string) || undefined;
      const sources = (req.query.sources as string) || undefined;
      const minScore = req.query.minScore ? parseInt(String(req.query.minScore), 10) : undefined;
      const minSample = req.query.minSample ? parseInt(String(req.query.minSample), 10) : undefined;
      // Sprint TS-3 RF-04 (ADR-178): bankrollMode primario; bankrollFilter alias deprecated.
      const rawMode = req.query.bankrollMode as string | undefined;
      const bankrollMode =
        rawMode === "all" || rawMode === "hide" || rawMode === "warn"
          ? (rawMode as BankrollMode)
          : undefined;
      const bankrollFilter =
        bankrollMode != null
          ? undefined
          : req.query.bankrollFilter === "true"
            ? true
            : req.query.bankrollFilter === "false"
              ? false
              : undefined;
      const lookbackDays = req.query.lookbackDays ? parseInt(String(req.query.lookbackDays), 10) : undefined;

      const response = await handleTournamentSelector({
        userId,
        date,
        sources,
        minScore,
        minSample,
        bankrollFilter,
        bankrollMode,
        lookbackDays,
      });
      res.json(response);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.startsWith("BadRequest")) {
        return res.status(400).json({ message: msg });
      }
      if (msg.startsWith("Unauthorized")) {
        return res.status(401).json({ message: msg });
      }
      console.error("Tournament Selector failed:", err);
      res.status(500).json({ message: "Failed to compute tournament selector" });
    }
  });
}
