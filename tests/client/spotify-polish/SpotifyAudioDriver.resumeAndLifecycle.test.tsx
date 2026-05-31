/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — driver lifecycle bugs:
 *   - B-RESUME-1 (ADR-221 §D3): `resume()` novo (SDK player.resume / PUT /play
 *     SEM body). pause() via player.pause. play() = load com uris so no inicio.
 *   - B-EXTPAUSE: driver emite mudanca de play-status no state.paused do SDK.
 *   - B-DESTROY-DEVICE: destroy() nula deviceId + guards (sem PUT pra device morto).
 *   - B-REFRESH-CLAMP: scheduleRefresh clamp minimo (expiresIn<300 nao fire imediato).
 *   - B-404-RETRY: PUT play 404 (device race) -> retry 1x.
 *   - B-401-RESUME: 401 mid-play -> re-toca currentTrack apos reconnect.
 *   - B-LOG-GATE (RF-06): console.info "SDK ready" / warn setSpeed gateados a DEV;
 *     console.error de erro real SEMPRE visivel (lesson #9).
 *
 * Mock do SDK: new-callable (lessons #5/#35). Shapes reais (lesson #3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SDKListener = (data?: any) => void;

function makeMockPlayer(opts: { resume?: boolean; pause?: boolean } = {}) {
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
    activateElement: vi.fn(async () => undefined),
    _emit: (event: string, data?: any) => {
      for (const cb of handlers[event] ?? []) cb(data);
    },
    _handlers: handlers,
  };
  if (opts.resume !== false) player.resume = vi.fn(async () => undefined);
  if (opts.pause !== false) player.pause = vi.fn(async () => undefined);
  return player;
}

function makeSdkLoader(player: any) {
  const PlayerCtor = vi.fn().mockImplementation(() => player);
  const sdkLoader = vi.fn().mockResolvedValue({ Player: PlayerCtor });
  return { sdkLoader, PlayerCtor };
}

async function loadDriver() {
  return await import('@/lib/audio-engine/SpotifyAudioDriver');
}

async function setupReady(opts: { player?: any; fetchFn?: any; telemetry?: any; refresh?: any } = {}) {
  const mod = await loadDriver();
  const player = opts.player ?? makeMockPlayer();
  const { sdkLoader } = makeSdkLoader(player);
  const fetchFn = opts.fetchFn ?? vi.fn().mockResolvedValue({ ok: true, status: 204 });
  const driver = new mod.SpotifyAudioDriver({
    accessToken: 'tok',
    expiresIn: 3600,
    refresh: opts.refresh ?? vi.fn(),
    sdkLoader,
    fetchFn,
    telemetry: opts.telemetry,
  });
  const p = driver.connect();
  await new Promise((r) => setTimeout(r, 0));
  player._emit('ready', { device_id: 'DEV-1' });
  await p;
  return { driver, player, fetchFn };
}

function playCalls(fetchFn: any) {
  return fetchFn.mock.calls.filter((c: any[]) => String(c[0]).includes('/me/player/play'));
}

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// B-RESUME-1 — resume() / pause() / play() split (D3)
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver resume/pause split (B-RESUME-1 / D3)', () => {
  it('expoe metodo resume()', async () => {
    const { driver } = await setupReady();
    expect(typeof (driver as any).resume).toBe('function');
  });

  it('resume() chama player.resume() do SDK (NAO refaz PUT /play com uris)', async () => {
    const player = makeMockPlayer();
    const { driver, fetchFn } = await setupReady({ player });
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);
    await driver.play(); // load inicial -> PUT /play com uris.
    await new Promise((r) => setTimeout(r, 0));
    const callsBefore = playCalls(fetchFn).length;

    await (driver as any).resume();
    await new Promise((r) => setTimeout(r, 0));

    expect(player.resume).toHaveBeenCalled();
    // resume NAO pode reenviar PUT /play com body de uris.
    const callsAfter = playCalls(fetchFn).filter((c: any[]) => {
      const body = c[1]?.body ? JSON.parse(c[1].body) : null;
      return body && Array.isArray(body.uris);
    });
    expect(callsAfter.length).toBe(callsBefore);
  });

  it('resume() sem SDK player.resume cai em PUT /play SEM body (nao reinicia)', async () => {
    const player = makeMockPlayer({ resume: false }); // SDK nao expoe resume.
    const { driver, fetchFn } = await setupReady({ player });
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);

    await (driver as any).resume();
    await new Promise((r) => setTimeout(r, 0));

    const resumeCall = playCalls(fetchFn).find((c: any[]) => !c[1]?.body);
    expect(resumeCall).toBeTruthy();
  });

  it('pause() chama player.pause() do SDK', async () => {
    const player = makeMockPlayer();
    const { driver } = await setupReady({ player });
    driver.pause();
    await new Promise((r) => setTimeout(r, 0));
    expect(player.pause).toHaveBeenCalled();
  });

  it('play() (load inicial) reenvia uris -> toca do 0', async () => {
    const { driver, fetchFn } = await setupReady();
    await driver.load({ source: 'spotify', trackId: 'spotify:track:Z', title: 'Z' } as any);
    await driver.play();
    await new Promise((r) => setTimeout(r, 0));
    const call = playCalls(fetchFn).find((c: any[]) => c[1]?.body);
    expect(call).toBeTruthy();
    const body = JSON.parse(call![1].body);
    expect(body.uris).toEqual(['spotify:track:Z']);
  });
});

// ---------------------------------------------------------------------------
// B-EXTPAUSE — driver emite mudanca de play-status no state.paused
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver external pause sync (B-EXTPAUSE)', () => {
  it('player_state_changed paused=true emite evento de playstatechange (paused)', async () => {
    const { driver, player } = await setupReady();
    const cb = vi.fn();
    // Evento novo de status play/pause (nao timeupdate/ended).
    const off = (driver as any).on('playstatechange', cb);
    expect(typeof off).toBe('function');

    player._emit('player_state_changed', {
      paused: true,
      position: 50_000,
      duration: 200_000,
      track_window: { current_track: { uri: 'spotify:track:A' }, previous_tracks: [] },
    });

    expect(cb).toHaveBeenCalled();
    const payload = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(payload?.paused).toBe(true);
  });

  it('player_state_changed paused=false emite playstatechange (playing)', async () => {
    const { driver, player } = await setupReady();
    const cb = vi.fn();
    (driver as any).on('playstatechange', cb);

    player._emit('player_state_changed', {
      paused: false,
      position: 10_000,
      duration: 200_000,
      track_window: { current_track: { uri: 'spotify:track:A' }, previous_tracks: [] },
    });

    const payload = cb.mock.calls[cb.mock.calls.length - 1]?.[0];
    expect(payload?.paused).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B-DESTROY-DEVICE — destroy nula deviceId + guards
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver destroy nula deviceId (B-DESTROY-DEVICE)', () => {
  it('apos destroy(), play()/seek()/pause() NAO fazem PUT pra device morto', async () => {
    const { driver, fetchFn, player } = await setupReady();
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);
    driver.destroy();

    const before = fetchFn.mock.calls.length;
    await driver.play();
    driver.pause();
    driver.seek(10);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchFn.mock.calls.length).toBe(before);
    expect((driver as any).deviceId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-REFRESH-CLAMP — scheduleRefresh clamp minimo
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver scheduleRefresh clamp (B-REFRESH-CLAMP)', () => {
  it('expiresIn pequeno (<300) NAO dispara refresh imediato (clamp min ~30s)', async () => {
    vi.useFakeTimers();
    const mod = await loadDriver();
    const player = makeMockPlayer();
    const { sdkLoader } = makeSdkLoader(player);
    const refresh = vi.fn().mockResolvedValue({ accessToken: 'new', expiresIn: 3600 });
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 60, // < 300 -> antigo fire imediato/loop.
      refresh,
      sdkLoader,
      fetchFn: vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    });
    const p = driver.connect();
    await vi.advanceTimersByTimeAsync(1);
    player._emit('ready', { device_id: 'DEV-1' });
    await p;

    // Logo apos connect (com clamp), refresh NAO deve ter sido chamado em t=0.
    expect(refresh).not.toHaveBeenCalled();

    // O clamp garante um delay minimo (>= ~30s). Avancar 20s ainda nao dispara.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(refresh).not.toHaveBeenCalled();

    driver.destroy();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// B-404-RETRY — PUT play 404 (device race) -> retry 1x
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver 404 device retry (B-404-RETRY)', () => {
  it('PUT /play 404 na 1a tentativa -> retry 1x (segunda chamada de play)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, clone: () => ({ json: async () => ({ error: { reason: 'NO_ACTIVE_DEVICE' } }) }) })
      .mockResolvedValue({ ok: true, status: 204 });
    const { driver } = await setupReady({ fetchFn });
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);

    await driver.play();
    // aguarda o retry (pode ter delay).
    await new Promise((r) => setTimeout(r, 50));

    expect(playCalls(fetchFn).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// B-401-RESUME — 401 mid-play -> re-toca currentTrack apos reconnect
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver 401 mid-play re-play (B-401-RESUME)', () => {
  it('PUT /play 401 -> apos reconnect re-toca o currentTrack', async () => {
    let firstPlayDone = false;
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/me/player/play') && !firstPlayDone) {
        firstPlayDone = true;
        return { ok: false, status: 401 };
      }
      return { ok: true, status: 204 };
    });
    const player = makeMockPlayer();
    const { driver } = await setupReady({ player, fetchFn });
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);

    await driver.play();
    await new Promise((r) => setTimeout(r, 60));
    // simula reconnect bem-sucedido do SDK.
    player.connect.mockResolvedValueOnce(true);
    await new Promise((r) => setTimeout(r, 60));

    // Apos o 401+reconnect, o driver deve re-tocar a faixa (>=2 PUT /play).
    expect(playCalls(fetchFn).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// B-LOG-GATE (RF-06) — info/warn gateados a DEV; error real sempre visivel
// ---------------------------------------------------------------------------
describe('SpotifyAudioDriver log gating (B-LOG-GATE / RF-06)', () => {
  it('PROD: console.info "SDK ready" NAO eh chamado', async () => {
    vi.stubEnv('DEV', false as any);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await setupReady();
    const readyLog = infoSpy.mock.calls.find((c) =>
      String(c[0] ?? '').includes('SDK ready'),
    );
    expect(readyLog).toBeUndefined();
  });

  it('DEV: console.info "SDK ready" eh chamado', async () => {
    vi.stubEnv('DEV', true as any);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await setupReady();
    const readyLog = infoSpy.mock.calls.find((c) =>
      String(c[0] ?? '').includes('SDK ready'),
    );
    expect(readyLog).toBeTruthy();
  });

  it('PROD: console.warn setSpeed NAO eh chamado', async () => {
    vi.stubEnv('DEV', false as any);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { driver } = await setupReady();
    driver.setSpeed(1.5);
    const warnLog = warnSpy.mock.calls.find((c) =>
      String(c[0] ?? '').toLowerCase().includes('setspeed'),
    );
    expect(warnLog).toBeUndefined();
  });

  it('erro real (sdk_load_failed) SEMPRE logado mesmo em PROD (lesson #9)', async () => {
    vi.stubEnv('DEV', false as any);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await loadDriver();
    const loaderMod = await import('@/lib/spotify/sdkLoader');
    const sdkLoader = vi.fn().mockRejectedValue(new loaderMod.SpotifySdkLoadError());
    const driver = new mod.SpotifyAudioDriver({
      accessToken: 'tok',
      expiresIn: 3600,
      refresh: vi.fn(),
      sdkLoader,
    });
    await driver.connect().catch(() => {});
    const errLog = errorSpy.mock.calls.find((c) =>
      String(c[0] ?? '').includes('sdk_load_failed'),
    );
    expect(errLog).toBeTruthy();
  });
});
