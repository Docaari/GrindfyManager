/**
 * Test-Writer (Modo TDD - Red Phase / contrato de nao-regressao)
 *
 * Sprint Spotify E2E — RF-01.1 (carregar o Web Playback SDK).
 *
 * Module: client/src/lib/spotify/sdkLoader.ts
 *
 * O loader ja existe (MP2) e passa. Este teste fixa o CONTRATO do qual a CSP
 * depende: o host EXATO injetado (`https://sdk.scdn.co/spotify-player.js`) e o
 * mecanismo de resolucao (`window.onSpotifyWebPlaybackSDKReady`). Se alguem
 * mudar o host do script, a allowlist de `scriptSrc` (ADR-220) precisa mudar
 * junto — este teste falha e sinaliza o acoplamento.
 *
 * Co-localizado em tests/client (jsdom). Idempotencia: limpa script + globals +
 * _resetForTests entre runs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function loadModule() {
  return await import('@/lib/spotify/sdkLoader');
}

beforeEach(async () => {
  document
    .querySelectorAll('script[data-spotify-sdk]')
    .forEach((s) => s.remove());
  delete (globalThis as any).Spotify;
  delete (globalThis as any).onSpotifyWebPlaybackSDKReady;
  const mod = await loadModule().catch(() => null);
  if (mod && typeof (mod as any)._resetForTests === 'function') {
    (mod as any)._resetForTests();
  }
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sdkLoader — host exato que a CSP precisa permitir (RF-01.1)', () => {
  it('injeta script src EXATO https://sdk.scdn.co/spotify-player.js', async () => {
    const mod = await loadModule();
    const p = mod.loadSpotifySDK();
    (globalThis as any).Spotify = { Player: vi.fn() };
    (globalThis as any).onSpotifyWebPlaybackSDKReady?.();
    await p;
    const script = document.querySelector(
      'script[data-spotify-sdk]',
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script!.src).toBe('https://sdk.scdn.co/spotify-player.js');
  });

  it('resolve com window.Spotify no callback onSpotifyWebPlaybackSDKReady', async () => {
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

  it('idempotente: 2 chamadas -> 1 unico <script> injetado', async () => {
    const mod = await loadModule();
    const p1 = mod.loadSpotifySDK();
    const p2 = mod.loadSpotifySDK();
    (globalThis as any).Spotify = { Player: vi.fn() };
    (globalThis as any).onSpotifyWebPlaybackSDKReady?.();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
    expect(
      document.querySelectorAll('script[data-spotify-sdk]').length,
    ).toBe(1);
  });
});
