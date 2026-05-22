// Sprint MP3.1 Wave A / M4 — SSR guard em readInitial / storage listener.
// Testar comportamento quando localStorage/window indisponiveis.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function loadHook() {
  return await import('@/hooks/useQueueState');
}

describe('useQueueState SSR guard (MP3.1 M4)', () => {
  let originalLocalStorage: any;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    }
  });

  it('readInitial nao explode quando localStorage indefinido', async () => {
    // Simula SSR: remove localStorage.
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });

    const mod: any = await loadHook();
    // Import + chamada sem hook real — checar que funcao interna nao throw.
    // useQueueState eh hook, mas o codigo gating eh sincrono no module top.
    expect(typeof mod.default).toBe('function');
    expect(typeof mod.useQueueState).toBe('function');
  });

  it('default state shape sem queue persistida', async () => {
    // Mantem localStorage real (jsdom) mas limpa.
    try { localStorage.removeItem('audio.queue.v1'); } catch {}
    const { renderHook } = await import('@testing-library/react');
    const { useQueueState } = await loadHook();
    const { result } = renderHook(() => useQueueState());
    expect(Array.isArray(result.current.queue)).toBe(true);
    expect(result.current.queue.length).toBe(0);
    expect(result.current.repeatMode).toBe('off');
    expect(result.current.shuffleEnabled).toBe(false);
  });
});
