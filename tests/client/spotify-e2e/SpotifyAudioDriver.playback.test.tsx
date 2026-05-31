/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify E2E — RF-01.3 (activateElement por gesto), RF-01.4 (deviceId-ready
 * queue), RF-01.7 (mapeamento de erros + telemetria play/pause).
 *
 * Module: client/src/lib/audio-engine/SpotifyAudioDriver.ts
 *
 * Comportamentos NOVOS deste sprint (nao cobertos por
 * client/src/lib/audio-engine/SpotifyAudioDriver.test.ts, que cobre o lifecycle
 * base do MP2):
 *
 *  - RF-01.3: `driver.activateElement()` existe e chama `player.activateElement()`
 *    quando o SDK expoe (satisfaz autoplay/EME user-activation). No-op gracioso
 *    quando o SDK nao expoe (nao throw).
 *  - RF-01.4: play() chamado ANTES do evento `ready` ENFILEIRA o play e dispara
 *    quando o `ready` chega (em vez do no-op silencioso atual).
 *  - RF-01.7: deviceId ausente no play -> emite telemetria `spotify_api_error`
 *    com flag de device ausente (nunca silencioso).
 *  - RF-01.7: `account_error` (conta nao-Premium) -> chama `onPremiumRequired`
 *    (mensagem PT-BR montada na UI) em vez de so emitir `error` cru.
 *  - RF-01.7: SDK falhou ao carregar (sdkLoader rejeita SpotifySdkLoadError) ->
 *    `connect()` propaga estado de erro (telemetria + onReconnectFailed/erro), UI
 *    nao trava.
 *  - RF-06/D7: telemetria `spotify_play` no play() e `spotify_pause` no pause().
 *
 * Mock do SDK: `new`-callable via vi.fn().mockImplementation (lessons #5/#35 — o
 * driver detecta proper-constructor vs factory).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SDKListener = (data?: any) => void;

function makeMockPlayer(opts: { withActivateElement?: boolean } = {}) {
  const handlers: Record<string, Set<SDKListener>> = {};
  const player: any = {
    addListener: vi.fn((event: string, cb: SDKListener) => {
      handlers[event] = handlers[event] ?? new Set();
      handlers[event].add(cb);
      return true;
    }),
    removeListener: vi.fn(),
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    getCurrentState: vi.fn(async () => null),
    setVolume: vi.fn(async () => undefined),
    _emit: (event: string, data?: any) => {
      for (const cb of handlers[event] ?? []) cb(data);
    },
    _handlers: handlers,
  };
  if (opts.withActivateElement) {
    player.activateElement = vi.fn(async () => undefined);
  }
  return player;
}

function makeSdkLoader(player: any) {
  const PlayerCtor = vi.fn().mockImplementation(() => player);
  const Spotify = { Player: PlayerCtor };
  const sdkLoader = vi.fn().mockResolvedValue(Spotify);
  return { sdkLoader, Spotify, PlayerCtor };
}

async function loadDriver() {
  return await import('@/lib/audio-engine/SpotifyAudioDriver');
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// RF-01.3 — activateElement no gesto
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver.activateElement (RF-01.3)', () => {
  it('expoe metodo activateElement()', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer({ withActivateElement: true });
    const { sdkLoader } = makeSdkLoader(player);
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    expect(typeof (driver as any).activateElement).toBe('function');
  });

  it('activateElement() chama player.activateElement() do SDK quando exposto', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer({ withActivateElement: true });
    const { sdkLoader } = makeSdkLoader(player);
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

    await (driver as any).activateElement();
    expect(player.activateElement).toHaveBeenCalled();
  });

  // Fix-wave RF-01.3 — activateElement deve ser invocado DENTRO do fluxo de
  // connect (gesto do usuario), antes do player.connect(), para satisfazer
  // autoplay/EME. Antes do fix o metodo existia mas nunca era chamado.
  it('connect() chama player.activateElement() antes de player.connect() (gesto do usuario)', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer({ withActivateElement: true });
    const { sdkLoader } = makeSdkLoader(player);
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

    expect(player.activateElement).toHaveBeenCalled();
    // ordem: activateElement antes do connect.
    const activateOrder = player.activateElement.mock.invocationCallOrder[0];
    const connectOrder = player.connect.mock.invocationCallOrder[0];
    expect(activateOrder).toBeLessThan(connectOrder);
  });

  it('connect() NAO quebra quando SDK nao expoe activateElement (no-op gracioso)', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer({ withActivateElement: false });
    const { sdkLoader } = makeSdkLoader(player);
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await expect(p).resolves.not.toThrow?.();
    expect(player.connect).toHaveBeenCalled();
  });

  it('activateElement() NAO throw quando SDK nao expoe (no-op gracioso)', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer({ withActivateElement: false });
    const { sdkLoader } = makeSdkLoader(player);
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

    await expect((driver as any).activateElement()).resolves.not.toThrow?.();
  });
});

// ---------------------------------------------------------------------------
// RF-01.4 — play antes do `ready` enfileira + dispara no ready
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver deviceId-ready queue (RF-01.4)', () => {
  it('play() ANTES do ready NAO chama REST imediatamente (enfileira)', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      fetchFn,
    });
    // connect inicia mas NAO emitimos `ready` ainda -> deviceId null.
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));

    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:abc',
      title: 'X',
    } as any);
    await driver.play();

    // Sem ready, o play nao pode ter feito o PUT /me/player/play.
    const playCallBefore = fetchFn.mock.calls.find((c: any[]) =>
      String(c[0]).includes('/me/player/play'),
    );
    expect(playCallBefore).toBeUndefined();

    // Agora chega o ready -> o play enfileirado dispara.
    player._emit('ready', { device_id: 'DEV-9' });
    await p;
    await new Promise((r) => setTimeout(r, 0));

    const playCallAfter = fetchFn.mock.calls.find((c: any[]) =>
      String(c[0]).includes('/me/player/play'),
    );
    expect(playCallAfter).toBeTruthy();
    expect(String(playCallAfter![0])).toMatch(/device_id=DEV-9/);
    const body = JSON.parse((playCallAfter![1] as any).body);
    expect(body.uris).toEqual(['spotify:track:abc']);
  });

  // Fix-wave — play-antes-de-ready eh fluxo NORMAL: emite `spotify_play_queued`,
  // NAO `spotify_api_error` (reservado pra deviceId ausente APOS ready).
  it('play() antes do ready emite spotify_play_queued (NAO spotify_api_error)', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const telemetry = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      fetchFn,
      telemetry,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:abc',
      title: 'X',
    } as any);
    await driver.play();

    const queued = telemetry.mock.calls.find(
      (c) => c[0] === 'spotify_play_queued',
    );
    expect(queued).toBeTruthy();
    // O play enfileirado NAO pode emitir spotify_api_error (fluxo normal).
    const apiError = telemetry.mock.calls.find(
      (c) =>
        c[0] === 'spotify_api_error' &&
        (c[1] as any)?.path === '/me/player/play',
    );
    expect(apiError).toBeUndefined();

    // cleanup: completa o connect.
    player._emit('ready', { device_id: 'DEV-9' });
    await p;
  });
});

// ---------------------------------------------------------------------------
// RF-01.7 — deviceId ausente no play nao pode ser silencioso
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver deviceId ausente no play (RF-01.7)', () => {
  it('play sem track carregada nao explode e nao faz PUT', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
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

    // play sem load -> nao deve fazer PUT play (sem currentTrack).
    await driver.play();
    const playCall = fetchFn.mock.calls.find((c: any[]) =>
      String(c[0]).includes('/me/player/play'),
    );
    expect(playCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// RF-01.7 — account_error -> onPremiumRequired (PT-BR na UI)
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver account_error (RF-01.7)', () => {
  it('account_error do SDK chama onPremiumRequired', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const onPremiumRequired = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      onPremiumRequired,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    player._emit('account_error', { message: 'premium required' });
    expect(onPremiumRequired).toHaveBeenCalled();
  });

  it('account_error emite telemetria spotify_api_error/account-relacionada', async () => {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const telemetry = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      telemetry,
      onPremiumRequired: vi.fn(),
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'D' });
    await p;

    player._emit('account_error', { message: 'premium required' });
    const call = telemetry.mock.calls.find(
      (c) => c[0] === 'spotify_api_error' || c[0] === 'spotify_account_error',
    );
    expect(call).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RF-01.7 — SDK falhou ao carregar (adblock/timeout) nao trava
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver SDK load failure (RF-01.7)', () => {
  it('sdkLoader rejeita SpotifySdkLoadError -> connect propaga estado de erro (telemetria + onReconnectFailed), UI nao trava', async () => {
    const mod = await loadDriver();
    const loaderMod = await import('@/lib/spotify/sdkLoader');
    const sdkLoader = vi
      .fn()
      .mockRejectedValue(new loaderMod.SpotifySdkLoadError());
    const telemetry = vi.fn();
    const onReconnectFailed = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      telemetry,
      onReconnectFailed,
    });

    // connect nao pode deixar promise rejeitada non-handled travar a app;
    // o driver deve capturar e sinalizar erro (telemetria + callback).
    await driver.connect().catch(() => {});

    const sdkErrorTelemetry = telemetry.mock.calls.find(
      (c) =>
        c[0] === 'spotify_sdk_load_error' ||
        c[0] === 'spotify_api_error' ||
        c[0] === 'spotify_reconnect_failed',
    );
    // Ao menos um sinal de erro foi emitido (telemetria ou callback).
    expect(
      Boolean(sdkErrorTelemetry) || onReconnectFailed.mock.calls.length > 0,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RF-06 / D7 — telemetria spotify_play / spotify_pause
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver telemetria play/pause (RF-06 / D7)', () => {
  async function setupReady() {
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const telemetry = vi.fn();
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
      fetchFn,
      telemetry,
    });
    const p = driver.connect();
    await new Promise((r) => setTimeout(r, 0));
    player._emit('ready', { device_id: 'DEV-1' });
    await p;
    return { driver, telemetry, fetchFn };
  }

  it('play() emite spotify_play', async () => {
    const { driver, telemetry } = await setupReady();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:abc',
      title: 'X',
    } as any);
    await driver.play();
    const call = telemetry.mock.calls.find((c) => c[0] === 'spotify_play');
    expect(call).toBeTruthy();
  });

  it('pause() emite spotify_pause', async () => {
    const { driver, telemetry } = await setupReady();
    driver.pause();
    await new Promise((r) => setTimeout(r, 0));
    const call = telemetry.mock.calls.find((c) => c[0] === 'spotify_pause');
    expect(call).toBeTruthy();
  });
});
