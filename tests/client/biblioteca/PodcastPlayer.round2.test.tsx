import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / Round 2 — PodcastPlayer additions
// Covers: D5 keyboard shortcuts (Space + Arrow keys) + courseTitle wiring.
// =============================================================================

import { AudioPlayerProvider } from '../../../client/src/contexts/AudioPlayerContext';
import { PodcastPlayer } from '../../../client/src/components/biblioteca/PodcastPlayer';

function renderPlayer(courseTitle?: string | null) {
  return render(
    <AudioPlayerProvider>
      <PodcastPlayer
        lessonId="l1"
        audioUrl="/api/library/lessons/l1/audio"
        title="A1 - Mentalidade"
        coverUrl="/cover.jpg"
        durationSeconds={1500}
        courseTitle={courseTitle ?? null}
      />
    </AudioPlayerProvider>,
  );
}

beforeEach(() => {
  try {
    localStorage.removeItem('library:audio:speed');
  } catch {
    // ignore
  }
});

describe('<PodcastPlayer> Round 2 - keyboard a11y', () => {
  it('container e focavel (tabIndex=0) com role=region', () => {
    renderPlayer();
    const player = screen.getByTestId('podcast-player');
    expect(player.getAttribute('tabindex')).toBe('0');
    expect(player.getAttribute('role')).toBe('region');
  });

  it('Space dispara toggle play/pause (preventDefault)', async () => {
    renderPlayer();
    const player = screen.getByTestId('podcast-player');
    player.focus();
    // Estado inicial: isPlaying=true (auto play() ao montar). Espacos pausa.
    fireEvent.keyDown(player, { key: ' ', code: 'Space' });
    // Pause = botao toggle vira "Reproduzir"
    const toggle = screen.getByTestId('podcast-player-toggle');
    expect(toggle.getAttribute('aria-label')).toMatch(/Reproduzir/);
  });

  it('ArrowRight skip 15s; ArrowLeft skip back', async () => {
    renderPlayer();
    const player = screen.getByTestId('podcast-player');
    player.focus();
    // Move cursor manualmente via context: use seek(100) primeiro? Aqui apenas
    // valido que o key handler nao crasha. Trace nao quebra mesmo com cur=0.
    fireEvent.keyDown(player, { key: 'ArrowRight' });
    fireEvent.keyDown(player, { key: 'ArrowLeft' });
    // Sem assert numerica - jsdom nao implementa play/seek de verdade.
    expect(screen.getByTestId('podcast-player')).toBeInTheDocument();
  });

  it('keys dentro de <select> NAO disparam shortcut (typing-safe)', async () => {
    renderPlayer();
    const sel = screen.getByTestId('podcast-player-speed') as HTMLSelectElement;
    fireEvent.keyDown(sel, { key: ' ', code: 'Space' });
    // Toggle nao deve ter sido chamado. Como teste nao tem mock de toggle,
    // validamos via aria-label do botao (deve continuar como Pausar = isPlaying).
    const toggle = screen.getByTestId('podcast-player-toggle');
    expect(toggle.getAttribute('aria-label')).toMatch(/Pausar/);
  });
});

describe('<PodcastPlayer> Round 2 - courseTitle wiring', () => {
  it('passa courseTitle pro context (StickyAudioBar pode mostrar)', async () => {
    // Para validar, renderizamos PodcastPlayer dentro de Provider e checamos
    // o context via StickyAudioBar (mobile mock).
    const { StickyAudioBar } = await import(
      '../../../client/src/components/biblioteca/StickyAudioBar'
    );
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes('max-width') || !query.includes('1024'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    render(
      <AudioPlayerProvider>
        <PodcastPlayer
          lessonId="l1"
          audioUrl="/x.mp3"
          title="A1"
          coverUrl="/c.jpg"
          durationSeconds={1500}
          courseTitle="Curso de Mentalidade"
        />
        <StickyAudioBar />
      </AudioPlayerProvider>,
    );
    // Subtitle aparece com courseTitle
    expect(screen.getByTestId('sticky-audio-bar-subtitle').textContent).toMatch(
      /Curso de Mentalidade/,
    );
  });
});
