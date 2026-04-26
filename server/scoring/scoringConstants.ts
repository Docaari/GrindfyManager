// FX CONVENTION: rates[ccy] = ccy units per 1 USD. See ADR-033.
/**
 * Tournament Selector — Scoring Constants
 *
 * Constantes do algoritmo de scoring (RF-02). Centralizadas aqui para facilitar
 * calibragem futura sem mexer na funcao computeTournamentScore.
 *
 * Spec: docs/specs/tournament-selector.md
 */

// =============================================================================
// Pesos dos 7 sinais (somam 1.0)
// =============================================================================
export const WEIGHTS = {
  siteRoi: 0.20,
  buyInRoi: 0.20,
  categoryRoi: 0.20,
  speedRoi: 0.10,
  dayOfWeekRoi: 0.10,
  timeOfDayRoi: 0.15,
  fieldRoi: 0.05,
} as const;

// Bayesian shrinkage K (literatura para alta variancia)
export const SHRINK_CONSTANT = 30;

// Limiares de grade
export const GRADE_THRESHOLDS = {
  S: 85,
  A: 70,
  B: 55,
  C: 40,
} as const;

// Limiares de cold start
export const COLD_START_PURE_THRESHOLD = 20;     // < 20 = heuristica pura
export const COLD_START_PARTIAL_THRESHOLD = 50;  // 20-49 = full + flag

// =============================================================================
// Buckets de buy-in (em USD; mutuamente exclusivos, cobrem dominio)
// =============================================================================
export const BUYIN_BUCKETS: Array<{ range: string; min: number; max: number }> = [
  { range: "$0-1.99", min: 0, max: 2 },
  { range: "$2-4.99", min: 2, max: 5 },
  { range: "$5-10.99", min: 5, max: 11 },
  { range: "$11-21.99", min: 11, max: 22 },
  { range: "$22-54.99", min: 22, max: 55 },
  { range: "$55-109.99", min: 55, max: 110 },
  { range: "$110-219.99", min: 110, max: 220 },
  { range: "$220+", min: 220, max: Number.POSITIVE_INFINITY },
];

// =============================================================================
// Buckets de turno (5 buckets, cobrem 0-23)
// =============================================================================
export const TIME_OF_DAY_BUCKETS: Array<{ bucket: string; startHour: number; endHour: number }> = [
  { bucket: "madrugada", startHour: 0, endHour: 5 },
  { bucket: "manha", startHour: 6, endHour: 11 },
  { bucket: "tarde", startHour: 12, endHour: 17 },
  { bucket: "noite-cedo", startHour: 18, endHour: 20 },
  { bucket: "noite-nobre", startHour: 21, endHour: 23 },
];

// =============================================================================
// Buckets de field size (4 buckets)
// =============================================================================
export const FIELD_BUCKETS: Array<{ bucket: string; min: number; max: number }> = [
  { bucket: "pequeno", min: 0, max: 100 },
  { bucket: "medio", min: 100, max: 500 },
  { bucket: "grande", min: 500, max: 2000 },
  { bucket: "massivo", min: 2000, max: Number.POSITIVE_INFINITY },
];

// =============================================================================
// Cold start bonuses (Q5) - heuristica fixa para totalTournaments < 20
// Base = 50; somar bonuses; clamp 0-100.
// =============================================================================
export const COLD_START_BONUSES = {
  speed: {
    Normal: 15,
    Turbo: 5,
    Hyper: -10,
  } as Record<string, number>,
  field: {
    pequeno: 5,
    medio: 10,
    grande: 0,
    massivo: -5,
  } as Record<string, number>,
  timeOfDay: {
    madrugada: 0,
    manha: 0,
    tarde: 0,
    "noite-cedo": 0,
    "noite-nobre": 5,
  } as Record<string, number>,
};

// =============================================================================
// Mapeamento de category vindo da Suprema (Q6)
// Valores nao mapeados retornam undefined -> scorer trata como null e
// redistribui o peso de categoryRoi.
// =============================================================================
export const SUPREMA_CATEGORY_MAP: Record<string, string> = {
  Vanilla: "Vanilla",
  PKO: "PKO",
  Mystery: "Mystery",
  "Bounty Hunter": "PKO",
  Knockout: "PKO",
  // Phase, Satellite, etc. sao deixados sem mapeamento (vira null no scorer)
};

// =============================================================================
// Default exchange rates — convencao ADR-033 ("ccy units per 1 USD")
//
// Valor = quantas unidades da moeda equivalem a 1 USD.
// BRL=5.0 significa "1 USD vale 5 BRL".
// Conversao native -> USD: usd = native / rate.
// Conversao USD -> native: native = usd * rate.
//
// Referencia: 2026-04-25.
// =============================================================================
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  BRL: 5.0,
  EUR: 0.92,
  GBP: 0.78,
  CNY: 7.20,
  USDT: 1.0,
  // Cripto: rate < 1 e CORRETO na nova convencao (1 USD ~ 0.000015 BTC).
  BTC: 0.000015,
};
