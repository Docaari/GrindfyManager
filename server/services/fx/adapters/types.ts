/**
 * Sprint FX-1 RF-02: shared FxRow shape for adapters.
 *
 * Convencao QW-1 (ADR-033): rate per USD.
 */

export type FxAdapterSource = "bcb_ptax" | "frankfurter";

export interface FxRow {
  /** ISO 4217 currency code (BRL, EUR, ...) */
  currency: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Unidades de currency por 1 USD (convencao QW-1). */
  ratePerUsd: number;
  source: FxAdapterSource;
}
