/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-SDKLOADER [LOW] — loadSpotifySDK no timeout/reject:
 *   - reseta loadingPromise (uma 2a chamada PODE tentar de novo, nao herda a
 *     promise rejeitada eternamente);
 *   - re-checa window.Spotify (se o SDK foi seteado externamente apos o timeout,
 *     resolve em vez de manter erro).
 *
 * Bug atual (sdkLoader.ts:41-43): o setTimeout chama reject() mas NUNCA reseta
 * `loadingPromise = null`. Resultado: a proxima chamada retorna a mesma promise
 * ja rejeitada -> retry impossivel.
 *
 * Lesson #38 — so `await import`. vi.useFakeTimers p/ controlar o timeout 5s.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(async () => {
  document.querySelectorAll('script[data-spotify-sdk]').forEach((s) => s.remove());
  delete (globalThis as any).Spotify;
  delete (globalThis as any).onSpotifyWebPlaybackSDKReady;
  const mod = await import('@/lib/spotify/sdkLoader').catch(() => null);
  if (mod && typeof (mod as any)._resetForTests === 'function') {
    (mod as any)._resetForTests();
  }
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadModule() {
  return await import('@/lib/spotify/sdkLoader');
}

describe('B-SDKLOADER retry apos timeout', () => {
  it('apos timeout (rejeicao), a 2a chamada tenta de novo (nao herda a promise rejeitada)', async () => {
    vi.useFakeTimers();
    const mod = await loadModule();

    const p1 = mod.loadSpotifySDK();
    p1.catch(() => {}); // evita unhandled rejection
    vi.advanceTimersByTime(5500);
    await expect(p1).rejects.toBeInstanceOf(mod.SpotifySdkLoadError);

    // 2a chamada -> NAO deve ser a mesma promise ja rejeitada.
    const p2 = mod.loadSpotifySDK();
    p2.catch(() => {});
    expect(p2).not.toBe(p1);

    // e essa 2a tentativa deve poder resolver se o SDK aparecer.
    (globalThis as any).Spotify = { Player: vi.fn() };
    (globalThis as any).onSpotifyWebPlaybackSDKReady?.();
    await expect(p2).resolves.toBeTruthy();
  });

  it('re-checa window.Spotify apos o timeout — se foi seteado externamente, resolve', async () => {
    vi.useFakeTimers();
    const mod = await loadModule();

    const p1 = mod.loadSpotifySDK();
    p1.catch(() => {});
    // SDK aparece (seteado externamente) ANTES do timeout disparar reject.
    (globalThis as any).Spotify = { Player: vi.fn(() => ({})) };
    vi.advanceTimersByTime(5500);

    // o loader deve re-checar window.Spotify no timeout e resolver, nao rejeitar.
    await expect(p1).resolves.toBeTruthy();
  });

  it('_resetForTests zera o estado interno (loadingPromise null)', async () => {
    const mod = await loadModule();
    // chamada inicial cria loadingPromise.
    const p = mod.loadSpotifySDK();
    p.catch(() => {});
    (mod as any)._resetForTests();
    // apos reset, uma nova chamada cria uma promise diferente.
    const p2 = mod.loadSpotifySDK();
    p2.catch(() => {});
    expect(p2).not.toBe(p);
  });
});
