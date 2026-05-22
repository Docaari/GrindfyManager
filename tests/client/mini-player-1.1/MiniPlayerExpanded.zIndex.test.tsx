// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-06 - z-[45] em MiniPlayerExpanded
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-06 + Docs/conventions/z-index.md
//
// Target: client/src/components/audio-player/MiniPlayerExpanded.tsx (existe)
//
// Cobertura:
//   - root tem className contendo "z-[45]" (Tailwind arbitrary explicito)
//   - root NAO tem "z-45" literal (que e a sintaxe nao-Tailwind-default
//     que reviewer flagou — JIT trata como arbitrary mas grep falha)
//   - backdrop continua com "z-40"
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AudioPlayerProvider, useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { MiniPlayerBar } from '@/components/audio-player/MiniPlayerBar';
import { MiniPlayerExpanded } from '@/components/audio-player/MiniPlayerExpanded';

function PlayInitiator() {
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="trigger-play"
      onClick={() => {
        ctx.playTrack({
          source: 'library',
          trackId: 'l1',
          title: 'Aula 1',
          coverUrl: 'https://cdn.example.com/c.jpg',
          courseTitle: 'Curso',
          durationSeconds: 1200,
          audioUrl: '/audio/l1.mp3',
        });
      }}
    >
      play
    </button>
  );
}

function ExpandTrigger() {
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="trigger-expand"
      onClick={() => ctx.setDisplayMode('expanded')}
    >
      expand
    </button>
  );
}

describe('MiniPlayerExpanded z-index (RF-06)', () => {
  it('root tem className "z-[45]" (Tailwind arbitrary explicito)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <ExpandTrigger />
        <MiniPlayerBar />
        <MiniPlayerExpanded />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    await user.click(screen.getByTestId('trigger-expand'));

    const expanded = screen.getByTestId('mini-player-expanded');
    // RF-06: usa Tailwind arbitrary value `z-[45]` (com brackets).
    expect(expanded.className).toMatch(/z-\[45\]/);
  });

  it('root NAO tem o token literal "z-45 " ou final-of-class "z-45"', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <ExpandTrigger />
        <MiniPlayerBar />
        <MiniPlayerExpanded />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    await user.click(screen.getByTestId('trigger-expand'));

    const expanded = screen.getByTestId('mini-player-expanded');
    const tokens = expanded.className.split(/\s+/);
    // Regression: nao volta para token `z-45` literal (sem brackets).
    expect(tokens).not.toContain('z-45');
  });

  it('backdrop continua com "z-40" (inalterado)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <ExpandTrigger />
        <MiniPlayerBar />
        <MiniPlayerExpanded />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    await user.click(screen.getByTestId('trigger-expand'));

    const backdrop = screen.getByTestId('mini-player-expanded-backdrop');
    expect(backdrop.className).toMatch(/\bz-40\b/);
  });

  it('MiniPlayerBar mantem z-40 (regressao MP1)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    expect(bar.className).toMatch(/\bz-40\b/);
  });
});
