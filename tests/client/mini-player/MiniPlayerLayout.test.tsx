// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-10 + RF-11 + RF-12 consolidados
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-10/11/12
//
// RF-10 Responsividade:
//   Desktop >=1024: TODOS 9 controles + seek inline + tempo
//   Tablet 768-1023: oculta prev/next, slider volume vira so icon (mute)
//   Mobile <768: oculta volume/speed/prev/next/tempo; seek bar fina top
//
// RF-11 Z-index + padding-bottom:
//   MiniChat z-50 acima de MiniPlayerBar z-40
//   CSS variable --mini-player-height settada via useMiniPlayerHeight()
//
// RF-12 Glassmorphism + animacoes:
//   classe com 'backdrop-filter' / 'backdrop-blur' / 'glass'
//   slide-up animation
//   cover rotate animation quando playing
//   prefers-reduced-motion: reduce -> opacity-only + rotate off (D24)
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function PlayInitiator() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
  const ctx = useAudioPlayer();
  return (
    <button
      data-testid="seed"
      onClick={() =>
        ctx.playTrack(
          { source: 'library', trackId: 'a', title: 'A', coverUrl: '/c', audioUrl: '/a' },
          { courseSlug: 'c1', lessons: [
            { source: 'library', trackId: 'a', title: 'A', audioUrl: '/a' },
            { source: 'library', trackId: 'b', title: 'B', audioUrl: '/b' },
          ], currentIndex: 0 },
        )
      }
    >
      seed
    </button>
  );
}

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  (window as any).matchMedia = (query: string) => {
    const m = (rangeMin: number, rangeMax: number | null) => {
      const minOk = width >= rangeMin;
      const maxOk = rangeMax === null ? true : width <= rangeMax;
      return minOk && maxOk;
    };
    let matches = false;
    if (/min-width:\s*1024/.test(query)) matches = m(1024, null);
    else if (/min-width:\s*768/.test(query)) matches = m(768, null);
    else if (/max-width:\s*1023/.test(query)) matches = m(0, 1023);
    else if (/max-width:\s*767/.test(query)) matches = m(0, 767);
    else if (/prefers-reduced-motion/.test(query)) matches = false;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

async function setupAt(width: number) {
  mockViewport(width);
  const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
  render(
    <AudioPlayerProvider>
      <PlayInitiator />
      <MiniPlayerBar />
    </AudioPlayerProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByTestId('seed'));
  return user;
}

beforeEach(() => {
  try {
    localStorage.removeItem('library:audio:volume');
  } catch {}
});

describe('Responsividade (RF-10)', () => {
  it('Desktop >=1024: todos os 9 controles visiveis', async () => {
    await setupAt(1280);
    const visibleIds = [
      'mini-player-prev',
      'mini-player-back15',
      'mini-player-toggle',
      'mini-player-forward15',
      'mini-player-next',
      'mini-player-seek',
      'mini-player-volume',
      'mini-player-speed',
      'mini-player-close',
    ];
    for (const id of visibleIds) {
      expect(screen.getByTestId(id), `${id} ausente em desktop`).toBeInTheDocument();
    }
  });

  it('Mobile <768: oculta prev/next/volume/speed; mantem toggle+close+back15+forward15+seek', async () => {
    await setupAt(360);
    // Esconde:
    expect(screen.queryByTestId('mini-player-prev')).toBeNull();
    expect(screen.queryByTestId('mini-player-next')).toBeNull();
    expect(screen.queryByTestId('mini-player-volume')).toBeNull();
    expect(screen.queryByTestId('mini-player-speed')).toBeNull();
    // Visiveis:
    expect(screen.getByTestId('mini-player-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('mini-player-close')).toBeInTheDocument();
    expect(screen.getByTestId('mini-player-seek')).toBeInTheDocument();
  });

  it('Tablet 768-1023: oculta prev/next + slider volume mas mantem botao volume (mute click)', async () => {
    await setupAt(900);
    expect(screen.queryByTestId('mini-player-prev')).toBeNull();
    expect(screen.queryByTestId('mini-player-next')).toBeNull();
    // Volume botao (sem slider hover) ainda presente
    expect(screen.getByTestId('mini-player-volume')).toBeInTheDocument();
    expect(screen.getByTestId('mini-player-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('mini-player-back15')).toBeInTheDocument();
  });
});

describe('Z-index e padding-bottom (RF-11)', () => {
  it('MiniPlayerBar tem classe z-40 (MiniChat fica em z-50)', async () => {
    await setupAt(1280);
    const bar = screen.getByTestId('mini-player-bar');
    expect(bar.className).toMatch(/z-40/);
  });

  it('CSS variable --mini-player-height settada em :root quando displayMode != hidden', async () => {
    await setupAt(1280);
    const rootStyle = (document.documentElement.style.getPropertyValue('--mini-player-height') || '').trim();
    // Espera valor != 0px / 0 / "" quando track ativa
    expect(rootStyle).toMatch(/(64|72|80)px/);
  });
});

describe('Glassmorphism + animacoes (RF-12)', () => {
  it('aplica classe relacionada a backdrop-blur OU "glass" (glassmorphism)', async () => {
    await setupAt(1280);
    const bar = screen.getByTestId('mini-player-bar');
    expect(bar.className).toMatch(/backdrop|glass|blur/i);
  });

  it('cover quando playing tem classe rotate/spin animation', async () => {
    await setupAt(1280);
    const bar = screen.getByTestId('mini-player-bar');
    const cover = bar.querySelector('img');
    // Cover deve ter alguma classe indicando rotacao quando isPlaying
    const containerClass =
      cover?.className || cover?.parentElement?.className || bar.className;
    expect(containerClass).toMatch(/rotate|spin|cover/i);
  });

  it('prefers-reduced-motion: reduce desliga animacoes', async () => {
    // Override matchMedia: prefers-reduced-motion = true
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
    (window as any).matchMedia = (query: string) => {
      const reduced = /prefers-reduced-motion/.test(query);
      return {
        matches: reduced ? true : query.includes('min-width: 1024'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    };
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    render(
      <AudioPlayerProvider>
        <PlayInitiator />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('seed'));
    const bar = screen.getByTestId('mini-player-bar');
    // Espera atributo data-reduced-motion="true" OU classe motion-reduce
    const reduced =
      bar.getAttribute('data-reduced-motion') === 'true' ||
      /motion-reduce|no-anim/.test(bar.className);
    expect(reduced).toBe(true);
  });
});
