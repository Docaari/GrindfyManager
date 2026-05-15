/**
 * Variance KPI — shared constants (ADR-162).
 *
 * Single source of truth para variance source labels e status thresholds.
 * Importado pelo storage, route home, VarianceCard e dailyInsight rule.
 */

export const VARIANCE_SOURCE = {
  PRIMEDOPE_CACHE: 'primedope-cache',
  FALLBACK_ZERO: 'fallback-zero',
} as const;

export type VarianceSource = typeof VARIANCE_SOURCE[keyof typeof VARIANCE_SOURCE];

export const VARIANCE_STATUS = {
  LUCKY: 'lucky',
  NORMAL: 'normal',
  UNLUCKY: 'unlucky',
} as const;

export type VarianceStatus = typeof VARIANCE_STATUS[keyof typeof VARIANCE_STATUS];

// Thresholds em sigmaMultiple para classificacao de status.
// TOUGH_STRETCH e subconjunto mais severo de UNLUCKY usado pela rule
// `tough-stretch` em client/src/lib/home/dailyInsight.ts.
export const VARIANCE_THRESHOLDS = {
  LUCKY: 1,
  UNLUCKY: -1,
  TOUGH_STRETCH: -1.5,
} as const;

// Clamp do sigmaMultiple para evitar valores extremos em amostras degeneradas.
export const VARIANCE_CLAMP = {
  MIN: -10,
  MAX: 10,
} as const;
