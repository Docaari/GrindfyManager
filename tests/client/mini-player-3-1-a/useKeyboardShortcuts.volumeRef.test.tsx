// Sprint MP3.1 Wave A / M3 — volume via useRef em useKeyboardShortcuts.
// Antes: mudancas em `volume` re-bindavam o document.addEventListener.
// Agora: volumeRef sincronizado via useEffect, listener instalado uma vez.
//
// Test estrategia: renderHook + spy em document.addEventListener/removeEventListener
// + alterar volume varias vezes via rerender + verificar contagem de bindings.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

async function loadHook() {
  const mod: any = await import('@/hooks/useKeyboardShortcuts');
  return mod.useKeyboardShortcuts;
}

function noop() {}

function makeOpts(overrides: any = {}) {
  return {
    toggle: noop,
    skipBack: noop,
    skipForward: noop,
    setVolume: noop,
    volume: 0.5,
    toggleMute: noop,
    seek: noop,
    durationSeconds: 100,
    displayMode: 'bar' as const,
    setDisplayMode: noop,
    close: noop,
    shortcutsHelpOpen: false,
    setShortcutsHelpOpen: noop,
    ...overrides,
  };
}

describe('useKeyboardShortcuts volumeRef (MP3.1 M3)', () => {
  let addSpy: any;
  let removeSpy: any;

  beforeEach(() => {
    addSpy = vi.spyOn(document, 'addEventListener');
    removeSpy = vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('volume change NAO re-binda listener', async () => {
    const useKeyboardShortcuts = await loadHook();
    const initialBindings = addSpy.mock.calls.filter(
      (c: any[]) => c[0] === 'keydown',
    ).length;

    const { rerender } = renderHook(
      (props: any) => useKeyboardShortcuts(makeOpts(props)),
      { initialProps: { volume: 0.5 } },
    );

    // Mudar volume 5 vezes — antes da MP3.1 = 5 re-binds. Agora = 0.
    for (let i = 0; i < 5; i++) {
      rerender({ volume: 0.5 + i * 0.1 } as any);
    }

    const finalBindings = addSpy.mock.calls.filter(
      (c: any[]) => c[0] === 'keydown',
    ).length;
    const removals = removeSpy.mock.calls.filter(
      (c: any[]) => c[0] === 'keydown',
    ).length;

    // Apenas 1 binding inicial; sem remocoes (rerender nao desmonta).
    expect(finalBindings - initialBindings).toBe(1);
    expect(removals).toBe(0);
  });

  it('durationSeconds change NAO re-binda listener', async () => {
    const useKeyboardShortcuts = await loadHook();
    const initial = addSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown').length;

    const { rerender } = renderHook(
      (props: any) => useKeyboardShortcuts(makeOpts(props)),
      { initialProps: { durationSeconds: 100 } },
    );

    for (let i = 1; i <= 5; i++) {
      rerender({ durationSeconds: 100 + i * 50 } as any);
    }

    const finalBindings = addSpy.mock.calls.filter(
      (c: any[]) => c[0] === 'keydown',
    ).length;
    expect(finalBindings - initial).toBe(1);
  });

  it('ArrowUp aplica volume + 0.1 com volume atual (via ref)', async () => {
    const useKeyboardShortcuts = await loadHook();
    const setVolume = vi.fn();
    const { rerender } = renderHook(
      (props: any) => useKeyboardShortcuts(makeOpts({ ...props, setVolume })),
      { initialProps: { volume: 0.3 } },
    );

    // Atualiza volume sem rebind.
    rerender({ volume: 0.7 } as any);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });

    expect(setVolume).toHaveBeenCalled();
    const last = setVolume.mock.calls[setVolume.mock.calls.length - 1][0];
    // Deve usar volume atualizado (0.7), nao stale 0.3.
    expect(last).toBeCloseTo(0.8, 5);
  });
});
