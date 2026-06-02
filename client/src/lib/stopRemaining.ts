/**
 * Fase D #5 — Stop-loss cold-commit (RF-03, ADR-235 D-5).
 *
 * Helper PURO: calcula "quanto falta" para o stop-loss do dia.
 *
 * Sinal (ADR-235 D-5):
 *   remainingUsd = stopLossUsd != null
 *     ? stopLossUsd + currentDayDeltaUsd   // delta é NEGATIVO quando perdendo
 *     : null
 *   state:
 *     - 'no_limit' quando stopLossUsd == null;
 *     - 'breached' quando delta < 0 && remainingUsd <= 0 (stop ATINGIDO/estourado);
 *     - 'losing'   quando delta < 0 && remainingUsd > 0 (ainda há folga);
 *     - 'safe'     quando delta >= 0.
 */

export type StopRemainingState = "no_limit" | "losing" | "safe" | "breached";

export interface StopRemaining {
  remainingUsd: number | null;
  state: StopRemainingState;
}

export function computeStopRemaining(
  stopLossUsd: number | null,
  currentDayDeltaUsd: number,
): StopRemaining {
  if (stopLossUsd == null) {
    return { remainingUsd: null, state: "no_limit" };
  }
  const remainingUsd = stopLossUsd + currentDayDeltaUsd;
  if (currentDayDeltaUsd < 0) {
    return {
      remainingUsd,
      state: remainingUsd <= 0 ? "breached" : "losing",
    };
  }
  return { remainingUsd, state: "safe" };
}
