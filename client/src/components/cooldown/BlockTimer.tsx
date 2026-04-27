import { useEffect, useRef, useState } from "react";

// =============================================================================
// BlockTimer — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 + RF-05)
//
// Cronometro visual nao-bloqueante. Apos chegar a zero, continua mostrando 0:00
// e dispara onElapsed (callback informativo). Label "X min sugeridos" reforca
// a UX nao-bloqueante.
// =============================================================================

export interface BlockTimerProps {
  blockNumber: number;
  durationSeconds: number;
  onElapsed?: () => void;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BlockTimer({ blockNumber, durationSeconds, onElapsed }: BlockTimerProps) {
  const [remaining, setRemaining] = useState<number>(Math.max(0, Math.floor(durationSeconds)));
  const elapsedFiredRef = useRef(false);
  const onElapsedRef = useRef(onElapsed);
  onElapsedRef.current = onElapsed;

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 0) return 0;
        const next = prev - 1;
        if (next <= 0 && !elapsedFiredRef.current) {
          elapsedFiredRef.current = true;
          // dispara callback no proximo tick para nao bloquear o setState
          queueMicrotask(() => {
            onElapsedRef.current?.();
          });
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalMin = Math.round(durationSeconds / 60);
  const display = formatMmSs(remaining);
  const isElapsed = remaining <= 0;

  return (
    <div
      data-testid={`cooldown-block-timer-${blockNumber}`}
      role="timer"
      aria-live="polite"
      aria-label={`${totalMin} min sugeridos`}
      className="cooldown-block-timer flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="font-mono text-base">{display}</span>
      <span className="text-xs opacity-70">
        {isElapsed ? "tempo esgotado (sugerido)" : `${totalMin} min sugeridos`}
      </span>
    </div>
  );
}

export default BlockTimer;
