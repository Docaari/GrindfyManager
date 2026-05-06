/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT)
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RF-02 + RF-04)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * Fn pura chamada pelo setInterval do useEffect em GrindSessionLive a cada
 * 30s. Encapsula toda a logica de guards + dedupe + side-effects do auto-open
 * para ser 100% testavel sem React.
 */

import { getCurrentHourKey, shouldAutoOpenAtClock } from './break-clock-helpers';

export interface RunAutoOpenTickDeps {
  now: Date;
  enabled: boolean;
  activeSession: { id: string; skipBreaksToday?: boolean } | null;
  isPaused: boolean;
  skipBreaksToday: boolean;
  showBreakDialog: boolean;
  lastTriggerHourKeyRef: { current: string | null };
  wasAutoOpenedRef: { current: boolean };
  openedAtRef: { current: Date | null };
  setShowBreakDialog: (b: boolean) => void;
  setShowBreakBanner: (b: boolean) => void;
  setBreakBannerActive: (b: boolean) => void;
}

export function runAutoOpenTick(deps: RunAutoOpenTickDeps): void {
  // Toggle OFF — nada acontece, nem dedupe key muda.
  if (!deps.enabled) return;
  // Sem sessao ativa, nao roda.
  if (!deps.activeSession) return;
  // Guards (RF-02 + RF-04).
  if (deps.isPaused) return;
  if (deps.skipBreaksToday) return;
  if (deps.activeSession.skipBreaksToday === true) return;
  // Modal ja aberto manualmente — nao re-abre.
  if (deps.showBreakDialog) return;

  // Verifica relogio + dedupe.
  if (!shouldAutoOpenAtClock(deps.now, deps.lastTriggerHourKeyRef.current)) {
    return;
  }

  // Dispara auto-open.
  const key = getCurrentHourKey(deps.now);
  deps.lastTriggerHourKeyRef.current = key;
  deps.wasAutoOpenedRef.current = true;
  deps.openedAtRef.current = deps.now;
  deps.setShowBreakDialog(true);
  // Suprime banner FP-07 redundante.
  deps.setShowBreakBanner(false);
  deps.setBreakBannerActive(false);
}
