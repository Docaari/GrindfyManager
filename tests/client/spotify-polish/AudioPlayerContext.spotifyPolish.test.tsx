/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — bugs no AudioPlayerContext:
 *   - B-AUTOPLAY-1 (D4): playTrack SEMPRE seta courseContext = ctxArg ?? null
 *     (state + courseContextRef sincrono). Track Spotify (sem ctx) NAO herda o
 *     courseContext de uma sessao de biblioteca anterior.
 *   - B-RESUME-1 (D3): useEffect[isPlaying] no toggle chama drv.resume()/drv.pause(),
 *     NAO drv.play() (que reinicia do 0).
 *   - B-TOKEN-CLOSURE (D5): a factory le spotifyTokenRef.current na construcao
 *     (token fresco apos refresh), nao o closure connect-time.
 *   - B-VOLUME-1 (D5): a factory aplica o volume atual ao driver pos-construcao.
 *   - B-SKIP-2: skipToQueueItem (do context) toca o item alvo (playTrack), nao
 *     so fatia a fila.
 *
 * Lesson #3 — mock so do Engine/Driver para capturar wiring real; connectSpotify
 * e playTrack sao codigo de producao. Lesson #38 — so `await import` no arquivo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const { capturedFactoryRef, capturedDriverDeps, fakeDriver } = vi.hoisted(() => {
  const driver = {
    source: 'spotify',
    deviceId: 'DEV-1',
    play: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    pause: vi.fn(() => undefined),
    seek: vi.fn(),
    load: vi.fn(async () => undefined),
    setVolume: vi.fn(),
    setSpeed: vi.fn(),
    getCurrentTime: () => 0,
    getDuration: () => 0,
    destroy: vi.fn(),
    connect: vi.fn(async () => undefined),
    on: vi.fn(() => () => {}),
  };
  return {
    capturedFactoryRef: { current: null as null | ((t: any) => any) },
    capturedDriverDeps: { current: null as any },
    fakeDriver: driver,
  };
});

vi.mock('@/lib/audio-engine/AudioSourceEngine', () => {
  class FakeEngine {
    _factory: any = null;
    setSpotifyDriverFactory(factory: any) {
      capturedFactoryRef.current = factory;
      this._factory = factory;
    }
    setAudioElement() {}
    setOnDriverSwitch() {}
    on() {
      return () => {};
    }
    async playTrack(_track: any) {
      // simula a Engine construindo o driver via factory no 1o play Spotify.
      if (this._factory) this._factory(_track);
    }
    getActiveDriver() {
      return fakeDriver;
    }
    pause() {}
    seek() {}
    setVolume() {}
    setSpeed() {}
    getCurrentTime() {
      return 0;
    }
    getDuration() {
      return 0;
    }
    destroy() {}
  }
  return {
    AudioSourceEngine: FakeEngine,
    createAudioSourceEngine: () => new FakeEngine(),
  };
});

const setVolumeSpy = vi.fn();
vi.mock('@/lib/audio-engine/SpotifyAudioDriver', () => {
  class FakeSpotifyDriver {
    source = 'spotify';
    constructor(deps: any) {
      capturedDriverDeps.current = deps;
    }
    connect() {
      return Promise.resolve();
    }
    load() {
      return Promise.resolve();
    }
    play() {
      return Promise.resolve();
    }
    resume() {
      return Promise.resolve();
    }
    pause() {}
    seek() {}
    setVolume(v: number) {
      setVolumeSpy(v);
    }
    setSpeed() {}
    getCurrentTime() {
      return 0;
    }
    getDuration() {
      return 0;
    }
    destroy() {}
    on() {
      return () => {};
    }
  }
  return { SpotifyAudioDriver: FakeSpotifyDriver };
});

vi.mock('@/lib/spotify/auth', () => ({
  invalidateSpotifyStatus: vi.fn(),
  refreshAccessToken: vi.fn(async () => ({ accessToken: 'refreshed', expiresIn: 3600 })),
  resolveViaStatusFallback: vi.fn(async () => null),
}));
vi.mock('@/lib/audio-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

let captured: any = null;
function makeCapture(useAudioPlayer: () => any) {
  return function Capture() {
    captured = useAudioPlayer();
    return null;
  };
}

async function mountProvider() {
  const mod = await import('@/contexts/AudioPlayerContext');
  const { AudioPlayerProvider, useAudioPlayer } = mod;
  const Capture = makeCapture(useAudioPlayer);
  await act(async () => {
    render(
      <AudioPlayerProvider>
        <Capture />
      </AudioPlayerProvider>,
    );
  });
  return mod;
}

const SPOTIFY_TRACK = {
  source: 'spotify' as const,
  trackId: 'spotify:track:abc',
  title: 'Music',
  durationSeconds: 180,
};

const LIB_CTX = {
  courseSlug: 'curso-x',
  currentIndex: 0,
  lessons: [
    { source: 'library' as const, trackId: 'l1', title: 'Aula 1', durationSeconds: 60 },
    { source: 'library' as const, trackId: 'l2', title: 'Aula 2', durationSeconds: 60 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  capturedFactoryRef.current = null;
  capturedDriverDeps.current = null;
  captured = null;
});

// ---------------------------------------------------------------------------
// B-AUTOPLAY-1 — courseContext residual (D4)
// ---------------------------------------------------------------------------
describe('AudioPlayerContext courseContext residual (B-AUTOPLAY-1 / D4)', () => {
  it('playTrack(libTrack, ctx) seta courseContext', async () => {
    await mountProvider();
    await act(async () => {
      captured.playTrack(LIB_CTX.lessons[0], LIB_CTX);
    });
    expect(captured.courseContext).toBeTruthy();
    expect(captured.courseContext.courseSlug).toBe('curso-x');
  });

  it('playTrack(spotifyTrack) SEM ctx LIMPA courseContext (nao herda o anterior)', async () => {
    await mountProvider();
    // 1) toca uma aula de biblioteca (seta courseContext).
    await act(async () => {
      captured.playTrack(LIB_CTX.lessons[0], LIB_CTX);
    });
    expect(captured.courseContext).toBeTruthy();

    // 2) toca uma musica Spotify SEM ctx -> courseContext deve virar null.
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
      captured.playTrack(SPOTIFY_TRACK);
    });

    expect(captured.courseContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B-RESUME-1 — toggle pause->play chama resume() (D3)
// ---------------------------------------------------------------------------
describe('AudioPlayerContext toggle usa resume (B-RESUME-1 / D3)', () => {
  it('toggle pause->play do track Spotify chama driver.resume (NAO driver.play)', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
      captured.playTrack(SPOTIFY_TRACK);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // limpa contagem do play inicial (via engine).
    fakeDriver.play.mockClear();
    fakeDriver.resume.mockClear();
    fakeDriver.pause.mockClear();

    // pausa.
    await act(async () => {
      captured.toggle();
    });
    expect(fakeDriver.pause).toHaveBeenCalled();

    // retoma -> deve chamar resume, NAO play (que reiniciaria do 0).
    await act(async () => {
      captured.toggle();
    });
    expect(fakeDriver.resume).toHaveBeenCalled();
    expect(fakeDriver.play).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B-TOKEN-CLOSURE / B-VOLUME-1 — factory le token fresco + aplica volume (D5)
// ---------------------------------------------------------------------------
describe('AudioPlayerContext factory token fresco + volume (B-TOKEN-CLOSURE / B-VOLUME-1 / D5)', () => {
  it('factory aplica o volume atual ao driver recem-construido', async () => {
    await mountProvider();
    setVolumeSpy.mockClear();
    // user ajusta volume ANTES de tocar Spotify.
    await act(async () => {
      captured.setVolume(0.3);
    });
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
    });
    setVolumeSpy.mockClear();
    // constroi o driver via factory (como a Engine faria).
    let driver: any;
    await act(async () => {
      driver = capturedFactoryRef.current!(SPOTIFY_TRACK);
    });
    expect(driver).toBeTruthy();
    // A factory deve aplicar o volume atual (0.3) ao driver pos-construcao.
    expect(setVolumeSpy).toHaveBeenCalledWith(0.3);
  });

  it('factory le spotifyTokenRef.current na construcao (token fresco apos refresh)', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_OLD', 3600, 'Founder');
    });
    // 1a construcao -> deps.accessToken = token connect-time.
    await act(async () => {
      capturedFactoryRef.current!(SPOTIFY_TRACK);
    });
    const deps1 = capturedDriverDeps.current;
    expect(deps1).toBeTruthy();

    // simula refresh: o callback onTokenRefreshed atualiza o ref.
    await act(async () => {
      deps1.onTokenRefreshed?.('ACCESS_NEW', 3600);
    });

    // 2a construcao (troca de source / novo driver) -> deve usar o token NOVO,
    // nao o closure connect-time 'ACCESS_OLD'.
    await act(async () => {
      capturedFactoryRef.current!(SPOTIFY_TRACK);
    });
    const deps2 = capturedDriverDeps.current;
    expect(deps2.accessToken).toBe('ACCESS_NEW');
  });
});

// ---------------------------------------------------------------------------
// B-SKIP-2 — skipToQueueItem wrapper toca o item (playTrack)
// ---------------------------------------------------------------------------
describe('AudioPlayerContext skipToQueueItem wrapper (B-SKIP-2)', () => {
  it('skipToQueueItem(id) toca o track do item alvo (muda activeTrack)', async () => {
    await mountProvider();
    // enfileira 2 tracks de biblioteca.
    let id2 = '';
    await act(async () => {
      captured.addToQueue({ source: 'library', trackId: 'q1', title: 'Q1', audioUrl: 'http://a/1.mp3' });
      captured.addToQueue({ source: 'library', trackId: 'q2', title: 'Q2', audioUrl: 'http://a/2.mp3' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const items = captured.queueItems;
    expect(items.length).toBe(2);
    id2 = items[1].id;

    await act(async () => {
      captured.skipToQueueItem(id2);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // o item alvo virou now-playing.
    expect(captured.activeTrack?.trackId).toBe('q2');
  });

  it('skipToQueueItem(id) remove o item alvo (e os anteriores) da fila', async () => {
    await mountProvider();
    await act(async () => {
      captured.addToQueue({ source: 'library', trackId: 'q1', title: 'Q1', audioUrl: 'http://a/1.mp3' });
      captured.addToQueue({ source: 'library', trackId: 'q2', title: 'Q2', audioUrl: 'http://a/2.mp3' });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const id2 = captured.queueItems[1].id;

    await act(async () => {
      captured.skipToQueueItem(id2);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // q2 saiu da fila (virou now-playing); q1 (anterior) tambem removido.
    const remainingIds = captured.queueItems.map((q: any) => q.track.trackId);
    expect(remainingIds).not.toContain('q2');
    expect(remainingIds).not.toContain('q1');
  });
});

// ---------------------------------------------------------------------------
// B-DEDUP-Q — addToQueue dedup por trackId
// ---------------------------------------------------------------------------
describe('AudioPlayerContext addToQueue dedup por trackId (B-DEDUP-Q)', () => {
  it('adicionar a mesma musica 2x -> fila tem 1 item (dedup)', async () => {
    await mountProvider();
    const t = { source: 'spotify' as const, trackId: 'spotify:track:dup', title: 'Dup', durationSeconds: 100 };
    await act(async () => {
      captured.addToQueue(t);
      captured.addToQueue(t);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const dupCount = captured.queueItems.filter(
      (q: any) => q.track.trackId === 'spotify:track:dup',
    ).length;
    expect(dupCount).toBe(1);
  });
});
