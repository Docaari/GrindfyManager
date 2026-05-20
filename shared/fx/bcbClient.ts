// =============================================================================
// bcbClient — Sprint AI-2B / RF-04 (ADR-169 §2.6)
//
// Cliente leve para Banco Central do Brasil (PTAX). Stub para ser mocado em
// testes; em produção uma chamada HTTP real seria implementada. Por ora retorna
// array vazio (sem rates) — fxCascade vai cair no frankfurter fallback.
// =============================================================================

export interface FxRateRow {
  date: string; // YYYY-MM-DD
  value: number;
}

export async function fetchBcbRatesForRange(
  _from: string,
  _to: string,
): Promise<FxRateRow[]> {
  // Stub: implementação real chamaria a API PTAX do BCB.
  // Em testes, esse módulo é mocado via vi.doMock.
  return [];
}

export default { fetchBcbRatesForRange };
