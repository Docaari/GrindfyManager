// =============================================================================
// buildScoringInput — Sprint AI-0A (HIGH-1 reviewer)
//
// Helpers compartilhados para montar o `ScoringInputTournament` que alimenta
// `computeTournamentScore`, a partir de rows CRUs de:
//   - tournament_library (entry de `storage.getTournamentLibraryEntries`)
//   - Suprema (item mapeado de `getSupremaTournaments`)
//
// Antes deste sprint a logica vivia INLINE em server/routes/tournament-selector.ts
// (funcoes `bucketBuyIn`/`bucketField`/`mapCategory`/`mapSpeed`/`safeTimeOfDayBucket`/
// `supremaToScoringInput`/`libraryToScoringInput`). Agora extraida para ser
// reutilizada pelo `tournamentScoringService` (Coach read tools) — DRY:
//   - normaliza `buyIn` (moeda nativa) -> USD com os `exchangeRates` do user;
//   - deriva `buyInBucket` do valor em USD (BUYIN_BUCKETS estao em USD);
//   - deriva `timeOfDayBucket` do `time` ("HH:mm");
//   - deriva `fieldBucket` do `fieldSize`/`maxPlayers`.
// =============================================================================

import { getTimeOfDayBucket } from "./timeOfDayBucket";
import {
  BUYIN_BUCKETS,
  FIELD_BUCKETS,
  GRADE_THRESHOLDS,
  SUPREMA_CATEGORY_MAP,
} from "./scoringConstants";
import { normalizeBuyInToUSD } from "./currencyNormalizer";
import type {
  GradeLetter,
  ScoringInputTournament,
  TimeOfDayBucket,
  FieldBucket,
  SpeedBucket,
} from "../../shared/scoring";

export interface ScoringBuildResult {
  sct: ScoringInputTournament;
  raw: any;
  buyInRaw: number; // moeda nativa
  buyInUSD: number; // normalizado para USD
  currency: string;
}

export function dayOfWeekFromDate(date: string): number {
  // Retorna 0-6 (Sunday=0)
  const d = new Date(`${date}T12:00:00Z`);
  return d.getUTCDay();
}

export function bucketBuyIn(amountUSD: number): string {
  // BUYIN_BUCKETS estao em USD. Caller deve normalizar moeda antes via normalizeBuyInToUSD.
  for (const b of BUYIN_BUCKETS) {
    if (amountUSD >= b.min && amountUSD < b.max) return b.range;
  }
  return BUYIN_BUCKETS[BUYIN_BUCKETS.length - 1].range;
}

export function bucketField(field: number | null | undefined): FieldBucket | null {
  if (field == null) return null;
  for (const b of FIELD_BUCKETS) {
    if (field >= b.min && field < b.max) return b.bucket as FieldBucket;
  }
  return null;
}

export function mapCategory(input: string | null | undefined): string | null {
  if (!input) return null;
  const mapped = SUPREMA_CATEGORY_MAP[input];
  return mapped ?? null;
}

export function mapSpeed(input: string | null | undefined): SpeedBucket {
  if (!input) return "Normal";
  if (input === "Normal" || input === "Turbo" || input === "Hyper") return input;
  return "Normal";
}

export function safeTimeOfDayBucket(time: string): TimeOfDayBucket | null {
  try {
    return getTimeOfDayBucket(time);
  } catch {
    return null;
  }
}

function toNumber(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Monta o SCT a partir de uma entry CRUA de `tournament_library`.
 * `tournament_library` NAO tem colunas `buyInBucket`/`timeOfDayBucket`/`fieldBucket` —
 * elas sao DERIVADAS aqui (era exatamente o bug HIGH-1: passavam undefined).
 */
export function buildLibraryScoringInput(
  l: any,
  exchangeRates: Record<string, number>,
): ScoringBuildResult {
  const buyInNum = toNumber(l.buyIn);
  const currency = l.currency ?? "USD";
  const buyInUSD = normalizeBuyInToUSD(buyInNum, currency, exchangeRates);
  const fieldSize = l.fieldSize ?? null;
  const time = l.time ?? "00:00";
  const sct: ScoringInputTournament = {
    id: l.id,
    source: "library",
    name: l.name ?? "",
    site: l.site ?? "",
    buyIn: buyInNum,
    buyInBucket: bucketBuyIn(buyInUSD),
    category: mapCategory(l.type),
    speed: mapSpeed(l.speed),
    dayOfWeek: typeof l.dayOfWeek === "number" ? l.dayOfWeek : -1,
    time,
    timeOfDayBucket: safeTimeOfDayBucket(time),
    fieldBucket: bucketField(fieldSize),
    fieldSizeEstimate: fieldSize,
  };
  return { sct, raw: l, buyInRaw: buyInNum, buyInUSD, currency };
}

// =============================================================================
// Sprint D / RF-03.4 (ADR-186) — Selector ticket boost helpers
// Camada ACIMA do tournamentScorer (PROIBIDO mexer no scorer — boost vive aqui).
// =============================================================================

interface TicketLike {
  id: string;
  sourceName: string;
  valueUsd: number | string;
  expiresAt: string | Date | null;
  status: string;
}

interface TournamentMatchHints {
  name: string;
  date: string;
  buyInUsd: number;
}

function ticketValueUsd(t: { valueUsd: number | string }): number {
  return typeof t.valueUsd === "number" ? t.valueUsd : parseFloat(String(t.valueUsd)) || 0;
}

function expiresAtMs(expiresAt: string | Date | null | undefined): number | null {
  if (expiresAt == null) return null;
  return (expiresAt instanceof Date ? expiresAt : new Date(expiresAt)).getTime();
}

// Duplicacao DELIBERADA do `scoreToGrade` em server/scoring/tournamentScorer.ts:
// ADR-186 §2.4 PROIBE alterar o scorer. O boost de ticket vive nesta camada
// acima, entao re-implementamos a derivacao de grade aqui.
function scoreToGradeLocal(score: number): GradeLetter {
  if (score >= GRADE_THRESHOLDS.S) return "S";
  if (score >= GRADE_THRESHOLDS.A) return "A";
  if (score >= GRADE_THRESHOLDS.B) return "B";
  if (score >= GRADE_THRESHOLDS.C) return "C";
  return "D";
}

function pickShape(t: TicketLike): { id: string; valueUsd: number; expiresAt: string | null } {
  const exp = t.expiresAt
    ? (t.expiresAt instanceof Date ? t.expiresAt.toISOString() : String(t.expiresAt))
    : null;
  return {
    id: t.id,
    valueUsd: ticketValueUsd(t),
    expiresAt: exp,
  };
}

/**
 * Match heuristica ticket <-> torneio (ADR-186 §2.2).
 * 1) exact: sourceName casa nome do torneio (case-insensitive substring).
 * 2) value: |valueUsd - buyInUsd| / buyInUsd < 1%.
 * Desempate FIFO: menor expiresAt vence.
 * Filtros: status='available' + (expiresAt nulo OU > tournament.date).
 */
function matchTicket(
  tournament: TournamentMatchHints,
  userTickets: TicketLike[]
): TicketLike | null {
  if (!Array.isArray(userTickets) || userTickets.length === 0) return null;
  const tournamentMs = new Date(tournament.date).getTime();
  const candidates = userTickets.filter((t) => {
    if (t.status !== "available") return false;
    const exp = expiresAtMs(t.expiresAt);
    return exp == null || exp > tournamentMs;
  });
  if (candidates.length === 0) return null;

  // Desempate FIFO — menor expiresAt vence; tickets sem prazo (Infinity) vao pro fim.
  const sortedByExpiry = [...candidates].sort(
    (a, b) => (expiresAtMs(a.expiresAt) ?? Infinity) - (expiresAtMs(b.expiresAt) ?? Infinity)
  );

  const tournName = (tournament.name ?? "").toLowerCase();
  const exact = sortedByExpiry.find((t) => {
    const sn = (t.sourceName ?? "").toLowerCase();
    if (!sn) return false;
    return tournName.includes(sn) || sn.includes(tournName);
  });
  if (exact) return exact;

  if (tournament.buyInUsd > 0) {
    const valueMatch = sortedByExpiry.find((t) => {
      const delta = Math.abs(ticketValueUsd(t) - tournament.buyInUsd);
      return delta / tournament.buyInUsd < 0.01;
    });
    if (valueMatch) return valueMatch;
  }
  return null;
}

/**
 * Enriquece o SCT com `availableTicket` quando ha match. No-op caso contrario.
 *
 * FOLLOW-UP (reviewer NIT-3): heuristica atual eh exact substring OR value match
 * 1%. Pode haver falso-positivo em torneios com nomes muito genericos (ex:
 * sourceName="Daily" matching todo torneio chamado "Daily $5"). Considerar:
 *   - normalizar accents/whitespace antes do compare.
 *   - exigir match de site quando sourceName for muito curto (<4 chars).
 *   - permitir override manual via ticket.targetTemplateId quando presente.
 * Deixado simples por enquanto pq cron de housekeeping cobre o caso 99%.
 */
export function enrichWithTickets(
  sct: ScoringInputTournament,
  userTickets: TicketLike[],
  tournament: TournamentMatchHints
): ScoringInputTournament {
  const match = matchTicket(tournament, userTickets);
  if (!match) return sct;
  return { ...sct, availableTicket: pickShape(match) };
}

const TICKET_SCORE_BOOST = 10;

/**
 * Aplica +10 score (clamp 100) e re-deriva grade quando `availableTicket` presente.
 * Sem ticket: retorna { ...base, ticketBoost: 0 }. Nao toca em `computeTournamentScore`.
 */
export function applyTicketBoost<
  T extends { score: number; grade: GradeLetter }
>(
  base: T,
  sct: ScoringInputTournament
): T & { ticketBoost: number } {
  if (!sct.availableTicket) {
    return { ...base, ticketBoost: 0 };
  }
  const score = Math.min(100, base.score + TICKET_SCORE_BOOST);
  return { ...base, score, grade: scoreToGradeLocal(score), ticketBoost: TICKET_SCORE_BOOST };
}

/**
 * Bankroll filter com bypass por ticket. Torneio acima de maxBuyIn passa quando
 * tem ticket disponivel (effectiveBuyIn real com ticket = 0).
 */
export function shouldPassBankrollFilter(opts: {
  effectiveBuyIn: number;
  maxBuyIn: number;
  availableTicket?: { id: string; valueUsd: number; expiresAt: string | null } | null;
}): boolean {
  if (opts.availableTicket != null) return true;
  return opts.effectiveBuyIn <= opts.maxBuyIn;
}

/**
 * Monta o SCT a partir de um item Suprema mapeado.
 * Suprema entrega buy-ins em BRL — convertidos para USD aqui.
 */
export function buildSupremaScoringInput(
  s: any,
  date: string,
  exchangeRates: Record<string, number>,
): ScoringBuildResult {
  const buyInNum = toNumber(s.buyIn);
  const currency = s.currency ?? "BRL";
  const buyInUSD = normalizeBuyInToUSD(buyInNum, currency, exchangeRates);
  const fieldSize = s.maxPlayers ?? null;
  const time = s.time ?? "00:00";
  const dow = typeof s.dayOfWeek === "number" ? s.dayOfWeek : dayOfWeekFromDate(date);
  const sct: ScoringInputTournament = {
    id: s.externalId ?? `suprema-${s.id ?? Math.random()}`,
    source: "suprema",
    name: s.name ?? "",
    site: s.site ?? "Suprema",
    buyIn: buyInNum,
    buyInBucket: bucketBuyIn(buyInUSD),
    category: mapCategory(s.type),
    speed: mapSpeed(s.speed),
    dayOfWeek: dow,
    time,
    timeOfDayBucket: safeTimeOfDayBucket(time),
    fieldBucket: bucketField(fieldSize),
    fieldSizeEstimate: fieldSize,
  };
  return { sct, raw: s, buyInRaw: buyInNum, buyInUSD, currency };
}
