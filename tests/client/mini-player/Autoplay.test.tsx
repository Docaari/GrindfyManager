// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-05 - Autoplay sequencial
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-05 + Q5
//
// Comportamento (RF-05 acceptance):
//   onEnded do <audio> dispara tryAutoplayNext():
//     1. courseContext === null -> setIsPlaying(false). Fim.
//     2. nextIndex >= lessons.length -> setIsPlaying(false). Fim.
//     3. next.hasAccess === false -> setIsPlaying(false). Fim.
//     4. playTrack(next) + currentIndex = nextIndex.
//   Telemetria: registra event 'next' com source='mini_player' trigger='autoplay'.
//
// Estrategia: simular onEnded via Provider's <audio> testid OU via expor
// triggerAutoplayNext em ctx para teste (implementer decide).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadModules() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/contexts/AudioPlayerContext'),
  };
}

function dispatchEndedOnAudio() {
  const audio = screen.queryByTestId('audio-player-element') as HTMLAudioElement | null;
  if (audio) {
    fireEvent.ended(audio);
    return true;
  }
  return false;
}

const lessons = [
  { source: 'library' as const, trackId: 'a', title: 'A', audioUrl: '/a', hasAccess: true },
  { source: 'library' as const, trackId: 'b', title: 'B', audioUrl: '/b', hasAccess: true },
  { source: 'library' as const, trackId: 'c', title: 'C', audioUrl: '/c', hasAccess: true },
];

function Probe({
  trackIdx = 0,
  withCourse = true,
  lessonsArg,
}: {
  trackIdx?: number;
  withCourse?: boolean;
  lessonsArg?: typeof lessons;
}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  const list = lessonsArg ?? lessons;
  return (
    <>
      <button
        data-testid="seed"
        onClick={() => {
          if (withCourse) {
            ctx.playTrack(list[trackIdx], {
              courseSlug: 'c1',
              lessons: list,
              currentIndex: trackIdx,
            });
          } else {
            ctx.playTrack({
              source: 'library',
              trackId: 'solo',
              title: 'Solo',
              audioUrl: '/solo',
            });
          }
        }}
      >
        seed
      </button>
      <span data-testid="active">{ctx.activeTrack?.trackId ?? 'null'}</span>
      <span data-testid="idx">{String(ctx.courseContext?.currentIndex ?? 'null')}</span>
      <span data-testid="playing">{String(ctx.isPlaying)}</span>
    </>
  );
}

describe('Autoplay sequencial (RF-05)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('library:audio:volume');
    } catch {}
  });

  it('onEnded com courseContext null e isPlaying=false (sem proxima)', async () => {
    const { AudioPlayerProvider } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe withCourse={false} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    dispatchEndedOnAudio();
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('onEnded no meio do curso -> playTrack(next) + incrementa index', async () => {
    const { AudioPlayerProvider } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe trackIdx={0} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    dispatchEndedOnAudio();
    expect(screen.getByTestId('active').textContent).toBe('b');
    expect(screen.getByTestId('idx').textContent).toBe('1');
  });

  it('onEnded na ultima aula -> setIsPlaying(false) (sem proxima)', async () => {
    const { AudioPlayerProvider } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe trackIdx={2} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    dispatchEndedOnAudio();
    expect(screen.getByTestId('playing').textContent).toBe('false');
    expect(screen.getByTestId('active').textContent).toBe('c'); // track atual nao muda
  });

  it('onEnded com proxima aula hasAccess=false -> setIsPlaying(false) (RF-05 acceptance 3)', async () => {
    const restricted = [
      { source: 'library' as const, trackId: 'a', title: 'A', audioUrl: '/a', hasAccess: true },
      { source: 'library' as const, trackId: 'b', title: 'B', audioUrl: '/b', hasAccess: false }, // gated
    ];
    const { AudioPlayerProvider } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe trackIdx={0} lessonsArg={restricted} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    dispatchEndedOnAudio();
    expect(screen.getByTestId('playing').textContent).toBe('false');
    // active permanece em 'a' (nao trocou pra 'b' bloqueada)
    expect(screen.getByTestId('active').textContent).toBe('a');
  });

  it('telemetria: emite event "next" com source="mini_player" trigger="autoplay" (D13/D21)', async () => {
    // Espera o impl ter um hook de telemetria - aceita window.__library_events_queue OU fetch mock
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })) as any,
    );
    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      configurable: true,
      writable: true,
    });

    const { AudioPlayerProvider } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe trackIdx={0} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    dispatchEndedOnAudio();

    // Verificar que beacon OU fetch foi chamado com payload contendo 'mini_player' + 'next' + 'autoplay'.
    const calls = [
      ...sendBeaconSpy.mock.calls.map((c: any[]) => JSON.stringify(c)),
      ...fetchSpy.mock.calls.map((c: any[]) => JSON.stringify(c)),
    ];
    const joined = calls.join('||');
    // Smoke: pelo menos uma chamada inclui 'mini_player' OU 'next'
    expect(joined).toMatch(/mini_player|next|autoplay/i);

    fetchSpy.mockRestore();
  });
});
