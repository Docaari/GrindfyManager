/**
 * Sprint Grind-Live Break Auto-Open (clock-aligned BRT) — wiring hook.
 *
 * Spec: Docs/specs/grind-live-break-auto-open.md (RFs 02 + 03)
 * ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
 *
 * MEDIUM-4 fix: extrai o useEffect FP-07 + auto-open/close de GrindSessionLive
 * para um hook isolado, testavel via renderHook sem precisar carregar o
 * GrindSessionLive (3000+ linhas). Reduz risco de impedimento (lessons #14, #26).
 *
 * Comportamento:
 *   - Cria interval 30s que chama runAutoOpenTick + runAutoCloseTick.
 *   - Limpa interval no unmount / mudanca de deps.
 *   - Tick imediato no setup (alinhado ao componente atual).
 */

import { useEffect } from 'react';
import { runAutoOpenTick } from '@/components/grind-session/break-auto-open-effect';
import { runAutoCloseTick } from '@/components/grind-session/break-auto-close-effect';

export interface UseBreakAutoOpenWiringDeps {
  enabled: boolean;
  hasActiveSession: boolean;
  activeSessionId: string | null;
  activeSessionSkipBreaksToday: boolean;
  isPaused: boolean;
  skipBreaksToday: boolean;
  showBreakDialog: boolean;
  lastTriggerHourKeyRef: { current: string | null };
  wasAutoOpenedRef: { current: boolean };
  openedAtRef: { current: Date | null };
  lastSliderInteractionAtRef: { current: number };
  lastTextareaFocusRef: { current: boolean };
  setShowBreakDialog: (b: boolean) => void;
  setShowBreakBanner: (b: boolean) => void;
  setBreakBannerActive: (b: boolean) => void;
  toast: (opts: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive' | null;
    duration?: number;
  }) => unknown;
  /**
   * Permite override do interval (dev/test). Default 30000ms.
   */
  intervalMs?: number;
}

export function useBreakAutoOpenWiring(deps: UseBreakAutoOpenWiringDeps): void {
  const {
    enabled,
    hasActiveSession,
    activeSessionId,
    activeSessionSkipBreaksToday,
    isPaused,
    skipBreaksToday,
    showBreakDialog,
    lastTriggerHourKeyRef,
    wasAutoOpenedRef,
    openedAtRef,
    lastSliderInteractionAtRef,
    lastTextareaFocusRef,
    setShowBreakDialog,
    setShowBreakBanner,
    setBreakBannerActive,
    toast,
    intervalMs = 30_000,
  } = deps;

  useEffect(() => {
    if (!hasActiveSession) return;
    if (!enabled) return;

    const tick = () => {
      const now = new Date();
      runAutoOpenTick({
        now,
        enabled,
        activeSession: activeSessionId
          ? { id: activeSessionId, skipBreaksToday: activeSessionSkipBreaksToday }
          : null,
        isPaused,
        skipBreaksToday,
        showBreakDialog,
        lastTriggerHourKeyRef,
        wasAutoOpenedRef,
        openedAtRef,
        setShowBreakDialog,
        setShowBreakBanner,
        setBreakBannerActive,
      });
      runAutoCloseTick({
        now,
        showBreakDialog,
        wasAutoOpenedRef,
        openedAtRef,
        lastSliderInteractionAtRef,
        isInTextarea: lastTextareaFocusRef.current,
        setShowBreakDialog,
        toast,
      });
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [
    enabled,
    hasActiveSession,
    activeSessionId,
    activeSessionSkipBreaksToday,
    isPaused,
    skipBreaksToday,
    showBreakDialog,
    intervalMs,
    // refs e setters sao estaveis — nao precisam estar no array.
    // toast funciona como funcao estavel via useToast.
    toast,
  ]);
}
