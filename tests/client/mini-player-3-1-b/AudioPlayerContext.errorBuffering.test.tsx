// Sprint Mini Player 3.1 Wave B / TIER 3 #5 + #6 — Error + Buffering surface.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

const trackLibrary = {
  source: 'library' as const,
  trackId: 'tb-err',
  title: 'Aula Err',
  coverUrl: null,
  courseTitle: 'Curso',
  durationSeconds: 600,
  audioUrl: '/audio/err',
};

function loadContext() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/contexts/AudioPlayerContext');
}

function Probe() {
  const { useAudioPlayer } = loadContext();
  const ctx = useAudioPlayer();
  return (
    <div>
      <button
        data-testid="play"
        onClick={() => ctx.playTrack(trackLibrary)}
      >
        play
      </button>
      <button data-testid="retry" onClick={() => ctx.retryCurrent()}>
        retry
      </button>
      <button data-testid="clear" onClick={() => ctx.clearLoadError()}>
        clear
      </button>
      <div data-testid="snap-loadError">{String(ctx.loadError ?? 'null')}</div>
      <div data-testid="snap-isBuffering">{String(ctx.isBuffering)}</div>
    </div>
  );
}

describe('AudioPlayerContext error + buffering (Wave B TIER 3 #5/#6)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('expoe loadError + retryCurrent + clearLoadError + isBuffering na surface', () => {
    const { AudioPlayerProvider } = loadContext();
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    expect(screen.getByTestId('snap-loadError').textContent).toBe('null');
    expect(screen.getByTestId('snap-isBuffering').textContent).toBe('false');
  });

  it('playTrack arma buffering=true', () => {
    const { AudioPlayerProvider } = loadContext();
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    act(() => {
      (screen.getByTestId('play') as HTMLButtonElement).click();
    });
    // Apos playTrack, buffering=true (ate canplay/timeupdate ou timeout).
    expect(screen.getByTestId('snap-isBuffering').textContent).toBe('true');
  });

  it('retryCurrent + clearLoadError sao callable sem throw mesmo sem track', () => {
    const { AudioPlayerProvider } = loadContext();
    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );
    expect(() => {
      act(() => {
        (screen.getByTestId('retry') as HTMLButtonElement).click();
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        (screen.getByTestId('clear') as HTMLButtonElement).click();
      });
    }).not.toThrow();
  });
});
