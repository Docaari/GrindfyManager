/**
 * StopBanner — Sprint Bankroll-3 RF-6
 *
 * Banner read-only mostrado em /grind quando stop_lock_until > NOW.
 * Variant 'loss' (vermelho, bloqueante). Variant 'win' (informativo, nao bloqueia).
 * Nao renderiza quando lockedUntil null ou expirado.
 *
 * Implementer Round UX #4: copy reframe de "bloqueio" para "disciplina".
 * Em vez de tratar stop-loss como punicao, reforca que o user esta protegendo
 * sua banca. Stop-win celebra o objetivo atingido.
 */

import React from "react";
import { Link } from "wouter";

export interface StopBannerProps {
  lockedUntil: string | Date | null;
  stopReached: "loss" | "win" | null;
  /** Valor absoluto (USD) atingido no dia, opcional para enriquecer o copy. */
  dayDeltaUsd?: number;
  /** Limite stop-loss configurado (USD), opcional para enriquecer o copy. */
  stopLossUsd?: number | null;
  /** Limite stop-win configurado (USD), opcional para enriquecer o copy. */
  stopWinUsd?: number | null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export const StopBanner: React.FC<StopBannerProps> = ({
  lockedUntil,
  stopReached,
  dayDeltaUsd,
  stopLossUsd,
  stopWinUsd,
}) => {
  if (lockedUntil == null) return null;
  const lockDate = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  if (Number.isNaN(lockDate.getTime())) return null;
  const remainingMs = lockDate.getTime() - Date.now();
  if (remainingMs <= 0) return null;

  const variant = stopReached === "win" ? "win" : "loss";
  const isLoss = variant === "loss";
  const bg = isLoss ? "bg-red-900/30 border-red-500" : "bg-emerald-900/30 border-emerald-500";
  const txt = isLoss ? "text-red-200" : "text-emerald-200";

  const lossLimitText = stopLossUsd != null
    ? `Voce atingiu seu limite de ${formatUsd(stopLossUsd)} hoje. Boa decisao desligar.`
    : "Voce atingiu seu limite de hoje. Boa decisao desligar.";
  const winLimitText = stopWinUsd != null
    ? `Voce atingiu sua meta de ${formatUsd(stopWinUsd)} hoje.`
    : (dayDeltaUsd != null
        ? `Voce esta com ${formatUsd(dayDeltaUsd)} no dia.`
        : "Voce atingiu sua meta do dia.");

  return (
    <div
      role="alert"
      data-testid="stop-banner"
      data-variant={variant}
      aria-label={isLoss ? "stop-loss-active" : "stop-win-reached"}
      className={`flex flex-col gap-2 rounded-lg border ${bg} p-4 ${txt}`}
    >
      <div className="font-semibold text-base">
        {isLoss
          ? "Stop-loss ativo — voce esta protegendo sua banca"
          : "Objetivo do dia atingido"}
      </div>
      <div className="text-sm">
        {isLoss ? lossLimitText : winLimitText}
      </div>
      <div className="text-sm" data-testid="stop-banner-countdown">
        Tempo restante: {formatRemaining(remainingMs)}
      </div>
      <div className="text-xs opacity-80">
        Liberacao automatica em {lockDate.toLocaleString("pt-BR")}.
      </div>
      <div className="flex flex-wrap gap-3 pt-1">
        {isLoss ? (
          <Link
            href="/study"
            data-testid="stop-banner-cta-secondary"
            className="text-xs underline hover:opacity-90"
          >
            Aproveitar para revisar maos
          </Link>
        ) : (
          <Link
            href="/dashboard"
            data-testid="stop-banner-cta-secondary"
            className="text-xs underline hover:opacity-90"
          >
            Ver evolucao
          </Link>
        )}
      </div>
    </div>
  );
};

export default StopBanner;
