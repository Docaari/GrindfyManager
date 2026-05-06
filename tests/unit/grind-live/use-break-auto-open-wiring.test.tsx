import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';

// =============================================================================
// MEDIUM-4: useBreakAutoOpenWiring hook isolado.
//
// Spec: Docs/specs/grind-live-break-auto-open.md (RFs 02 + 03)
// ADR:  Docs/architecture/decisions/124-break-auto-open-clock-aligned-brt.md
//
// Estrategia: hook extraido do GrindSessionLive — testavel via renderHook
// sem precisar carregar o componente de 3000+ linhas (lessons #14, #26).
// =============================================================================

// Lesson #14: dynamic import + /* @vite-ignore */
const HOOK_PATH = '../../../client/src/hooks/useBreakAutoOpenWiring';
let useBreakAutoOpenWiring: any;

beforeEach(async () => {
  const mod = await import(/* @vite-ignore */ HOOK_PATH);
  useBreakAutoOpenWiring = mod.useBreakAutoOpenWiring;
  vi.useFakeTimers();
  // Setando para BRT 14:53:30 — proximo tick (em 30s) cai em 14:54.
  vi.setSystemTime(new Date('2026-05-05T17:53:30Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function buildDeps(overrides: Partial<any> = {}) {
  return {
    enabled: true,
    hasActiveSession: true,
    activeSessionId: 'sess-1',
    activeSessionSkipBreaksToday: false,
    isPaused: false,
    skipBreaksToday: false,
    showBreakDialog: false,
    lastTriggerHourKeyRef: { current: null as string | null },
    wasAutoOpenedRef: { current: false },
    openedAtRef: { current: null as Date | null },
    lastSliderInteractionAtRef: { current: 0 },
    lastTextareaFocusRef: { current: false },
    setShowBreakDialog: vi.fn(),
    setShowBreakBanner: vi.fn(),
    setBreakBannerActive: vi.fn(),
    toast: vi.fn(),
    intervalMs: 30_000,
    ...overrides,
  };
}

describe('useBreakAutoOpenWiring - guards', () => {
  it('hasActiveSession=false -> nao cria interval (no-op)', () => {
    const deps = buildDeps({ hasActiveSession: false });
    renderHook(() => useBreakAutoOpenWiring(deps));
    // Avancar tempo nao deve disparar nada.
    vi.setSystemTime(new Date('2026-05-05T17:54:00Z'));
    vi.advanceTimersByTime(60_000);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });

  it('enabled=false -> nao cria interval', () => {
    const deps = buildDeps({ enabled: false });
    renderHook(() => useBreakAutoOpenWiring(deps));
    vi.setSystemTime(new Date('2026-05-05T17:54:00Z'));
    vi.advanceTimersByTime(60_000);
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

describe('useBreakAutoOpenWiring - tick imediato', () => {
  it('mount em BRT 14:54 -> auto-open dispara no tick imediato', () => {
    vi.setSystemTime(new Date('2026-05-05T17:54:00Z')); // BRT 14:54
    const deps = buildDeps();
    renderHook(() => useBreakAutoOpenWiring(deps));
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(true);
  });

  it('mount em BRT 14:30 -> tick imediato no-op (minuto errado)', () => {
    vi.setSystemTime(new Date('2026-05-05T17:30:00Z'));
    const deps = buildDeps();
    renderHook(() => useBreakAutoOpenWiring(deps));
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

describe('useBreakAutoOpenWiring - cleanup do interval no unmount', () => {
  it('unmount limpa interval (nao dispara mais ticks)', () => {
    const deps = buildDeps();
    const { unmount } = renderHook(() => useBreakAutoOpenWiring(deps));

    unmount();

    // Avanca para BRT 14:54 — se interval ainda estiver ativo, dispararia.
    vi.setSystemTime(new Date('2026-05-05T17:54:00Z'));
    vi.advanceTimersByTime(60_000);

    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});

describe('useBreakAutoOpenWiring - auto-close em XX:02 wirado', () => {
  it('modal aberto via auto-open + tick em BRT 15:02 -> auto-close', () => {
    vi.setSystemTime(new Date('2026-05-05T18:02:00Z')); // BRT 15:02
    const deps = buildDeps({
      showBreakDialog: true,
      wasAutoOpenedRef: { current: true },
      openedAtRef: { current: new Date('2026-05-05T17:54:00Z') }, // BRT 14:54
    });
    renderHook(() => useBreakAutoOpenWiring(deps));
    expect(deps.setShowBreakDialog).toHaveBeenCalledWith(false);
    expect(deps.toast).toHaveBeenCalled();
  });
});

describe('useBreakAutoOpenWiring - lastTextareaFocusRef respeitado no auto-close', () => {
  it('lastTextareaFocusRef.current=true bloqueia auto-close em XX:02', () => {
    vi.setSystemTime(new Date('2026-05-05T18:02:00Z'));
    const deps = buildDeps({
      showBreakDialog: true,
      wasAutoOpenedRef: { current: true },
      openedAtRef: { current: new Date('2026-05-05T17:54:00Z') },
      lastTextareaFocusRef: { current: true }, // foco no textarea
    });
    renderHook(() => useBreakAutoOpenWiring(deps));
    expect(deps.setShowBreakDialog).not.toHaveBeenCalled();
  });
});
