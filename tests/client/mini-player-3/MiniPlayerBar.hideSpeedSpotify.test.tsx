// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-02 - Hide speed <select> quando Spotify
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-02 + D2 + Q-K (snap, unmount)
//
// Target: client/src/components/audio-player/MiniPlayerBar.tsx
//
// Comportamento:
//   - activeTrack.source === 'library'  -> <select data-testid="mini-player-speed"> visivel
//   - activeTrack.source === 'spotify'  -> <select> NAO renderizado (queryByTestId null)
//   - Re-render switching source toggla render
//   - vp = 'mobile' (showSpeed=false) continua escondendo independente de source
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadModules() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ctxMod = require('@/contexts/AudioPlayerContext');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const barMod = require('@/components/audio-player/MiniPlayerBar');
  return { ...ctxMod, ...barMod };
}

function PlayInitiator({ source }: { source: 'library' | 'spotify' }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid={`trigger-play-${source}`}
      onClick={() => {
        if (source === 'library') {
          ctx.playTrack({
            source: 'library',
            trackId: 'l1',
            title: 'Lesson library',
            audioUrl: '/audio/l1.mp3',
            durationSeconds: 600,
          });
        } else {
          ctx.playTrack({
            source: 'spotify',
            trackId: 'sp1',
            title: 'Track Spotify',
            spotifyUri: 'spotify:track:abc',
            durationSeconds: 200,
          });
        }
      }}
    >
      play
    </button>
  );
}

describe('<MiniPlayerBar> RF-02 — hide speed <select> quando source=spotify', () => {
  beforeEach(() => {
    // Force desktop viewport (showSpeed = true). jsdom default innerWidth=1024.
    try {
      (window as any).innerWidth = 1280;
    } catch {}
  });

  it('source=library -> <select data-testid="mini-player-speed"> renderizado', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator source="library" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play-library'));

    expect(screen.getByTestId('mini-player-speed')).toBeInTheDocument();
  });

  it('source=spotify -> <select data-testid="mini-player-speed"> NAO renderizado (RF-02 D2)', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator source="spotify" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play-spotify'));

    expect(screen.queryByTestId('mini-player-speed')).toBeNull();
  });

  it('switch library -> spotify -> select desaparece (toggle on re-render)', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator source="library" />
        <PlayInitiator source="spotify" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByTestId('trigger-play-library'));
    expect(screen.getByTestId('mini-player-speed')).toBeInTheDocument();

    await user.click(screen.getByTestId('trigger-play-spotify'));
    expect(screen.queryByTestId('mini-player-speed')).toBeNull();
  });

  it('switch spotify -> library -> select reaparece (toggle inverso)', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator source="library" />
        <PlayInitiator source="spotify" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByTestId('trigger-play-spotify'));
    expect(screen.queryByTestId('mini-player-speed')).toBeNull();

    await user.click(screen.getByTestId('trigger-play-library'));
    expect(screen.getByTestId('mini-player-speed')).toBeInTheDocument();
  });

  it('activeTrack null -> select NAO renderizado (regra MP1 inalterada)', () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    expect(screen.queryByTestId('mini-player-speed')).toBeNull();
  });
});
