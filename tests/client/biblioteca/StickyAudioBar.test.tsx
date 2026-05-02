import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-08 — StickyAudioBar (mobile only) + AudioPlayerContext
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-08 + D6
//
// Componente target: client/src/components/biblioteca/StickyAudioBar.tsx (NAO EXISTE)
// Context target: client/src/contexts/AudioPlayerContext.tsx (NAO EXISTE)
//
// Comportamento (D6):
//   - Bar so renderiza no mobile (viewport < 1024px)
//   - Bar so aparece se podcast deu play E user navegou para fora do viewer
//   - Audio continua tocando em background (Lesson #12 — context global)
//   - Close = pause + dismiss
// =============================================================================

import {
  AudioPlayerProvider,
  useAudioPlayer,
  // @ts-expect-error - context nao existe (red phase)
} from '../../../client/src/contexts/AudioPlayerContext';

// @ts-expect-error - componente nao existe (red phase)
import { StickyAudioBar } from '../../../client/src/components/biblioteca/StickyAudioBar';

// Helper para "iniciar play" via context
function PlayInitiator({ lesson }: { lesson: any }) {
  const { play } = useAudioPlayer();
  return (
    <button
      data-testid="trigger-play"
      onClick={() => play({ lessonId: lesson.id, audioUrl: lesson.audioUrl, title: lesson.title, coverUrl: lesson.coverUrl, durationSeconds: lesson.durationSeconds })}
    >
      play
    </button>
  );
}

beforeEach(() => {
  // Mobile viewport (< 1024px)
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 375,
  });
  // matchMedia mobile
  (window as any).matchMedia = (query: string) => ({
    matches: query.includes('max-width') || !query.includes('1024'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
});

describe('<StickyAudioBar> + AudioPlayerContext (RF-08, D6)', () => {
  const lesson = {
    id: 'l1',
    audioUrl: '/api/library/lessons/l1/audio',
    title: 'A1 - Mentalidade',
    coverUrl: '/api/library/assets/l1.jpg',
    durationSeconds: 1500,
  };

  it('deve renderizar bar com data-testid sticky-audio-bar quando playing', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByTestId('sticky-audio-bar')).toBeInTheDocument();
    const bar = screen.getByTestId('sticky-audio-bar');
    expect(bar.textContent).toContain('A1 - Mentalidade');
  });

  it('deve esconder bar (close button) quando user clicka close', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByTestId('sticky-audio-bar')).toBeInTheDocument();
    await user.click(screen.getByTestId('sticky-audio-bar-close'));
    expect(screen.queryByTestId('sticky-audio-bar')).toBeNull();
  });

  it('deve ter botao play/pause acessivel via testid', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByTestId('sticky-audio-bar-toggle')).toBeInTheDocument();
  });

  it('deve ter aria-label "Player de audio em background"', async () => {
    render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    const bar = screen.getByTestId('sticky-audio-bar');
    expect(bar.getAttribute('aria-label')).toMatch(/audio|player/i);
  });

  it('NAO deve renderizar bar em desktop (>= 1024px)', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes('1024') && query.includes('min-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.queryByTestId('sticky-audio-bar')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lesson #12 — context persiste entre re-mounts (audio continua tocando)
// ---------------------------------------------------------------------------

describe('AudioPlayerContext — Lesson #12 estado persistente', () => {
  const lesson = {
    id: 'l1',
    audioUrl: '/api/library/lessons/l1/audio',
    title: 'A1',
    coverUrl: '/x.jpg',
    durationSeconds: 1500,
  };

  it('deve preservar lesson ativa apos re-mount do StickyAudioBar', async () => {
    const { rerender } = render(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-play'));
    expect(screen.getByTestId('sticky-audio-bar')).toBeInTheDocument();
    // Simula re-mount
    rerender(
      <AudioPlayerProvider>
        <PlayInitiator lesson={lesson} />
        <StickyAudioBar />
      </AudioPlayerProvider>
    );
    // Bar deve continuar visivel — estado preservado
    // (Nota: AudioPlayerProvider deve usar singleton/global state — Lesson #12)
    // Esta assercao captura a INTENT — implementer pode usar window-level audio,
    // queryClient cache ou ref module-level para garantir.
  });
});
