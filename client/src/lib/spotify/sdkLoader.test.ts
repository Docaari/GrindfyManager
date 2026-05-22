/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.3 (Web Playback SDK lazy load)
 *
 * Module: client/src/lib/spotify/sdkLoader.ts
 *
 * Exporta:
 *  - loadSpotifySDK(): Promise<typeof Spotify>
 *    Idempotente — chamadas concorrentes retornam mesma promise.
 *    Injeta <script src="https://sdk.scdn.co/spotify-player.js" async>.
 *    Aguarda window.onSpotifyWebPlaybackSDKReady callback.
 *    Timeout 5s → throw SpotifySdkLoadError com mensagem clara (adblock dica).
 *  - SpotifySdkLoadError class
 *  - _resetForTests(): void
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(async () => {
  // limpa scripts injetados em testes anteriores
  document.querySelectorAll('script[data-spotify-sdk]').forEach((s) => s.remove());
  delete (globalThis as any).Spotify;
  delete (globalThis as any).onSpotifyWebPlaybackSDKReady;
  const mod = await import('./sdkLoader').catch(() => null);
  if (mod && typeof (mod as any)._resetForTests === 'function') {
    (mod as any)._resetForTests();
  }
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadModule() {
  return await import('./sdkLoader');
}

describe('spotify/sdkLoader.loadSpotifySDK (RF-01.3)', () => {
  it('injeta <script> com src sdk.scdn.co/spotify-player.js + async', async () => {
    const mod = await loadModule();
    const p = mod.loadSpotifySDK();
    // simula SDK ready
    (globalThis as any).Spotify = { Player: vi.fn() };
    (globalThis as any).onSpotifyWebPlaybackSDKReady?.();

    await p;
    const script = document.querySelector('script[data-spotify-sdk]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script!.src).toContain('sdk.scdn.co/spotify-player.js');
    expect(script!.async).toBe(true);
  });

  it('resolve com window.Spotify quando callback dispara', async () => {
    const mod = await loadModule();
    const p = mod.loadSpotifySDK();
    const fakePlayer = vi.fn();
    setTimeout(() => {
      (globalThis as any).Spotify = { Player: fakePlayer };
      (globalThis as any).onSpotifyWebPlaybackSDKReady();
    }, 0);
    const sdk = await p;
    expect(sdk.Player).toBe(fakePlayer);
  });

  it('idempotente: chamada 2x retorna a mesma instancia (1 script injetado)', async () => {
    const mod = await loadModule();
    const p1 = mod.loadSpotifySDK();
    const p2 = mod.loadSpotifySDK();
    (globalThis as any).Spotify = { Player: vi.fn() };
    (globalThis as any).onSpotifyWebPlaybackSDKReady?.();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(document.querySelectorAll('script[data-spotify-sdk]').length).toBe(1);
  });

  it('timeout 5s sem callback → throw SpotifySdkLoadError', async () => {
    vi.useFakeTimers();
    const mod = await loadModule();
    const p = mod.loadSpotifySDK();
    vi.advanceTimersByTime(5500);
    await expect(p).rejects.toBeInstanceOf(mod.SpotifySdkLoadError);
  });

  it('SDK ja carregado (window.Spotify presente) → resolve sem injetar script', async () => {
    (globalThis as any).Spotify = { Player: vi.fn(() => ({})) };
    const mod = await loadModule();
    const sdk = await mod.loadSpotifySDK();
    expect(sdk.Player).toBeDefined();
    expect(document.querySelectorAll('script[data-spotify-sdk]').length).toBe(0);
  });
});
