// =============================================================================
// frankfurterClient — Sprint AI-2B / RF-04 (ADR-169 §2.6)
//
// Fallback do BCB. Stub para ser mocado em testes.
// =============================================================================

export interface FxRateRow {
  date: string;
  value: number;
}

export async function fetchFrankfurterRatesForRange(
  _from: string,
  _to: string,
): Promise<FxRateRow[]> {
  return [];
}

export default { fetchFrankfurterRatesForRange };
