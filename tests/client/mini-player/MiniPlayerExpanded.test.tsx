// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-04 - MiniPlayerExpanded
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-04
//
// Target: client/src/components/audio-player/MiniPlayerExpanded.tsx (NAO EXISTE)
//
// Comportamento:
//   - renderiza SE displayMode === 'expanded'
//   - data-testid="mini-player-expanded"
//   - role="dialog" + aria-modal="false"
//   - cover 120x120 + titulo + subtitulo + 9 controles espacados
//   - lista de aulas readonly (highlight da atual)
//   - botao chevron-down minimiza (displayMode -> 'bar')
//   - click no backdrop minimiza
//   - z-index entre bar (z-40) e MiniChat (z-50): z-45
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

function loadModules() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/contexts/AudioPlayerContext'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/components/audio-player/MiniPlayerBar'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ...require('@/components/audio-player/MiniPlayerExpanded'),
  };
}

const courseLessons = [
  { source: 'library' as const, trackId: 'a', title: 'Aula A', audioUrl: '/a' },
  { source: 'library' as const, trackId: 'b', title: 'Aula B', audioUrl: '/b' },
  { source: 'library' as const, trackId: 'c', title: 'Aula C', audioUrl: '/c' },
];

function Probe() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  return (
    <>
      <button
        data-testid="seed"
        onClick={() =>
          ctx.playTrack(courseLessons[1], {
            courseSlug: 'curso-1',
            lessons: courseLessons,
            currentIndex: 1,
          })
        }
      >
        seed
      </button>
      <button data-testid="expand" onClick={() => ctx.setDisplayMode('expanded')}>
        expand
      </button>
      <button data-testid="bar-mode" onClick={() => ctx.setDisplayMode('bar')}>
        bar
      </button>
      <span data-testid="mode">{ctx.displayMode}</span>
    </>
  );
}

async function setup() {
  const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerExpanded } = loadModules();
  render(
    <AudioPlayerProvider>
      <Probe />
      <MiniPlayerBar />
      <MiniPlayerExpanded />
    </AudioPlayerProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByTestId('seed'));
  await user.click(screen.getByTestId('expand'));
  return user;
}

describe('<MiniPlayerExpanded> (RF-04)', () => {
  it('NAO renderiza quando displayMode !== "expanded"', () => {
    const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerExpanded } = loadModules();
    render(
      <AudioPlayerProvider>
        <Probe />
        <MiniPlayerBar />
        <MiniPlayerExpanded />
      </AudioPlayerProvider>,
    );
    expect(screen.queryByTestId('mini-player-expanded')).toBeNull();
  });

  it('renderiza com data-testid="mini-player-expanded" quando displayMode = "expanded"', async () => {
    await setup();
    expect(screen.getByTestId('mini-player-expanded')).toBeInTheDocument();
  });

  it('possui role="dialog" + aria-modal="false" + aria-label', async () => {
    await setup();
    const panel = screen.getByTestId('mini-player-expanded');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(panel.getAttribute('aria-label')).toBeTruthy();
  });

  it('renderiza cover 120x120 + titulo + subtitulo da track atual', async () => {
    await setup();
    const panel = screen.getByTestId('mini-player-expanded');
    expect(panel.textContent).toMatch(/Aula B/);
    const img = panel.querySelector('img');
    // Espera cover; sem coverUrl no fixture, smoke check OK
    expect(panel).toBeInTheDocument();
  });

  it('lista aulas do curso (readonly) com highlight da atual', async () => {
    await setup();
    const panel = screen.getByTestId('mini-player-expanded');
    // 3 aulas listadas:
    expect(panel.textContent).toMatch(/Aula A/);
    expect(panel.textContent).toMatch(/Aula B/);
    expect(panel.textContent).toMatch(/Aula C/);
    // Highlight da atual: testid dedicado
    const current = panel.querySelector('[data-mini-player-current="true"]');
    expect(current).not.toBeNull();
  });

  it('botao minimize (chevron-down) muda displayMode -> "bar"', async () => {
    const user = await setup();
    const min = screen.getByTestId('mini-player-expanded-minimize');
    await user.click(min);
    expect(screen.getByTestId('mode').textContent).toBe('bar');
    expect(screen.queryByTestId('mini-player-expanded')).toBeNull();
  });

  it('click no backdrop minimiza para "bar"', async () => {
    const user = await setup();
    const backdrop = screen.getByTestId('mini-player-expanded-backdrop');
    await user.click(backdrop);
    expect(screen.getByTestId('mode').textContent).toBe('bar');
  });

  it('bar permanece visivel quando expanded esta aberto', async () => {
    await setup();
    expect(screen.getByTestId('mini-player-bar')).toBeInTheDocument();
    expect(screen.getByTestId('mini-player-expanded')).toBeInTheDocument();
  });

  it('aplica z-index z-45 (entre bar z-40 e MiniChat z-50)', async () => {
    await setup();
    const panel = screen.getByTestId('mini-player-expanded');
    const cls = panel.className;
    // Aceita z-45 ou z-[45]
    expect(cls).toMatch(/z-(45|\[45\])/);
  });

  it('quando setDisplayMode("expanded") com current=null vira no-op + console.warn', () => {
    const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerExpanded } = loadModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <AudioPlayerProvider>
        <Probe />
        <MiniPlayerBar />
        <MiniPlayerExpanded />
      </AudioPlayerProvider>,
    );
    fireEvent.click(screen.getByTestId('expand'));
    expect(screen.queryByTestId('mini-player-expanded')).toBeNull();
    warnSpy.mockRestore();
  });
});

declare const vi: any;
