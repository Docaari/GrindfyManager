// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 — instrumentar MiniPlayerBar audio.*
//
// Cobertura:
//   - Click no toggle (play) emite `audio.play`.
//   - Click no toggle quando playing emite `audio.pause`.
//   - Click no seek slider OR next/prev emite `audio.seek` / `audio.next` / `audio.prev`.
//
// Lessons:
//   #14/#26/#38: await import lib + componente; nunca misturar require+await import.
//   #27: Radix Tabs reage onMouseDown — usar userEvent.click pra simular pipeline real.
//   #29: ErrorBoundary nao necessario aqui (mock AudioPlayerContext).
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const { emitAudioMock } = vi.hoisted(() => ({ emitAudioMock: vi.fn() }));

vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: emitAudioMock,
  emitLessonEvent: vi.fn(),
  emitCoachEvent: vi.fn(),
  emitLibraryEvent: vi.fn(),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));
vi.mock('@/lib/audio-telemetry', () => ({
  emitAudioEvent: emitAudioMock,
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

// Mock AudioPlayerContext shape esperada por MiniPlayerBar.
const { ctxMock } = vi.hoisted(() => ({
  ctxMock: {
    isPlaying: false,
    activeTrack: {
      source: 'library',
      trackId: 'tr1',
      title: 'Aula 1',
      coverUrl: '/c.png',
      audioUrl: '/a.mp3',
      durationSeconds: 300,
    },
    activeSource: 'internal_mp4',
    volume: 1,
    isMuted: false,
    currentTime: 30,
    duration: 300,
    queue: [],
    queueIndex: 0,
    displayMode: 'mini',
    isBuffering: false,
    loadError: null,
    togglePlayPause: vi.fn(),
    playNext: vi.fn(),
    playPrevious: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    setDisplayMode: vi.fn(),
    skipForward: vi.fn(),
    skipBack: vi.fn(),
    retryCurrent: vi.fn(),
    clearLoadError: vi.fn(),
    setSpeed: vi.fn(),
    speed: 1,
  },
}));

vi.mock('@/contexts/AudioPlayerContext', () => ({
  useAudioPlayer: () => ctxMock,
  useOptionalAudioPlayer: () => ctxMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  ctxMock.isPlaying = false;
});

afterEach(() => cleanup());

describe('MiniPlayerBar — RF-01 telemetria audio.*', () => {
  it('clicar no toggle (play) emite audio.play', async () => {
    const user = userEvent.setup();
    const { MiniPlayerBar } = await import('@/components/audio-player/MiniPlayerBar');

    render(<MiniPlayerBar />);
    const toggle = screen.getByTestId('mini-player-toggle');
    await user.click(toggle);

    const audioPlay = emitAudioMock.mock.calls.find((c: any[]) => c[0] === 'audio.play');
    expect(audioPlay).toBeDefined();
  });

  it('clicar no toggle quando playing emite audio.pause', async () => {
    ctxMock.isPlaying = true;
    const user = userEvent.setup();
    const { MiniPlayerBar } = await import('@/components/audio-player/MiniPlayerBar');

    render(<MiniPlayerBar />);
    const toggle = screen.getByTestId('mini-player-toggle');
    await user.click(toggle);

    const audioPause = emitAudioMock.mock.calls.find((c: any[]) => c[0] === 'audio.pause');
    expect(audioPause).toBeDefined();
  });

  it('clicar next emite audio.next', async () => {
    const user = userEvent.setup();
    const { MiniPlayerBar } = await import('@/components/audio-player/MiniPlayerBar');

    render(<MiniPlayerBar />);
    const next = screen.getByTestId('mini-player-next');
    await user.click(next);

    const audioNext = emitAudioMock.mock.calls.find((c: any[]) => c[0] === 'audio.next');
    expect(audioNext).toBeDefined();
  });

  it('clicar prev emite audio.prev', async () => {
    const user = userEvent.setup();
    const { MiniPlayerBar } = await import('@/components/audio-player/MiniPlayerBar');

    render(<MiniPlayerBar />);
    const prev = screen.getByTestId('mini-player-prev');
    await user.click(prev);

    const audioPrev = emitAudioMock.mock.calls.find((c: any[]) => c[0] === 'audio.prev');
    expect(audioPrev).toBeDefined();
  });
});
