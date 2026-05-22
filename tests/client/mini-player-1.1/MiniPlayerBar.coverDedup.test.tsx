// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-02 (integration cover) + RF-10 (cover dedup)
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-02 + RF-10
//
// Targets:
//   - client/src/components/audio-player/MiniPlayerBar.tsx (existe — refactor)
//
// Cobertura RF-10:
//   - <img> NAO tem style.animationName inline
//   - <img> mantem className contendo animate-spin-slow
//
// Cobertura RF-02 (integration via track):
//   - playTrack com coverUrl="javascript:alert(1)" -> placeholder (sem <img>)
//   - playTrack com coverUrl=null -> placeholder
//   - playTrack com coverUrl https valida -> <img src=...>
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AudioPlayerProvider, useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { MiniPlayerBar } from '@/components/audio-player/MiniPlayerBar';

function PlayInitiator({ coverUrl }: { coverUrl: string | null }) {
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="trigger-play"
      onClick={() =>
        ctx.playTrack({
          source: 'library',
          trackId: 'l1',
          title: 'Aula 1',
          coverUrl,
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

describe('MiniPlayerBar cover (RF-02 + RF-10)', () => {
  it('RF-10: cover img NAO tem style.animationName inline', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="https://cdn.example.com/cover.jpg" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();
    // Reviewer NIT-3: remove inline animationName / animationDuration / etc.
    const styleAttr = img!.getAttribute('style') ?? '';
    expect(styleAttr).not.toMatch(/animation-name/i);
    expect(styleAttr).not.toMatch(/animationName/);
  });

  it('RF-10: cover img mantem className animate-spin-slow', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="https://cdn.example.com/cover.jpg" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.className).toMatch(/animate-spin-slow/);
  });

  it('RF-02: coverUrl javascript:alert -> SEM <img> (placeholder)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl={'javascript:alert(1)' as any} />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    // sanitize retorna null -> placeholder renderiza (div sem img)
    expect(img).toBeNull();
  });

  it('RF-02: coverUrl null -> SEM <img> (placeholder)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl={null} />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).toBeNull();
  });

  it('RF-02: coverUrl https valida -> renderiza <img src=...>', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="https://cdn.example.com/cover.jpg" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toContain('https://cdn.example.com/cover.jpg');
  });

  it('RF-02: coverUrl data:image -> placeholder (sanitize bloqueia)', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator coverUrl="data:image/png;base64,iVBORw0KGgo=" />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));

    const bar = screen.getByTestId('mini-player-bar');
    const img = bar.querySelector('img');
    expect(img).toBeNull();
  });
});
