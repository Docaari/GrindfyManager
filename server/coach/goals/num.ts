// =============================================================================
// server/coach/goals/num.ts — Metas 4DX (ADR-229)
//
// Coercao numerica tolerante a `string` de coluna `numeric` do pg (parseFloat
// na boundary). NUNCA usar `coerceFiniteNumber` (shared/numCoerce.ts) aqui: aquele
// helper e strict `typeof === "number"` e rejeitaria as strings que o driver pg
// entrega para colunas NUMERIC. Dedup das 3 copias antes espalhadas
// (routes/goals.ts, aggregateCurrentValue.ts, countFromRows).
// =============================================================================

/** parseFloat na boundary (numeric do pg = string). NUNCA Number() cego. */
export function num(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const parsed = parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
}
