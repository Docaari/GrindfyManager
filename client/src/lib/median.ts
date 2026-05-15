// Helpers puros para calculo de mediana de participantes no Grade Planner.
// Spec: Docs/specs/grade-planner-mediana-participantes.md (RF-01 + RF-02).
//
// Sem dependencias React/UI — apenas funcoes puras.

/**
 * Retorna a mediana de um array numerico.
 * - Array vazio: null.
 * - Array impar: elemento central.
 * - Array par: media aritmetica dos dois elementos centrais.
 * Eh puro: NAO muta o array de entrada.
 */
export function median(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calcula o tamanho estimado do field (numero de jogadores) para um torneio
 * baseado em `Math.round(guaranteed / buyIn)`.
 *
 * Retorna null se:
 *   - guaranteed esta ausente, NaN ou <= 0.
 *   - buyIn esta ausente, NaN ou <= 0 (inclui freeroll).
 */
export function estimatedFieldSize(t: {
  guaranteed?: string | number | null;
  buyIn?: string | number | null;
}): number | null {
  if (t.guaranteed === undefined || t.guaranteed === null) return null;
  if (t.buyIn === undefined || t.buyIn === null) return null;

  const guaranteed =
    typeof t.guaranteed === "number" ? t.guaranteed : parseFloat(String(t.guaranteed));
  const buyIn =
    typeof t.buyIn === "number" ? t.buyIn : parseFloat(String(t.buyIn));

  if (!Number.isFinite(guaranteed) || guaranteed <= 0) return null;
  if (!Number.isFinite(buyIn) || buyIn <= 0) return null;

  return Math.round(guaranteed / buyIn);
}

/**
 * Aplica `estimatedFieldSize` em uma lista de torneios, filtra invalidos e
 * retorna a mediana arredondada como string formatada (ou 'N/A').
 * Usado pelos cards/dashboards do Grade Planner.
 */
export function computeMedianFieldSizeForDisplay(
  tournaments: Array<{ guaranteed?: string | number | null; buyIn?: string | number | null }>
): string {
  const estimates = tournaments
    .map((t) => estimatedFieldSize(t))
    .filter((v): v is number => v !== null);
  if (estimates.length === 0) return "N/A";
  const m = median(estimates);
  return m == null ? "N/A" : Math.round(m).toString();
}
