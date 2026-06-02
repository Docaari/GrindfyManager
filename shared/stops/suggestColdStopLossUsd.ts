/**
 * Fase D #5 — Stop-loss cold-commit (RF-02, ADR-235 D-2).
 *
 * Helper PURO: sugere o stop-loss em USD a partir de nBI × abiUsd.
 * O caller resolve ABI (storage) + FX (fxResolver) ANTES de chamar (lesson #6).
 * O helper NÃO vê FX/DB/new Date.
 *
 * Vive em `shared/` (LOW-1 layering, ADR-235): consumido pelo client (IntentionBlock)
 * e pelo server (suggestion endpoints) sem o client reachar dentro de `server/`.
 *
 * Regra (ADR-235 D-2):
 *   - abiUsd <= 0 OU não-finito (NaN/Infinity) -> null (degrada, esconde sugestão BI).
 *   - senão suggestedUsd = round2HalfUp(nBI * abiUsd).
 */

export interface ColdStopSuggestion {
  suggestedUsd: number;
}

/**
 * Round HALF-UP a 2 casas (centavos). Corrige o erro de ponto flutuante de
 * `Math.round(x * 100)` (ex.: 66.675 * 100 = 6667.4999... que arredondaria pra baixo).
 */
function round2HalfUp(value: number): number {
  const cents = value * 100;
  // Math.round é HALF-UP para positivos; aplica epsilon pra corrigir o drift de FP.
  return Math.round(cents + Number.EPSILON * Math.abs(cents)) / 100;
}

export function suggestColdStopLossUsd(
  nBI: 3 | 4 | 5,
  abiUsd: number,
): ColdStopSuggestion | null {
  if (!Number.isFinite(abiUsd) || abiUsd <= 0) return null;
  return { suggestedUsd: round2HalfUp(nBI * abiUsd) };
}
