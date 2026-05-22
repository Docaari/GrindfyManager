// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-01 - MiniPlayerBar persistente
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-01
//
// Target: client/src/components/audio-player/MiniPlayerBar.tsx (NAO EXISTE)
//
// Cobertura:
//   - data-testid="mini-player-bar"
//   - fixed bottom-0 z-40
//   - retorna null quando displayMode === 'hidden'
//   - role="complementary" + aria-label PT-BR
//   - sobrevive a re-mount via context (lesson #12 ja garantida no Provider)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Helpers via require() para tolerar red phase (modulos podem nao existir).
function loadModules() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ctxMod = require('@/contexts/AudioPlayerContext');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const barMod = require('@/components/audio-player/MiniPlayerBar');
  return { ...ctxMod, ...barMod };
}

function PlayInitiator() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="trigger-play"
      onClick={() =>
        ctx.playTrack({
          source: 'library',
          trackId: 'l1',
          title: 'Aula 1',
          coverUrl: '/cover.jpg',
          courseTitle: 'Curso',
          durationSeconds: 1200,
          audioUrl: '/audio/l1.mp3',
        })
      }
    >
      play
    </button>
  );
}

describe('<MiniPlayerBar> (RF-01)', () => {
  it('NAO renderiza quando displayMode === "hidden" (sem track)', () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    expect(screen.queryByTestId('mini-player-bar')).toBeNull();
  });

  it('renderiza com data-testid="mini-player-bar" apos playTrack', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('possui role="complementary" + aria-label PT-BR', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    const bar = screen.getByTestId('mini-player-bar');
    expect(bar.getAttribute('role')).toBe('complementary');
    expect(bar.getAttribute('aria-label')).toMatch(/player/i);
  });

  it('aplica classes Tailwind "fixed bottom-0" + z-40', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    const bar = screen.getByTestId('mini-player-bar');
    const cls = bar.className;
    expect(cls).toMatch(/fixed/);
    expect(cls).toMatch(/bottom-0/);
    expect(cls).toMatch(/z-40/);
  });

  it('renderiza titulo e curso do current track', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByText('Aula 1')).toBeInTheDocument();
    expect(screen.getByText('Curso')).toBeInTheDocument();
  });

  it('renderiza cover art (img) com src do current.coverUrl', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('/cover.jpg');
  });
});
