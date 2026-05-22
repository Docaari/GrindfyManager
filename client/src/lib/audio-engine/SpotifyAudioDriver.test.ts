/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.3 + RF-01.4 + RF-01.5
 *
 * Module: client/src/lib/audio-engine/SpotifyAudioDriver.ts
 *
 * Refactor stub → real. Implementa IAudioSourceDriver completo via:
 *  - Web Playback SDK (Spotify.Player), carregado lazy via loadSpotifySDK.
 *  - REST API Spotify (PUT /me/player/play|pause|seek) com Bearer accessToken.
 *  - getOAuthToken callback do SDK alimentado por accessToken state em closure.
 *  - Token refresh proativo agendado (setTimeout 5min antes de expirar).
 *  - Reconnect retry exponencial 1s/2s/4s em not_ready/auth_error.
 *
 * Constructor:
 *  new SpotifyAudioDriver({ accessToken, expiresIn, refresh, onPremiumRequired?, onTokenRefreshed?,
 *    onReconnectFailed?, sdkLoader?, fetchFn?, telemetry? })
 *
 * - sdkLoader injetavel pra testes (mock SDK sem rede).
 * - fetchFn injetavel pra mockar REST calls.
 * - telemetry injetavel — callback que recebe (action, payload, options?).
 *
 * Erros:
 *  - SpotifyPremiumRequiredError (caso connect detecte product=free via Me API).
 *  - SpotifyReconnectFailedError apos 3 tries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SDKListener = (data?: any) => void;

function makeMockPlayer() {
  const handlers: Record<string, Set<SDKListener>> = {};
  const player: any = {
    _id: Math.random().toString(36).slice(2, 8),
    addListener: vi.fn((event: string, cb: SDKListener) => {
      handlers[event] = handlers[event] ?? new Set();
      handlers[event].add(cb);
      return true;
    }),
    removeListener: vi.fn((event: string, cb?: SDKListener) => {
      if (cb) handlers[event]?.delete(cb);
      else delete handlers[event];
    }),
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    getCurrentState: vi.fn(async () => null),
    setVolume: vi.fn(async (_v: number) => undefined),
    _emit: (event: string, data?: any) => {
      for (const cb of handlers[event] ?? []) cb(data);
    },
    _handlers: handlers,
  };
  return player;
}

function makeSdkLoader() {
  const player = makeMockPlayer();
  let PlayerCtor: any;
  PlayerCtor = vi.fn().mockImplementation(() => player);
  const Spotify = { Player: PlayerCtor };
  const sdkLoader = vi.fn().mockResolvedValue(Spotify);
  return { sdkLoader, Spotify, PlayerCtor, player };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadDriver() {
  return await import('./SpotifyAudioDriver');
}

describe('SpotifyAudioDriver constructor (RF-01.3)', () => {
  it('source === "spotify"', async () => {
    const mod = await loadDriver();
    const { sdkLoader } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'a',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    expect(driver.source).toBe('spotify');
  });
});

describe('SpotifyAudioDriver.connect (RF-01.3 lifecycle)', () => {
  it('connect carrega SDK + cria Player + chama player.connect()', async () => {
    const mod = await loadDriver();
    const { sdkLoader, PlayerCtor, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'access_xyz',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const connectPromise = driver.connect();
    // dispara "ready" emitido pelo SDK pos-connect
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'DEV-1' });
    await connectPromise;

    expect(sdkLoader).toHaveBeenCalledTimes(1);
    expect(PlayerCtor).toHaveBeenCalledTimes(1);
    expect(player.connect).toHaveBeenCalledTimes(1);
    expect(driver.deviceId).toBe('DEV-1');
  });

  it('Player constructor recebe getOAuthToken que chama accessToken atual', async () => {
    const mod = await loadDriver();
    const { sdkLoader, PlayerCtor, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok_v1',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    const ctorArg = PlayerCtor.mock.calls[0][0];
    expect(typeof ctorArg.getOAuthToken).toBe('function');
    const cb = vi.fn();
    ctorArg.getOAuthToken(cb);
    expect(cb).toHaveBeenCalledWith('tok_v1');
  });
});

describe('SpotifyAudioDriver REST ops (RF-01.3)', () => {
  async function setupReady() {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'access_abc',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      fetchFn,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'DEV-1' });
    await p;
    return { driver, player, fetchFn, mod };
  }

  it('play() chama PUT /me/player/play com uris + device_id', async () => {
    const { driver, fetchFn } = await setupReady();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:abc',
      title: 'X',
    } as any);
    await driver.play();

    const call = fetchFn.mock.calls.find((c: any[]) => String(c[0]).includes('/me/player/play'));
    expect(call).toBeTruthy();
    const url = call![0];
    const opts = call![1];
    expect(url).toMatch(/device_id=DEV-1/);
    expect(opts.method).toBe('PUT');
    expect(opts.headers.Authorization).toBe('Bearer access_abc');
    const body = JSON.parse(opts.body);
    expect(body.uris).toEqual(['spotify:track:abc']);
  });

  it('pause() chama PUT /me/player/pause', async () => {
    const { driver, fetchFn } = await setupReady();
    driver.pause();
    await new Promise((r) => setTimeout(r, 0));
    const call = fetchFn.mock.calls.find((c: any[]) => String(c[0]).includes('/me/player/pause'));
    expect(call).toBeTruthy();
  });

  it('seek(120) chama PUT /me/player/seek com position_ms=120000', async () => {
    const { driver, fetchFn } = await setupReady();
    driver.seek(120);
    await new Promise((r) => setTimeout(r, 0));
    const call = fetchFn.mock.calls.find((c: any[]) => String(c[0]).includes('/me/player/seek'));
    expect(call).toBeTruthy();
    expect(call![0]).toMatch(/position_ms=120000/);
  });

  it('setVolume(0.5) chama player.setVolume(0.5) (SDK method, NAO REST)', async () => {
    const { driver, player } = await setupReady();
    driver.setVolume(0.5);
    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it('setSpeed() eh no-op + console.warn (Spotify nao suporta)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { driver } = await setupReady();
    driver.setSpeed(1.5);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('SpotifyAudioDriver token refresh proativo (RF-01.4)', () => {
  it('agenda refresh 5min antes do expires_in', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'new_tok', expiresIn: 3600 });
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'old_tok',
      expiresIn: 3600,
      refresh,
      sdkLoader,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    // 3600s - 300s = 3300s → avanca 3300s
    await vi.advanceTimersByTimeAsync(3300_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('refresh bem-sucedido atualiza accessToken para getOAuthToken futuro', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, PlayerCtor, player } = makeSdkLoader();
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'tok_v2', expiresIn: 3600 });
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok_v1',
      expiresIn: 3600,
      refresh,
      sdkLoader,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    await vi.advanceTimersByTimeAsync(3300_000);
    await vi.advanceTimersByTimeAsync(10);

    const ctorArg = PlayerCtor.mock.calls[0][0];
    const cb = vi.fn();
    ctorArg.getOAuthToken(cb);
    expect(cb).toHaveBeenCalledWith('tok_v2');
    vi.useRealTimers();
  });

  it('refresh falha 3x consecutivas → onReconnectFailed callback disparado', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const refresh = vi.fn().mockRejectedValue(new Error('fail'));
    const onReconnectFailed = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh,
      sdkLoader,
      onReconnectFailed,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    // Avanca tempo pra disparar refresh e seus retries
    await vi.advanceTimersByTimeAsync(3300_000);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onReconnectFailed).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SpotifyAudioDriver reconnect (RF-01.5)', () => {
  it('not_ready event dispara reconnect retry 1s/2s/4s', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    // baseline: 1 connect ja chamado
    expect(player.connect).toHaveBeenCalledTimes(1);

    player._emit('not_ready', { device_id: 'D' });
    await vi.advanceTimersByTimeAsync(1100);
    expect(player.connect).toHaveBeenCalledTimes(2);

    // sucesso simulado pos 1a retry
    player._emit('ready', { device_id: 'D' });
    vi.useRealTimers();
  });

  it('reconnect falha 3x → onReconnectFailed + driver disconnected', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    player.connect = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    const onReconnectFailed = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      onReconnectFailed,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    player._emit('not_ready', { device_id: 'D' });
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(2100);
    await vi.advanceTimersByTimeAsync(4100);

    expect(onReconnectFailed).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SpotifyAudioDriver event adapter (RF-01.3)', () => {
  it('on("timeupdate") recebe positions do player_state_changed', async () => {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    const handler = vi.fn();
    const unsub = driver.on('timeupdate', handler);

    player._emit('player_state_changed', {
      position: 30000, // ms
      duration: 240000,
      paused: false,
    });

    expect(handler).toHaveBeenCalled();
    unsub();
  });

  it('on("ended") dispara quando player_state_changed.position >= duration AND paused=true', async () => {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    const handler = vi.fn();
    driver.on('ended', handler);
    player._emit('player_state_changed', {
      position: 240000,
      duration: 240000,
      paused: true,
    });
    expect(handler).toHaveBeenCalled();
  });

  it('on("error") dispara em playback_error SDK event', async () => {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    const handler = vi.fn();
    driver.on('error', handler);
    player._emit('playback_error', { message: 'oops' });
    expect(handler).toHaveBeenCalled();
  });
});

describe('SpotifyAudioDriver destroy (RF-01.3)', () => {
  it('destroy() chama player.disconnect + clear refresh timeout', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const refresh = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh,
      sdkLoader,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    driver.destroy();
    expect(player.disconnect).toHaveBeenCalledTimes(1);

    // refresh nunca eh chamado apos destroy mesmo passando tempo
    await vi.advanceTimersByTimeAsync(3400_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('destroy idempotente: chamar 2x nao crasha', async () => {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;
    driver.destroy();
    expect(() => driver.destroy()).not.toThrow();
  });
});

describe('SpotifyAudioDriver telemetry hooks (RF-04.2)', () => {
  it('emite spotify_connected ao receber ready event', async () => {
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const telemetry = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      telemetry,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    const call = telemetry.mock.calls.find((c) => c[0] === 'spotify_connected');
    expect(call).toBeTruthy();
  });

  it('emite spotify_token_refreshed ao refresh proativo bem-sucedido', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const { sdkLoader, player } = makeSdkLoader();
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'new', expiresIn: 3600 });
    const telemetry = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh,
      sdkLoader,
      telemetry,
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'D' });
    await p;

    await vi.advanceTimersByTimeAsync(3300_000);
    await vi.advanceTimersByTimeAsync(10);

    const call = telemetry.mock.calls.find((c) => c[0] === 'spotify_token_refreshed');
    expect(call).toBeTruthy();
    vi.useRealTimers();
  });
});
