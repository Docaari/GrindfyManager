/**
 * StopRemainingIndicator — Fase D #5 (RF-03, ADR-235 D-5/D-6).
 *
 * Indicador LEVE de "quanto falta" para o stop-loss do dia. NÃO é o StopBanner cheio
 * (que cobre o bloqueio 423/lock); apenas display informativo.
 *
 *   - stopLossUsd == null -> renderiza null (sem indicador — RF-03 AC).
 *   - delta < 0 com folga (losing)  -> "faltam $X para o stop" (X sem sinal negativo, 2 casas).
 *   - delta < 0 sem folga (breached) -> "stop atingido" (NÃO "faltam $-X" — MEDIUM-1).
 *   - delta >= 0 (safe)   -> estado positivo/neutro (não "faltam -$X").
 *
 * Formatação: valores sempre com 2 casas decimais (toFixed(2)) — nunca float longo (MEDIUM-2).
 */

import { computeStopRemaining } from "@/lib/stopRemaining";

export interface StopRemainingIndicatorProps {
  stopLossUsd: number | null;
  currentDayDeltaUsd: number;
}

function fmtUsd(value: number): string {
  return value.toFixed(2);
}

export function StopRemainingIndicator({
  stopLossUsd,
  currentDayDeltaUsd,
}: StopRemainingIndicatorProps) {
  const { remainingUsd, state } = computeStopRemaining(stopLossUsd, currentDayDeltaUsd);

  if (state === "no_limit" || remainingUsd == null) return null;

  if (state === "breached") {
    return (
      <div
        data-testid="stop-remaining"
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
      >
        Stop-loss atingido — pare a sessão
      </div>
    );
  }

  if (state === "losing") {
    return (
      <div
        data-testid="stop-remaining"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
      >
        Faltam ${fmtUsd(remainingUsd)} para o stop
      </div>
    );
  }

  // safe (delta >= 0)
  return (
    <div
      data-testid="stop-remaining"
      className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
    >
      Stop em ${fmtUsd(stopLossUsd!)} — você está no zero ou no lucro hoje
    </div>
  );
}

export default StopRemainingIndicator;
