/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT)
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RF-03)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * Fn pura chamada pelo setInterval do useEffect em GrindSessionLive a cada
 * 30s. Implementa auto-close em XX:02-XX:04 com tolerancia ate XX:06+ via
 * isInteractingWithModal + force-close defensivo.
 */

import {
  getBrtMinute,
  isInteractingWithModal,
  shouldAutoCloseAtClock,
} from './break-clock-helpers';

export interface RunAutoCloseTickDeps {
  now: Date;
  showBreakDialog: boolean;
  wasAutoOpenedRef: { current: boolean };
  openedAtRef: { current: Date | null };
  lastSliderInteractionAtRef: { current: number };
  isInTextarea: boolean;
  setShowBreakDialog: (b: boolean) => void;
  toast: (opts: {
    title: string;
    description?: string;
    variant?: "default" | "destructive" | null;
    duration?: number;
  }) => unknown;
}

const AUTO_CLOSE_TOAST_TITLE = 'Break finalizado';
const AUTO_CLOSE_TOAST_DESC =
  'Voce pode registrar manualmente em Gerenciar Breaks.';

// INFO-2 fix (R2): janela aceitavel para force-close defensivo no branch
// minute >= 6 && minute < 30. Modal aberto em XX:54 + tolerancia: elapsedMs
// fica em [4 min, 30 min). Diff > 30 min sinaliza modal abandonado de outra
// hora (nao force-close, deixa user fechar manual).
const FORCE_CLOSE_WINDOW_MS = {
  min: 4 * 60 * 1000,
  max: 30 * 60 * 1000,
};

function performClose(deps: RunAutoCloseTickDeps) {
  deps.setShowBreakDialog(false);
  deps.wasAutoOpenedRef.current = false;
  deps.openedAtRef.current = null;
  deps.toast({
    title: AUTO_CLOSE_TOAST_TITLE,
    description: AUTO_CLOSE_TOAST_DESC,
    duration: 5000,
  });
}

export function runAutoCloseTick(deps: RunAutoCloseTickDeps): void {
  // Guards basicos.
  if (!deps.showBreakDialog) return;
  if (!deps.wasAutoOpenedRef.current) return;
  if (deps.openedAtRef.current == null) return;

  const minute = getBrtMinute(deps.now);

  // MEDIUM-3 fix: Force-close defensivo so dispara dentro de janela razoavel
  // de tempo apos open. Sem essa validacao, modal de hora antiga (ex: aberto
  // 14:54 e relogio agora 16:06 — modal abandonado, nao limpado por refresh)
  // seria force-closed quando minute === 6 da hora 16, sem contexto da
  // janela esperada.
  // Janela aceitavel: openedAt + [4 min, 30 min). Cobre normal close (8-10min)
  // + tolerancia (12-16min). Diff > 30 min = modal de outra hora abandonado.
  if (minute >= 6 && minute < 30) {
    const openedAt = deps.openedAtRef.current;
    if (openedAt) {
      const elapsedMs = deps.now.getTime() - openedAt.getTime();
      if (
        elapsedMs >= FORCE_CLOSE_WINDOW_MS.min &&
        elapsedMs < FORCE_CLOSE_WINDOW_MS.max
      ) {
        performClose(deps);
        return;
      }
    }
  }

  // Janela tolerancia [4, 6): forca close se NAO esta interagindo. Se esta,
  // retentar (no-op).
  if (minute >= 4 && minute < 6) {
    const interacting = isInteractingWithModal(
      deps.lastSliderInteractionAtRef.current,
      deps.isInTextarea,
      deps.now.getTime(),
    );
    if (interacting) return;
    performClose(deps);
    return;
  }

  // Janela normal [2, 4): fecha se nao interagindo.
  if (shouldAutoCloseAtClock(deps.now, deps.openedAtRef.current)) {
    const interacting = isInteractingWithModal(
      deps.lastSliderInteractionAtRef.current,
      deps.isInTextarea,
      deps.now.getTime(),
    );
    if (interacting) return;
    performClose(deps);
    return;
  }
}
