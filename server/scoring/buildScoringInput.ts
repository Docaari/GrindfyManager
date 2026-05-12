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
import { BUYIN_BUCKETS, FIELD_BUCKETS, SUPREMA_CATEGORY_MAP } from "./scoringConstants";
import { normalizeBuyInToUSD } from "./currencyNormalizer";
import type {
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
