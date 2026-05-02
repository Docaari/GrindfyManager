import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// =============================================================================
// Sprint Biblioteca-1 / UX Round F10 - PodcastPlayer custom controls
// =============================================================================

import { AudioPlayerProvider } from '../../../client/src/contexts/AudioPlayerContext';
import { PodcastPlayer } from '../../../client/src/components/biblioteca/PodcastPlayer';

function renderPlayer() {
  return render(
    <AudioPlayerProvider>
      <PodcastPlayer
        lessonId="l1"
        audioUrl="/api/library/lessons/l1/audio"
        title="A1 - Mentalidade"
        coverUrl="/cover.jpg"
        durationSeconds={1500}
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

describe('<PodcastPlayer> (F10)', () => {
  it('deve renderizar com testid podcast-player', () => {
    renderPlayer();
    expect(screen.getByTestId('podcast-player')).toBeInTheDocument();
  });

  it('deve mostrar capa + titulo', () => {
    renderPlayer();
    const player = screen.getByTestId('podcast-player');
    expect(player.textContent).toMatch(/A1 - Mentalidade/);
    const img = player.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/cover.jpg');
  });

  it('deve renderizar controles play/skip-back/skip-forward', () => {
    renderPlayer();
    expect(screen.getByTestId('podcast-player-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('podcast-player-skip-back')).toBeInTheDocument();
    expect(screen.getByTestId('podcast-player-skip-forward')).toBeInTheDocument();
  });

  it('deve renderizar dropdown de velocidade com opcoes', () => {
    renderPlayer();
    const sel = screen.getByTestId('podcast-player-speed') as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain('0.75');
    expect(values).toContain('1');
    expect(values).toContain('1.25');
    expect(values).toContain('1.5');
    expect(values).toContain('2');
  });

  it('mudar velocidade via dropdown deve persistir em localStorage', async () => {
    renderPlayer();
    const sel = screen.getByTestId('podcast-player-speed') as HTMLSelectElement;
    const user = userEvent.setup();
    await user.selectOptions(sel, '1.25');
    expect(localStorage.getItem('library:audio:speed')).toBe('1.25');
  });

  it('deve renderizar tempo current/total formatado', () => {
    renderPlayer();
    expect(screen.getByTestId('podcast-player-time-total').textContent).toBe('25:00');
    expect(screen.getByTestId('podcast-player-time-current').textContent).toBe('0:00');
  });
});
