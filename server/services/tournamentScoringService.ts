// =============================================================================
// tournamentScoringService — Sprint AI-0A (ADR-147 §1; reforcado HIGH-1 reviewer)
//
// Extracao DRY da logica de scoring de torneios para ser reutilizada pelas
// read tools do Coach (get_tournament_suggestions / explain_tournament_score)
// SEM duplicar a formula:
//   - `computeTournamentScore` (server/scoring/tournamentScorer) continua sendo
//     a unica fonte do calculo de score;
//   - os builders de `ScoringInputTournament` vivem em
//     server/scoring/buildScoringInput.ts (compartilhados com
//     server/routes/tournament-selector.ts) — fazem a bucketizacao correta
//     (buyIn -> USD, buyInBucket do USD, timeOfDayBucket do time, fieldBucket
//     do fieldSize). Antes do reviewer este service montava um SCT "casca"
//     (passava undefined nos buckets + buyIn em moeda nativa) -> scores errados.
//
// Exports:
//   - rankTournamentsForContext(userId, opts) -> RankedSuggestion[]
//   - explainScoreForTournament(userId, ref)  -> ScoreBreakdown
//
// Fontes candidatas: torneios da biblioteca pessoal (`getTournamentLibraryEntries`)
// + agenda Suprema do dia (`getSupremaTournaments`, best-effort — falha => so library).
//
// Ownership: lookups em explainScoreForTournament validam userId; id inexistente
// ou de outro user => throw "tournament_not_found" (handler converte).
// =============================================================================

import { computeTournamentScore } from "../scoring/tournamentScorer";
import type { PlayerAnalyticsBundle } from "../scoring/tournamentScorer";
import {
  buildLibraryScoringInput,
  buildSupremaScoringInput,
  dayOfWeekFromDate,
  type ScoringBuildResult,
} from "../scoring/buildScoringInput";

const DEFAULT_LOOKBACK_DAYS = 180;

export interface RankTournamentsOpts {
  date?: string;
  dayOfWeek?: number;
  profile?: "A" | "B" | "C";
  maxBuyIn?: number; // em USD
  limit?: number;
  /** Best-effort: inclui a agenda Suprema do dia. Default true. */
  includeSuprema?: boolean;
}

export interface RankedSuggestion {
  id: string;
  name: string;
  site: string;
  buyIn: number;
  buyInUSD: number;
  type: string | null;
  speed: string | null;
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
  confidence: "low" | "medium" | "high";
  rationale: string;
}

export interface TournamentRef {
  tournamentId?: string;
  libraryTemplateId?: string;
  plannedTournamentId?: string;
}

export interface ScoreBreakdownSignal {
  signalName: string;
  weight: number;
  value: number;
  contribution: number;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

export interface ScoreBreakdown {
  tournamentRef: { kind: "tournament" | "library" | "planned"; id: string; name: string; site: string };
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
  confidence: "low" | "medium" | "high";
  breakdown: ScoreBreakdownSignal[];
  rationale: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Normaliza o bundle vindo do cache para garantir que computeTournamentScore
 * nao quebre acessando arrays ausentes (defensivo — NAO recalcula nada).
 */
function normalizeBundle(bundle: any): PlayerAnalyticsBundle {
  const b = bundle ?? {};
  return {
    totalTournaments: Number(b.totalTournaments ?? 0),
    lookbackTournaments: Number(b.lookbackTournaments ?? b.totalTournaments ?? 0),
    lookbackDays: Number(b.lookbackDays ?? DEFAULT_LOOKBACK_DAYS),
    overallRoi: Number(b.overallRoi ?? 0),
    bySite: Array.isArray(b.bySite) ? b.bySite : [],
    byBuyIn: Array.isArray(b.byBuyIn) ? b.byBuyIn : [],
    byCategory: Array.isArray(b.byCategory) ? b.byCategory : [],
    bySpeed: Array.isArray(b.bySpeed) ? b.bySpeed : [],
    byDayOfWeek: Array.isArray(b.byDayOfWeek) ? b.byDayOfWeek : [],
    byTimeOfDay: Array.isArray(b.byTimeOfDay) ? b.byTimeOfDay : [],
    byField: Array.isArray(b.byField) ? b.byField : [],
  };
}

// NIT-7: per-signal confidence usa o mesmo K=30 do shrinkage Bayesian do scorer
// (SHRINK_CONSTANT em server/scoring/scoringConstants.ts). N>=30 = a estimativa
// do bucket "venceu" o prior (peso shrunk >= 50/50); 15<=N<30 = meio-termo;
// N<15 = ainda dominado pelo prior. Mantem coerencia com a confianca agregada
// do scorer (que tambem usa thresholds 30/15 sobre buyIn/category sample).
function signalConfidence(sampleSize: number): "low" | "medium" | "high" {
  if (sampleSize >= 30) return "high";
  if (sampleSize >= 15) return "medium";
  return "low";
}

function num(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function buildBreakdownFromSignals(signals: any): ScoreBreakdownSignal[] {
  const out: ScoreBreakdownSignal[] = [];
  for (const key of Object.keys(signals ?? {})) {
    const s = signals[key];
    if (!s) continue;
    const weight = num(s.weight);
    const value = num(s.score);
    const sampleSize = num(s.sample);
    out.push({
      signalName: key,
      weight,
      value,
      contribution: Math.round(value * weight * 100) / 100,
      sampleSize,
      confidence: signalConfidence(sampleSize),
    });
  }
  return out;
}

async function getStorage(): Promise<any> {
  const mod: any = await import("../storage");
  return mod.storage;
}

async function getBundleCache(): Promise<any> {
  const mod: any = await import("./playerBundle");
  return mod.playerBundleCache;
}

async function getExchangeRates(storage: any, userId: string): Promise<Record<string, number>> {
  try {
    const settings = await storage.getUserSettings?.(userId);
    const rates = settings?.exchangeRates;
    return rates && typeof rates === "object" ? (rates as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function fetchSupremaSafe(date: string): Promise<any[]> {
  try {
    const mod: any = await import("../supremaService");
    const list = await mod.getSupremaTournaments(date);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    // Best-effort: Suprema offline / sem rede => so a biblioteca pessoal.
    console.error("tournamentScoringService.suprema_fetch_failed", { date, err });
    return [];
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// rankTournamentsForContext
// -----------------------------------------------------------------------------

export async function rankTournamentsForContext(
  userId: string,
  opts: RankTournamentsOpts = {},
): Promise<RankedSuggestion[]> {
  const storage = await getStorage();
  const bundleCache = await getBundleCache();
  const lookbackDays = DEFAULT_LOOKBACK_DAYS;
  const date = opts.date ?? todayISO();
  const includeSuprema = opts.includeSuprema !== false;
  // Dia da semana alvo: explicito > derivado da data.
  const targetDow =
    typeof opts.dayOfWeek === "number"
      ? opts.dayOfWeek
      : opts.date != null
        ? dayOfWeekFromDate(date)
        : null;

  const [rawBundle, libEntries, supremaList, exchangeRates] = await Promise.all([
    bundleCache.getOrLoad(userId, lookbackDays),
    Promise.resolve(storage.getTournamentLibraryEntries(userId)).catch((err: any) => {
      console.error("tournamentScoringService.library_fetch_failed", { userId, err });
      return [] as any[];
    }),
    includeSuprema ? fetchSupremaSafe(date) : Promise.resolve([] as any[]),
    getExchangeRates(storage, userId),
  ]);
  const bundle = normalizeBundle(rawBundle);
  const library: any[] = Array.isArray(libEntries) ? libEntries : [];
  const suprema: any[] = Array.isArray(supremaList) ? supremaList : [];

  const maxBuyIn = opts.maxBuyIn;
  const profile = opts.profile;

  const built: ScoringBuildResult[] = [];
  for (const l of library) {
    // Filtro de dia: so torneios cujo dayOfWeek bate (quando ha alvo).
    if (l.dayOfWeek == null) continue;
    if (targetDow != null && l.dayOfWeek !== targetDow) continue;
    // Filtro de profile: aplicado so se a entry expoe um profile.
    if (profile != null && l.profile != null && l.profile !== profile) continue;
    built.push(buildLibraryScoringInput(l, exchangeRates));
  }
  for (const s of suprema) {
    built.push(buildSupremaScoringInput(s, date, exchangeRates));
  }

  const scored: RankedSuggestion[] = [];
  for (const b of built) {
    if (maxBuyIn != null && b.buyInUSD > maxBuyIn) continue;
    const result = computeTournamentScore(b.sct, bundle, { lookbackDays });
    scored.push({
      id: b.sct.id,
      name: b.sct.name,
      site: b.sct.site,
      buyIn: b.buyInRaw,
      buyInUSD: b.buyInUSD,
      type: (b.sct.category ?? (b.raw?.type ?? null)) as string | null,
      speed: b.sct.speed ?? null,
      score: result.score,
      grade: result.grade,
      confidence: result.confidence,
      rationale: result.rationale,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// -----------------------------------------------------------------------------
// explainScoreForTournament
// -----------------------------------------------------------------------------

async function resolveTournamentEntry(
  storage: any,
  userId: string,
  ref: TournamentRef,
): Promise<{ kind: "tournament" | "library" | "planned"; id: string; entry: any }> {
  if (ref.libraryTemplateId) {
    const tmpl = await storage.getLibraryTemplate(ref.libraryTemplateId);
    if (!tmpl) throw new Error("tournament_not_found");
    if (tmpl.userId && tmpl.userId !== userId) throw new Error("tournament_not_found");
    return { kind: "library", id: ref.libraryTemplateId, entry: tmpl };
  }
  if (ref.tournamentId) {
    const t = await storage.getTournament(ref.tournamentId);
    if (!t) throw new Error("tournament_not_found");
    if (t.userId && t.userId !== userId) throw new Error("tournament_not_found");
    return { kind: "tournament", id: ref.tournamentId, entry: t };
  }
  if (ref.plannedTournamentId) {
    const p = await storage.getPlannedTournament(ref.plannedTournamentId);
    if (!p) throw new Error("tournament_not_found");
    if (p.userId && p.userId !== userId) throw new Error("tournament_not_found");
    return { kind: "planned", id: ref.plannedTournamentId, entry: p };
  }
  throw new Error("tournament_not_found");
}

export async function explainScoreForTournament(
  userId: string,
  ref: TournamentRef,
): Promise<ScoreBreakdown> {
  const storage = await getStorage();
  const bundleCache = await getBundleCache();
  const lookbackDays = DEFAULT_LOOKBACK_DAYS;

  const { kind, id, entry } = await resolveTournamentEntry(storage, userId, ref);
  const [rawBundle, exchangeRates] = await Promise.all([
    bundleCache.getOrLoad(userId, lookbackDays),
    getExchangeRates(storage, userId),
  ]);
  const bundle = normalizeBundle(rawBundle);

  // O entry pode ser de `tournaments` (historico jogado), `tournament_library`
  // ou `planned_tournaments`. Em todos os casos os campos relevantes
  // (buyIn/currency/type/speed/time/fieldSize/dayOfWeek) tem nomes compativeis
  // com buildLibraryScoringInput — reusamos ele (a `source` no SCT nao afeta o score).
  const built = buildLibraryScoringInput(entry, exchangeRates);
  const result = computeTournamentScore(built.sct, bundle, { lookbackDays });
  const breakdown = buildBreakdownFromSignals(result.signals);

  return {
    tournamentRef: {
      kind,
      id,
      name: entry.name ?? "",
      site: entry.site ?? "",
    },
    score: result.score,
    grade: result.grade,
    confidence: result.confidence,
    breakdown,
    rationale: result.rationale,
  };
}
