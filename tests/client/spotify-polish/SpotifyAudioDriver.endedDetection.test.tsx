/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — B-ENDED-1 (RF-09 / ADR-221 §D1).
 *
 * Module alvo: client/src/lib/audio-engine/SpotifyAudioDriver.ts -> onStateChanged.
 *
 * Contrato (ADR-221 §D1 — FSM leve + dedupe):
 *   O Web Playback SDK reseta `position`->0 no fim e move a faixa pra
 *   `track_window.previous_tracks`. A heuristica antiga (`paused && pos>=dur`)
 *   raramente dispara. A FSM combina sinais e emite `ended` UMA vez por faixa:
 *
 *   - (C1) playing->fim-reset: wasPlaying && paused && pos===0 &&
 *          lastPositionMs >= dur*0.95 (dur>0).
 *   - (C2) migracao p/ previous_tracks: lastTrackUri esta em previous_tracks E
 *          (curUri !== lastTrackUri OR curUri == null).
 *   - (C3) fallback legado: paused && dur>0 && pos>=dur.
 *
 *   Dedupe por lastTrackUri (endedEmittedForUri), resetado em load/play da nova
 *   faixa. Pause manual no MEIO NAO emite. Playback normal NAO emite.
 *
 * Estes asserts FALHAM hoje porque onStateChanged so tem o ramo C3 sem FSM.
 *
 * Mock do SDK: `new`-callable via vi.fn().mockImplementation (lessons #5/#35).
 * NUNCA mockar idealizado (lesson #3): o `state` espelha o shape REAL do
 * WebPlaybackState (paused/position[ms]/duration[ms]/track_window.*).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type SDKListener = (data?: any) => void;

function makeMockPlayer() {
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
    resume: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    activateElement: vi.fn(async () => undefined),
    _emit: (event: string, data?: any) => {
      for (const cb of handlers[event] ?? []) cb(data);
    },
    _handlers: handlers,
  };
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

async function setupReadyDriver() {
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
  return { driver, player, fetchFn };
}

/** State shape espelhando WebPlaybackState real (durations em ms). */
function stateFor(opts: {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  curUri: string | null;
  previousUris?: string[];
}) {
  return {
    paused: opts.paused,
    position: opts.positionMs,
    duration: opts.durationMs,
    track_window: {
      current_track: opts.curUri ? { uri: opts.curUri } : null,
      previous_tracks: (opts.previousUris ?? []).map((uri) => ({ uri })),
    },
  };
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SpotifyAudioDriver onStateChanged ended FSM (B-ENDED-1 / D1)', () => {
  it('C1: playing(pos≈dur) -> paused(pos=0) mesma faixa -> emite ended 1x', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    const URI = 'spotify:track:A';
    // playing perto do fim (>=95% de 200000ms).
    player._emit(
      'player_state_changed',
      stateFor({ paused: false, positionMs: 195_000, durationMs: 200_000, curUri: URI }),
    );
    // fim: paused + position reset p/ 0, mesma faixa ainda corrente.
    player._emit(
      'player_state_changed',
      stateFor({ paused: true, positionMs: 0, durationMs: 200_000, curUri: URI }),
    );

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('C2: faixa migra p/ previous_tracks + current_track muda -> emite ended 1x', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    // tocando faixa A PERTO DO FIM (hardening C2: so conta como fim natural se
    // a faixa anterior estava perto do fim — um skip no meio NAO dispara ended).
    player._emit(
      'player_state_changed',
      stateFor({ paused: false, positionMs: 198_000, durationMs: 200_000, curUri: 'spotify:track:A' }),
    );
    // A virou previous, current agora eh B (transicao automatica de fim).
    player._emit(
      'player_state_changed',
      stateFor({
        paused: false,
        positionMs: 1_000,
        durationMs: 210_000,
        curUri: 'spotify:track:B',
        previousUris: ['spotify:track:A'],
      }),
    );

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('C2 HARDENING: skip MANUAL no meio (A NAO perto do fim) -> NAO emite ended (nao pula faixa)', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    // A tocando no MEIO (100s/200s).
    player._emit(
      'player_state_changed',
      stateFor({ paused: false, positionMs: 100_000, durationMs: 200_000, curUri: 'spotify:track:A' }),
    );
    // Usuario pula manualmente p/ B (PUT /play): A vai p/ previous_tracks mesmo
    // sem ter chegado perto do fim. NAO deve emitir ended de A (senao a fila
    // avancaria de novo e pularia uma faixa — bug #1 do founder).
    player._emit(
      'player_state_changed',
      stateFor({
        paused: false,
        positionMs: 1_000,
        durationMs: 210_000,
        curUri: 'spotify:track:B',
        previousUris: ['spotify:track:A'],
      }),
    );

    expect(ended).not.toHaveBeenCalled();
  });

  it('NAO emite ended durante playback normal (sem fim)', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    const URI = 'spotify:track:A';
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 10_000, durationMs: 200_000, curUri: URI }));
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 50_000, durationMs: 200_000, curUri: URI }));
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 120_000, durationMs: 200_000, curUri: URI }));

    expect(ended).not.toHaveBeenCalled();
  });

  it('NAO emite ended em pause manual no MEIO da faixa', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    const URI = 'spotify:track:A';
    // tocando.
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 80_000, durationMs: 200_000, curUri: URI }));
    // pause no meio: paused, position NO MEIO (nao 0, nao >=dur), faixa ainda corrente.
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 80_000, durationMs: 200_000, curUri: URI }));

    expect(ended).not.toHaveBeenCalled();
  });

  it('dedupe: dois player_state_changed de fim consecutivos -> ended 1x (nao pula faixa)', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({
      source: 'spotify',
      trackId: 'spotify:track:A',
      title: 'A',
    } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    const URI = 'spotify:track:A';
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 198_000, durationMs: 200_000, curUri: URI }));
    // dois eventos de fim seguidos (SDK pode emitir em duplicata).
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 0, durationMs: 200_000, curUri: URI }));
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 0, durationMs: 200_000, curUri: URI }));

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('dedupe reset: nova faixa via load -> pode emitir SEU proprio ended', async () => {
    const { driver, player } = await setupReadyDriver();

    const ended = vi.fn();
    driver.on('ended', ended);

    // Faixa A termina.
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);
    const A = 'spotify:track:A';
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 195_000, durationMs: 200_000, curUri: A }));
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 0, durationMs: 200_000, curUri: A }));
    expect(ended).toHaveBeenCalledTimes(1);

    // Nova faixa B carregada -> guard resetado.
    await driver.load({ source: 'spotify', trackId: 'spotify:track:B', title: 'B' } as any);
    const B = 'spotify:track:B';
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 205_000, durationMs: 210_000, curUri: B }));
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 0, durationMs: 210_000, curUri: B }));

    expect(ended).toHaveBeenCalledTimes(2);
  });

  it('C3 fallback legado preservado: paused && pos>=dur -> ended', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    const URI = 'spotify:track:A';
    player._emit('player_state_changed', stateFor({ paused: false, positionMs: 199_000, durationMs: 200_000, curUri: URI }));
    // device que NAO reseta position: reporta pos>=dur paused.
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 200_000, durationMs: 200_000, curUri: URI }));

    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('NAO emite ended no boot (paused+pos=0 sem ter tocado perto do fim)', async () => {
    const { driver, player } = await setupReadyDriver();
    await driver.load({ source: 'spotify', trackId: 'spotify:track:A', title: 'A' } as any);

    const ended = vi.fn();
    driver.on('ended', ended);

    // Estado inicial: paused, position 0, sem wasPlaying perto do fim antes.
    player._emit('player_state_changed', stateFor({ paused: true, positionMs: 0, durationMs: 200_000, curUri: 'spotify:track:A' }));

    expect(ended).not.toHaveBeenCalled();
  });
});
