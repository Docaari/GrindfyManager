/**
 * StopBanner — Sprint Bankroll-3 RF-6
 *
 * Banner read-only mostrado em /grind quando stop_lock_until > NOW.
 * Variant 'loss' (vermelho, bloqueante). Variant 'win' (informativo, nao bloqueia).
 * Nao renderiza quando lockedUntil null ou expirado.
 */

import React from "react";

export interface StopBannerProps {
  lockedUntil: string | Date | null;
  stopReached: "loss" | "win" | null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const StopBanner: React.FC<StopBannerProps> = ({
  lockedUntil,
  stopReached,
}) => {
  if (lockedUntil == null) return null;
  const lockDate = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  if (Number.isNaN(lockDate.getTime())) return null;
  const remainingMs = lockDate.getTime() - Date.now();
  if (remainingMs <= 0) return null;

  const variant = stopReached === "win" ? "win" : "loss";
  const isLoss = variant === "loss";
  const bg = isLoss ? "bg-red-900/30 border-red-500" : "bg-amber-900/30 border-amber-500";
  const txt = isLoss ? "text-red-200" : "text-amber-200";

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
          ? "Sessao bloqueada por stop-loss"
          : "Voce atingiu seu objetivo do dia"}
      </div>
      <div className="text-sm" data-testid="stop-banner-countdown">
        Tempo restante: {formatRemaining(remainingMs)}
      </div>
      <div className="text-xs opacity-80">
        Liberacao automatica em {lockDate.toLocaleString("pt-BR")}.
      </div>
    </div>
  );
};

export default StopBanner;
