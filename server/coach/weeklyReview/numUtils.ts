// =============================================================================
// numUtils — EST-5 / ADR-226
//
// Coercoes numericas compartilhadas pelos builders deterministicos do ritual
// (buildRecap, buildDeepAnalysisNarrative) + orquestrador. pg numeric chega como
// string em alguns paths — por isso `Number(v)` (coercao) e nao `typeof === 'number'`.
// =============================================================================

/** Number(v) com fallback quando NaN/Infinity (aceita string de pg numeric). */
export function numOr(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** ROI normalizado: null quando ausente/nao-finito; senao o numero. */
export function normalizeRoi(roiRaw: any): number | null {
  return roiRaw === null || roiRaw === undefined || !Number.isFinite(Number(roiRaw))
    ? null
    : Number(roiRaw);
}
