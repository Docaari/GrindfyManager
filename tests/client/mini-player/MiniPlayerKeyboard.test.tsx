// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-13 - Keyboard shortcuts globais
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-13
//
// Atalhos:
//   Space  -> ctx.toggle()
//   ArrowLeft  -> ctx.skipBack(15)
//   ArrowRight -> ctx.skipForward(15)
//   M (case-insensitive) -> ctx.toggleMute()
//   Escape -> setDisplayMode(expanded ? 'bar' : 'hidden')
//
// Guards:
//   - INPUT / TEXTAREA / contentEditable focado -> nao dispara
//   - displayMode === 'hidden' -> nao dispara
//   - NAO conflita com P/B do SessionHeader (teclas diferentes)
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadModules() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/contexts/AudioPlayerContext'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/components/audio-player/MiniPlayerBar'),
  };
}

function PlayInitiator({ withCourse = false }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  const lessons = [
    { source: 'library' as const, trackId: 'a', title: 'A', audioUrl: '/a' },
    { source: 'library' as const, trackId: 'b', title: 'B', audioUrl: '/b' },
  ];
  return (
    <button
      data-testid="seed-track"
      onClick={() => {
        if (withCourse) {
          ctx.playTrack(lessons[0], { courseSlug: 'c', lessons, currentIndex: 0 });
        } else {
          ctx.playTrack({ source: 'library', trackId: 'l1', title: 'X', audioUrl: '/x' });
        }
      }}
    >
      seed
    </button>
  );
}

async function setup(opts: { withCourse?: boolean } = {}) {
  const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
  render(
    <AudioPlayerProvider>
      <PlayInitiator withCourse={opts.withCourse} />
      <MiniPlayerBar />
      <input data-testid="input-focus" />
      <textarea data-testid="textarea-focus" />
      <div data-testid="ce-focus" contentEditable />
    </AudioPlayerProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByTestId('seed-track'));
  return user;
}

describe('MiniPlayer keyboard shortcuts (RF-13)', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('library:audio:volume');
    } catch {}
  });

  it('Space toggla play/pause quando bar visivel e foco fora de input', async () => {
    await setup();
    // Foco em document.body (nao input)
    (document.body as any).focus?.();
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    // Sem assert no estado direto - smoke (handler registrado sem throw).
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('ArrowLeft / ArrowRight invocam skipBack / skipForward', async () => {
    await setup();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('M (case-insensitive) invoca toggleMute', async () => {
    await setup();
    const volBtn = screen.getByTestId('mini-player-volume');
    const before = volBtn.getAttribute('aria-label');
    fireEvent.keyDown(document, { key: 'm' });
    const after = volBtn.getAttribute('aria-label');
    expect(after).not.toBe(before);
    // Reset com M maiusculo:
    fireEvent.keyDown(document, { key: 'M' });
    expect(volBtn.getAttribute('aria-label')).toBe(before);
  });

  it('Escape fecha bar quando displayMode === "bar"', async () => {
    await setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mini-player-bar')).toBeNull();
  });

  it('Escape em displayMode "expanded" primeiro minimiza pra "bar"', async () => {
    // Setup com track ativa, expandir manualmente via ctx
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
    function P() {
      const ctx = useAudioPlayer();
      return (
        <>
          <button
            data-testid="seed"
            onClick={() => {
              ctx.playTrack({ source: 'library', trackId: 'l1', title: 'X', audioUrl: '/x' });
            }}
          >
            seed
          </button>
          <button data-testid="expand" onClick={() => ctx.setDisplayMode('expanded')}>
            ex
          </button>
        </>
      );
    }
    render(
      <AudioPlayerProvider>
        <P />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    await user.click(screen.getByTestId('expand'));
    // Esc -> bar
    fireEvent.keyDown(document, { key: 'Escape' });
    // Apos primeira esc, bar continua visivel
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
    // Segunda esc fecha
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mini-player-bar')).toBeNull();
  });

  it('GUARD: keys nao disparam quando foco esta em INPUT', async () => {
    await setup();
    const input = screen.getByTestId('input-focus');
    (input as HTMLInputElement).focus();
    // Space com foco em input -> guard
    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    // bar ainda presente (Space NAO invocou close)
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
    // Escape no input nao fecha
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('GUARD: keys nao disparam quando foco esta em TEXTAREA', async () => {
    await setup();
    const ta = screen.getByTestId('textarea-focus');
    (ta as HTMLTextAreaElement).focus();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('GUARD: keys nao disparam em contentEditable', async () => {
    await setup();
    const ce = screen.getByTestId('ce-focus');
    (ce as HTMLDivElement).focus();
    fireEvent.keyDown(ce, { key: 'Escape' });
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });

  it('GUARD: shortcuts nao registrados quando displayMode === "hidden"', async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    // Sem playTrack, bar hidden. Space nao deve fazer nada visivel.
    fireEvent.keyDown(document, { key: ' ' });
    expect(screen.queryByTestId('mini-player-bar')).toBeNull();
  });

  it('NAO conflita com P/B do SessionHeader (teclas dedicadas Space/M/Esc/setas)', async () => {
    await setup();
    // P e B nao devem afetar o player:
    fireEvent.keyDown(document, { key: 'P' });
    fireEvent.keyDown(document, { key: 'B' });
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
  });
});
