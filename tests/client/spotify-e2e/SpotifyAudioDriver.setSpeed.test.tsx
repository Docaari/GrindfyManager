/**
 * Test-Writer (Modo TDD - Red Phase / contrato RF-01.6)
 *
 * Sprint Spotify E2E — RF-01.6 / D5: Spotify nao suporta variable speed.
 *
 * Module: client/src/lib/audio-engine/SpotifyAudioDriver.ts
 *
 * Contrato: setSpeed() e no-op (NAO faz REST call ao Spotify, NAO throw). O
 * controle de velocidade fica OCULTO na UI quando source=spotify (coberto por
 * tests/client/mini-player-3/MiniPlayerBar.hideSpeedSpotify.test.tsx — nao
 * duplicado aqui). Este teste fixa o lado driver: setSpeed nunca emite uma
 * chamada de playback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SDKListener = (data?: any) => void;

function makeMockPlayer() {
  const handlers: Record<string, Set<SDKListener>> = {};
  return {
    addListener: vi.fn((event: string, cb: SDKListener) => {
      handlers[event] = handlers[event] ?? new Set();
      handlers[event].add(cb);
      return true;
    }),
    removeListener: vi.fn(),
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    setVolume: vi.fn(async () => undefined),
    _emit: (event: string, data?: any) => {
      for (const cb of handlers[event] ?? []) cb(data);
    },
  } as any;
}

async function loadDriver() {
  return await import('@/lib/audio-engine/SpotifyAudioDriver');
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());

describe('SpotifyAudioDriver.setSpeed — no-op (RF-01.6 / D5)', () => {
  it('setSpeed(1.5) NAO faz nenhuma chamada REST ao Spotify', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const PlayerCtor = vi.fn().mockImplementation(() => player);
    const sdkLoader = vi.fn().mockResolvedValue({ Player: PlayerCtor });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      fetchFn,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'DEV-1' });
    await p;

    const callsBefore = fetchFn.mock.calls.length;
    driver.setSpeed(1.5);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn.mock.calls.length).toBe(callsBefore);
    warnSpy.mockRestore();
  });

  it('setSpeed nao throw', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const PlayerCtor = vi.fn().mockImplementation(() => player);
    const sdkLoader = vi.fn().mockResolvedValue({ Player: PlayerCtor });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    expect(() => driver.setSpeed(2)).not.toThrow();
    warnSpy.mockRestore();
  });
});
