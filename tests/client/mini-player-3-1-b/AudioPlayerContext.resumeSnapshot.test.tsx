// Sprint Mini Player 3.1 Wave B / TIER 3 #4 — cross-reload resume snapshot
// (write debounced + boot restore window flag).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

const trackLibrary = {
  source: 'library' as const,
  trackId: 'resume-track',
  title: 'Aula resume',
  coverUrl: null,
  courseTitle: 'Curso',
  durationSeconds: 600,
  audioUrl: '/audio/resume',
};

function loadContext() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/contexts/AudioPlayerContext');
}

function loadResumeUtil() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/lib/audio-engine/resumeSession');
}

function Probe() {
  const { useAudioPlayer } = loadContext();
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="play"
      onClick={() => ctx.playTrack(trackLibrary)}
    >
      play
    </button>
  );
}

describe('AudioPlayerContext resume snapshot (Wave B TIER 3 #4)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    try {
      delete (window as any).__audioPlayerLastResumeSnapshot;
    } catch {
      // ignore
    }
  });

  it('boot le snapshot existente em localStorage e expoe via window flag', () => {
    const { writeResumeSnapshot } = loadResumeUtil();
    writeResumeSnapshot({
      trackId: 'snap-track-1',
      currentSeconds: 88,
      isPlaying: false,
      timestamp: Date.now(),
    });
    const { AudioPlayerProvider } = loadContext();
    render(
      <AudioPlayerProvider>
        <div />
      </AudioPlayerProvider>,
    );
    const flag = (window as any).__audioPlayerLastResumeSnapshot;
    expect(flag).toBeTruthy();
    expect(flag.trackId).toBe('snap-track-1');
    expect(flag.currentSeconds).toBe(88);
  });

  it('boot SEM snapshot existente -> window flag fica undefined', () => {
    const { AudioPlayerProvider } = loadContext();
    render(
      <AudioPlayerProvider>
        <div />
      </AudioPlayerProvider>,
    );
    expect((window as any).__audioPlayerLastResumeSnapshot).toBeUndefined();
  });

  it('playTrack imediato apos pause -> snapshot persistido (immediate persist on pause)', () => {
    // Reviewer HIGH-1 fix: durante playback ativo, persist roda em interval 10s.
    // Em pause (isPlaying=false), persist eh imediato via efeito dedicado.
    // playTrack arma isPlaying=true imediato — testamos via pause explicito.
    const { AudioPlayerProvider, useAudioPlayer } = loadContext();
    function ProbePause() {
      const ctx = useAudioPlayer();
      return (
        <div>
          <button data-testid="play" onClick={() => ctx.playTrack(trackLibrary)}>
            play
          </button>
          <button data-testid="pause" onClick={() => ctx.pause()}>
            pause
          </button>
        </div>
      );
    }
    render(
      <AudioPlayerProvider>
        <ProbePause />
      </AudioPlayerProvider>,
    );
    act(() => {
      (screen.getByTestId('play') as HTMLButtonElement).click();
    });
    act(() => {
      (screen.getByTestId('pause') as HTMLButtonElement).click();
    });
    const { readResumeSnapshot } = loadResumeUtil();
    const snap = readResumeSnapshot();
    expect(snap).not.toBeNull();
    expect(snap.trackId).toBe(trackLibrary.trackId);
    expect(snap.isPlaying).toBe(false);
  });
});
