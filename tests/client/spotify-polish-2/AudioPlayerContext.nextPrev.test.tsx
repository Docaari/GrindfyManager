/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-NEXTPREV-1 [HIGH] — playNext / playPrevious sem courseContext.
 *
 * Bug atual (AudioPlayerContext ~908/921): playNext/playPrevious comecam com
 *   `const ctxArg = courseContextRef.current; if (!ctxArg) return;`
 * Pos-D4 (courseContext null no Spotify), os botoes next/anterior do MiniPlayer
 * sao NO-OP pro Spotify/fila.
 *
 * Contrato esperado (manifesto WAVE FINAL):
 *   - playNext SEM courseContext -> consome a PROXIMA da FILA (mesma logica de
 *     tryAutoplayNext: shuffle-aware, remove head, playTrack). Empilha o track
 *     atual antes de trocar.
 *   - playPrevious SEM courseContext -> volta pro HISTORICO de reproducao
 *     (novo playHistoryRef empilhado em playTrack quando NAO history-driven);
 *     pop + playTrack.
 *   - sem fila / sem historico -> NO-OP gracioso (nao quebra, nao muda track).
 *   - courseContext (biblioteca) continua funcionando (regressao).
 *
 * Lesson #3 — mock so do Engine/Driver (wiring real do context). Lesson #38 —
 * SO `await import` no arquivo (nunca require) p/ nao duplicar module record.
 * Lesson #29 — Provider real, sem QueryClient necessario aqui (context proprio).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const { capturedFactoryRef, fakeDriver } = vi.hoisted(() => {
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

vi.mock('@/lib/audio-engine/SpotifyAudioDriver', () => {
  class FakeSpotifyDriver {
    source = 'spotify';
    constructor(_deps: any) {}
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
    setVolume() {}
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

const SPOTIFY = (id: string) => ({
  source: 'spotify' as const,
  trackId: `spotify:track:${id}`,
  title: id,
  durationSeconds: 180,
});

const LIB_CTX = {
  courseSlug: 'curso-x',
  currentIndex: 0,
  lessons: [
    { source: 'library' as const, trackId: 'l1', title: 'Aula 1', durationSeconds: 60 },
    { source: 'library' as const, trackId: 'l2', title: 'Aula 2', durationSeconds: 60 },
    { source: 'library' as const, trackId: 'l3', title: 'Aula 3', durationSeconds: 60 },
  ],
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedFactoryRef.current = null;
  captured = null;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// playNext sem courseContext -> consome a fila
// ---------------------------------------------------------------------------
describe('B-NEXTPREV-1 playNext consome a fila quando nao ha courseContext', () => {
  it('com fila: playNext toca o head da fila e o remove', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
    });
    // toca uma musica avulsa (sem ctx) -> courseContext null.
    await act(async () => {
      captured.playTrack(SPOTIFY('now'));
    });
    await flush();
    // enfileira 2 musicas.
    await act(async () => {
      captured.addToQueue(SPOTIFY('a'));
      captured.addToQueue(SPOTIFY('b'));
    });
    await flush();
    expect(captured.queueItems.length).toBe(2);
    const headTrackId = captured.queueItems[0].track.trackId;

    await act(async () => {
      captured.playNext();
    });
    await flush();

    // o head da fila virou now-playing.
    expect(captured.activeTrack?.trackId).toBe(headTrackId);
    // e foi removido da fila.
    const remaining = captured.queueItems.map((q: any) => q.track.trackId);
    expect(remaining).not.toContain(headTrackId);
    expect(captured.queueItems.length).toBe(1);
  });

  it('sem fila e sem courseContext: playNext eh NO-OP gracioso (nao muda o track)', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
      captured.playTrack(SPOTIFY('solo'));
    });
    await flush();
    expect(captured.queueItems.length).toBe(0);

    await act(async () => {
      captured.playNext();
    });
    await flush();

    // continua na mesma musica (sem proxima na fila / sem curso).
    expect(captured.activeTrack?.trackId).toBe('spotify:track:solo');
  });
});

// ---------------------------------------------------------------------------
// playPrevious sem courseContext -> historico
// ---------------------------------------------------------------------------
describe('B-NEXTPREV-1 playPrevious usa o historico quando nao ha courseContext', () => {
  it('apos 2 plays avulsos, playPrevious volta pra musica anterior', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
    });
    // play 1.
    await act(async () => {
      captured.playTrack(SPOTIFY('first'));
    });
    await flush();
    // play 2 (empilha 'first' no historico).
    await act(async () => {
      captured.playTrack(SPOTIFY('second'));
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('spotify:track:second');

    await act(async () => {
      captured.playPrevious();
    });
    await flush();

    // volta pra 'first' (historico).
    expect(captured.activeTrack?.trackId).toBe('spotify:track:first');
  });

  it('sem historico e sem courseContext: playPrevious eh NO-OP gracioso', async () => {
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
      captured.playTrack(SPOTIFY('only'));
    });
    await flush();

    await act(async () => {
      captured.playPrevious();
    });
    await flush();

    // nada anterior -> continua na mesma.
    expect(captured.activeTrack?.trackId).toBe('spotify:track:only');
  });

  it('playPrevious NAO re-empilha (history-driven nao deve poluir o historico)', async () => {
    // toca A, B, C; previous -> B; previous -> A. Se o previous re-empilhasse,
    // o segundo previous voltaria pra B (errado).
    await mountProvider();
    await act(async () => {
      captured.connectSpotify('ACCESS_X', 3600, 'Founder');
    });
    for (const id of ['A', 'B', 'C']) {
      await act(async () => {
        captured.playTrack(SPOTIFY(id));
      });
      await flush();
    }
    expect(captured.activeTrack?.trackId).toBe('spotify:track:C');

    await act(async () => {
      captured.playPrevious();
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('spotify:track:B');

    await act(async () => {
      captured.playPrevious();
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('spotify:track:A');
  });
});

// ---------------------------------------------------------------------------
// Regressao — courseContext (biblioteca) continua funcionando
// ---------------------------------------------------------------------------
describe('B-NEXTPREV-1 regressao biblioteca (courseContext intacto)', () => {
  it('playNext com courseContext avanca pra proxima aula do curso', async () => {
    await mountProvider();
    await act(async () => {
      captured.playTrack(LIB_CTX.lessons[0], LIB_CTX);
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('l1');

    await act(async () => {
      captured.playNext();
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('l2');
  });

  it('playPrevious com courseContext volta pra aula anterior do curso', async () => {
    await mountProvider();
    await act(async () => {
      captured.playTrack(LIB_CTX.lessons[1], { ...LIB_CTX, currentIndex: 1 });
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('l2');

    await act(async () => {
      captured.playPrevious();
    });
    await flush();
    expect(captured.activeTrack?.trackId).toBe('l1');
  });
});
