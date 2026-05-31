/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — B-ARTIST-1 (RF-03 / D8) renderizacao do artista:
 *   - MiniPlayerBar: linha secundaria = artist ?? courseTitle ?? "" (Spotify
 *     mostra artist; library mostra courseTitle).
 *   - QueuePopover: item Spotify mostra artist (data-testid="queue-item-artist").
 *   - AudioTrack.artist e AudioTrackLike.artist sao campos opcionais (type).
 *
 * Lesson #38 — so `await import` (provider real montado). Lesson #3 — render do
 * comportamento, nao do mock.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/spotify/auth', () => ({
  invalidateSpotifyStatus: vi.fn(),
  refreshAccessToken: vi.fn(async () => ({ accessToken: 'x', expiresIn: 3600 })),
  resolveViaStatusFallback: vi.fn(async () => null),
}));
vi.mock('@/lib/audio-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));
vi.mock('@/lib/activity-telemetry', () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

let captured: any = null;
function makeCapture(useAudioPlayer: () => any) {
  return function Capture() {
    captured = useAudioPlayer();
    return null;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = null;
  try {
    (window as any).innerWidth = 1280;
  } catch {}
});

// ---------------------------------------------------------------------------
// MiniPlayerBar — artist na linha secundaria (Spotify)
// ---------------------------------------------------------------------------
describe('MiniPlayerBar now-playing artist (B-ARTIST-1 / D8)', () => {
  it('track Spotify com artist mostra o artista na linha secundaria', async () => {
    const ctxMod = await import('@/contexts/AudioPlayerContext');
    const barMod = await import('@/components/audio-player/MiniPlayerBar');
    const { AudioPlayerProvider, useAudioPlayer } = ctxMod;
    const { MiniPlayerBar } = barMod as any;
    const Capture = makeCapture(useAudioPlayer);

    await act(async () => {
      render(
        <AudioPlayerProvider>
          <Capture />
          <MiniPlayerBar />
        </AudioPlayerProvider>,
      );
    });

    await act(async () => {
      captured.playTrack({
        source: 'spotify',
        trackId: 'spotify:track:abc',
        title: 'My Song',
        artist: 'Miles Davis',
        durationSeconds: 200,
      });
    });

    expect(screen.getByText('Miles Davis')).toBeInTheDocument();
  });

  it('track library (sem artist) continua mostrando courseTitle (nao regride)', async () => {
    const ctxMod = await import('@/contexts/AudioPlayerContext');
    const barMod = await import('@/components/audio-player/MiniPlayerBar');
    const { AudioPlayerProvider, useAudioPlayer } = ctxMod;
    const { MiniPlayerBar } = barMod as any;
    const Capture = makeCapture(useAudioPlayer);

    await act(async () => {
      render(
        <AudioPlayerProvider>
          <Capture />
          <MiniPlayerBar />
        </AudioPlayerProvider>,
      );
    });

    await act(async () => {
      captured.playTrack({
        source: 'library',
        trackId: 'l1',
        title: 'Aula 1',
        courseTitle: 'Curso X',
        audioUrl: '/audio/l1.mp3',
        durationSeconds: 60,
      });
    });

    expect(screen.getByText('Curso X')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// QueuePopover — artist no item Spotify
// ---------------------------------------------------------------------------
describe('QueuePopover artist no item Spotify (B-ARTIST-1 / RF-10.6 / D8)', () => {
  async function loadPopover() {
    const mod = await import('@/components/audio-player/QueuePopover');
    return (mod as any).QueuePopover;
  }

  it('item Spotify com artist exibe data-testid="queue-item-artist" com o artista', async () => {
    const QueuePopover = await loadPopover();
    const noop = () => {};
    const item = {
      id: 'q1',
      addedAt: Date.now(),
      track: {
        source: 'spotify',
        trackId: 'spotify:track:abc',
        title: 'My Song',
        artist: 'Miles Davis',
        coverUrl: null,
        durationSeconds: 200,
      },
    };
    render(
      <QueuePopover
        open={true}
        onOpenChange={noop}
        queue={[item]}
        repeatMode="off"
        shuffleEnabled={false}
        onRemove={noop}
        onReorder={noop}
        onClear={noop}
        onSkip={noop}
        onRepeatChange={noop}
        onToggleShuffle={noop}
      />,
    );
    const artistEl = screen.getByTestId('queue-item-artist');
    expect(artistEl.textContent).toContain('Miles Davis');
  });
});

// ---------------------------------------------------------------------------
// Tipo AudioTrack.artist opcional (compila + aceita)
// ---------------------------------------------------------------------------
describe('AudioTrack.artist tipo opcional (D8)', () => {
  it('um AudioTrack com artist eh aceito pelo playTrack (nao quebra library sem artist)', async () => {
    const ctxMod = await import('@/contexts/AudioPlayerContext');
    const { AudioPlayerProvider, useAudioPlayer } = ctxMod;
    const Capture = makeCapture(useAudioPlayer);
    await act(async () => {
      render(
        <AudioPlayerProvider>
          <Capture />
        </AudioPlayerProvider>,
      );
    });
    // playTrack aceita artist sem throw + activeTrack carrega o campo.
    await act(async () => {
      captured.playTrack({
        source: 'spotify',
        trackId: 'spotify:track:abc',
        title: 'X',
        artist: 'A, B',
        durationSeconds: 100,
      });
    });
    expect(captured.activeTrack?.artist).toBe('A, B');
  });
});
