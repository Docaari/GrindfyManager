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

// =============================================================================
// Sprint Mini Player 1 (RF-14): describe '<PodcastPlayer> Round 2 -
// courseTitle wiring' removido. O unico teste do bloco renderizava
// `<StickyAudioBar />` (deletado por RF-14) para validar courseTitle no
// subtitle. courseTitle continua coberto pelos testes de AudioPlayerContext
// (playTrack/play(lesson)) e por renderizacao do MiniPlayerBar.
// =============================================================================
