/**
 * Sprint Estudos-Sessao-1 — RF-07
 *
 * Timer ao vivo que calcula elapsed via `startedAt`. Persistente em refresh
 * (recalcula via session.date — lesson #12).
 *
 * Props:
 *   - startedAt: ISO string OR Date (data de inicio da sessao = session.date).
 *   - status: 'active' | 'finished' | 'abandoned'.
 *   - finalDuration?: number — duration salvo em minutos (so quando finished).
 *   - onFinish: callback chamado com elapsed em MINUTOS arredondado.
 *   - disabled: bloqueia botao enquanto mutation pending.
 *   - showFinishButton: esconde quando readOnly.
 *
 * Lessons aplicadas:
 *   #1  hooks first.
 *   #2  data-testid: session-timer, finalize-session-btn.
 *   #12 useState efemero pro tick; cleanup do setInterval no unmount.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { StudySessionLegacyStatus } from '@shared/schema';

interface Props {
  startedAt: string | Date;
  status: StudySessionLegacyStatus;
  finalDuration?: number;
  onFinish: (durationMin: number) => void;
  disabled?: boolean;
  showFinishButton?: boolean;
}

function formatElapsed(totalSec: number): string {
  if (totalSec < 0) totalSec = 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function SessionTimer({
  startedAt,
  status,
  finalDuration,
  onFinish,
  disabled,
  showFinishButton = true,
}: Props): JSX.Element {
  const startedAtMsRef = useRef<number>(0);
  // Calcula startedAt apenas 1x (estavel em re-render).
  if (startedAtMsRef.current === 0) {
    try {
      startedAtMsRef.current = new Date(startedAt).getTime();
    } catch {
      startedAtMsRef.current = Date.now();
    }
  }

  const isLive = status === 'active';

  const [elapsedSec, setElapsedSec] = useState<number>(() => {
    if (isLive) {
      return Math.max(0, Math.floor((Date.now() - startedAtMsRef.current) / 1000));
    }
    // Read-only: usa finalDuration (em minutos).
    return Math.max(0, (finalDuration ?? 0) * 60);
  });

  useEffect(() => {
    if (!isLive) return;
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMsRef.current) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive]);

  function handleFinish(): void {
    const durationMin = Math.max(0, Math.round(elapsedSec / 60));
    onFinish(durationMin);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div
        data-testid="session-timer"
        className="text-3xl font-mono tabular-nums text-foreground"
        aria-live="polite"
      >
        {formatElapsed(elapsedSec)}
      </div>
      {showFinishButton ? (
        <button
          type="button"
          data-testid="finalize-session-btn"
          onClick={handleFinish}
          disabled={disabled}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Finalizar
        </button>
      ) : null}
    </div>
  );
}

export default SessionTimer;
