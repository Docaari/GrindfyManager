import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / UX Round Implementer F0 - AudioPlayerContext extensions
//
// Cobre as adicoes do F0 (real <audio> element + currentSeconds/duration +
// seek/setSpeed/skipBack/skipForward + speed persistence).
// =============================================================================

import {
  AudioPlayerProvider,
  useAudioPlayer,
} from '../../../client/src/contexts/AudioPlayerContext';

const lesson = {
  lessonId: 'l1',
  audioUrl: '/api/library/lessons/l1/audio',
  title: 'Aula',
  coverUrl: '/x.jpg',
  durationSeconds: 1200,
};

function Probe() {
  const ctx = useAudioPlayer();
  return (
    <div>
      <button data-testid="play-btn" onClick={() => ctx.play(lesson)}>
        play
      </button>
      <button data-testid="seek-100" onClick={() => ctx.seek(100)}>
        seek100
      </button>
      <button data-testid="speed-1.5" onClick={() => ctx.setSpeed(1.5)}>
        s15
      </button>
      <button data-testid="skipback-15" onClick={() => ctx.skipBack(15)}>
        skipback
      </button>
      <button data-testid="skipfwd-30" onClick={() => ctx.skipForward(30)}>
        skipfwd
      </button>
      <span data-testid="cur">{Math.round(ctx.currentSeconds)}</span>
      <span data-testid="dur">{Math.round(ctx.durationSeconds)}</span>
      <span data-testid="speed">{ctx.speed}</span>
    </div>
  );
}

describe('AudioPlayerContext F0 extensions', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('library:audio:speed');
    } catch {
      // ignore
    }
  });

  it('deve mountar audio element real apos play()', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    expect(screen.queryByTestId('audio-player-element')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    expect(screen.getByTestId('audio-player-element')).toBeInTheDocument();
    const audio = screen.getByTestId('audio-player-element') as HTMLAudioElement;
    expect(audio.src).toContain('/api/library/lessons/l1/audio');
  });

  it('deve expor durationSeconds inicial vindo do lesson.durationSeconds', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    expect(screen.getByTestId('dur').textContent).toBe('1200');
  });

  it('seek(100) deve atualizar currentSeconds', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    await user.click(screen.getByTestId('seek-100'));
    // Aceita 100 ou perto (jsdom audio.duration eh NaN, fallback usa target diretamente).
    const cur = parseInt(screen.getByTestId('cur').textContent || '0', 10);
    expect(cur).toBeGreaterThanOrEqual(99);
  });

  it('setSpeed(1.5) deve persistir em localStorage', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    await user.click(screen.getByTestId('speed-1.5'));
    expect(screen.getByTestId('speed').textContent).toBe('1.5');
    expect(localStorage.getItem('library:audio:speed')).toBe('1.5');
  });

  it('skipForward(30) com cur=100 deve resultar em cur=130', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    await user.click(screen.getByTestId('seek-100'));
    await user.click(screen.getByTestId('skipfwd-30'));
    const cur = parseInt(screen.getByTestId('cur').textContent || '0', 10);
    expect(cur).toBeGreaterThanOrEqual(129);
  });

  it('skipBack(15) com cur=100 deve resultar em cur=85', async () => {
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('play-btn'));
    await user.click(screen.getByTestId('seek-100'));
    await user.click(screen.getByTestId('skipback-15'));
    const cur = parseInt(screen.getByTestId('cur').textContent || '0', 10);
    expect(cur).toBeLessThanOrEqual(86);
    expect(cur).toBeGreaterThanOrEqual(84);
  });
});
