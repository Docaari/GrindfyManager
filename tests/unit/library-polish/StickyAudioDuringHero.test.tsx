// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-06 + D12 — Sticky audio durante hero
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-06 + D12
//
// Componentes target:
//   - LessonHeroPage com integracao AudioPlayerContext (NAO EXISTE)
//
// Comportamento esperado:
//   - StickyAudioBar continua tocando durante hero mount (nao desmonta)
//   - audioCtx.isPlaying && audioCtx.current.lessonId !== lesson.id ->
//       LessonHero recebe isOtherAudioPlaying=true + otherAudioLabel
//   - StickyAudioBar visivel no DOM (renderiza acima do hero)
//   - Hero NAO interage com AudioPlayerContext (so leitura, nao chama play/pause)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('framer-motion', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...rest }: any, ref: any) => {
      const {
        initial,
        animate,
        exit,
        transition,
        variants,
        whileHover,
        whileTap,
        whileFocus,
        whileInView,
        onAnimationStart,
        onAnimationComplete,
        ...domProps
      } = rest;
      return React.createElement(tag, { ref, ...domProps }, children);
    });
  return {
    motion: new Proxy({}, { get: (_t, p: string) => passthrough(p) }),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => false,
  };
});

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

const setLocationMock = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
  useLocation: () => ['/x', setLocationMock],
}));

// AudioPlayerContext real do projeto: shape { current, isPlaying, ... }.
// Mockamos useOptionalAudioPlayer para retornar valores controlados por teste.
let audioCtxValue: any = null;
vi.mock('@/contexts/AudioPlayerContext', async () => {
  const actual: any = await vi.importActual(
    '@/contexts/AudioPlayerContext',
  );
  return {
    ...actual,
    useOptionalAudioPlayer: () => audioCtxValue,
  };
});

// @ts-expect-error - red phase
import { LessonHeroPage } from '../../../client/src/pages/biblioteca/LessonHeroPage';
import { StickyAudioBar } from '../../../client/src/components/biblioteca/StickyAudioBar';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

const lessonA1 = {
  id: 'lesson-a1',
  slug: 'a1',
  courseSlug: 'antes-das-cartas',
  title: 'Aula A1',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast', 'article'],
};

const lessonA4 = {
  id: 'lesson-a4',
  slug: 'a4',
  courseSlug: 'antes-das-cartas',
  title: 'Aula A4',
  coverKey: 'covers/a4.jpg',
  durationMinutes: 12,
  formats: ['podcast', 'article'],
};

beforeEach(() => {
  vi.clearAllMocks();
  audioCtxValue = null;
  try {
    localStorage.clear();
  } catch {
    // ok
  }
});

afterEach(() => {
  audioCtxValue = null;
});

describe('<LessonHeroPage> + StickyAudioBar — RF-06 + D12', () => {
  it('quando audio de outra lesson esta tocando, CTA muda para "Trocar pra esta aula"', async () => {
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a2',
        audioUrl: '/audio/a2',
        title: 'Dicotomia do Controle',
        durationSeconds: 1500,
      },
      isPlaying: true,
      currentSeconds: 100,
      durationSeconds: 1500,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const cta = screen.getByTestId('lesson-hero-cta-start');
      expect((cta.textContent ?? '').toLowerCase()).toMatch(/trocar/);
    });
  });

  it('chip "Tocando agora" deve mostrar titulo da lesson sendo reproduzida', async () => {
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a2',
        audioUrl: '/audio/a2',
        title: 'Dicotomia do Controle',
        durationSeconds: 1500,
      },
      isPlaying: true,
      currentSeconds: 0,
      durationSeconds: 1500,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const chip = screen.getByTestId('lesson-hero-other-audio-chip');
      expect(chip.textContent ?? '').toMatch(/Dicotomia do Controle/);
    });
  });

  it('quando audio da MESMA lesson toca, CTA permanece "Iniciar aula"', async () => {
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a4',
        audioUrl: '/audio/a4',
        title: 'A4',
        durationSeconds: 1200,
      },
      isPlaying: true,
      currentSeconds: 0,
      durationSeconds: 1200,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const cta = screen.getByTestId('lesson-hero-cta-start');
      expect((cta.textContent ?? '').toLowerCase()).toMatch(/iniciar aula/);
    });
    expect(screen.queryByTestId('lesson-hero-other-audio-chip')).toBeNull();
  });

  it('quando isPlaying === false, CTA permanece normal mesmo com lesson diferente carregada', async () => {
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a2',
        audioUrl: '/audio/a2',
        title: 'A2',
        durationSeconds: 1500,
      },
      isPlaying: false, // pausado
      currentSeconds: 100,
      durationSeconds: 1500,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const cta = screen.getByTestId('lesson-hero-cta-start');
      expect((cta.textContent ?? '').toLowerCase()).toMatch(/iniciar aula/);
    });
  });

  it('LessonHeroPage NAO chama play/pause/seek do AudioPlayerContext (read-only)', async () => {
    const playSpy = vi.fn();
    const pauseSpy = vi.fn();
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a2',
        audioUrl: '/audio/a2',
        title: 'A2',
        durationSeconds: 1500,
      },
      isPlaying: true,
      currentSeconds: 100,
      durationSeconds: 1500,
      speed: 1,
      play: playSpy,
      pause: pauseSpy,
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
    });
    expect(playSpy).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('StickyAudioBar permanece renderizado ao lado do hero (vivido em layout root)', () => {
    audioCtxValue = {
      current: {
        lessonId: 'lesson-a2',
        audioUrl: '/audio/a2',
        title: 'A2',
        coverUrl: null,
        durationSeconds: 1500,
      },
      isPlaying: true,
      currentSeconds: 100,
      durationSeconds: 1500,
      speed: 1,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      close: vi.fn(),
      seek: vi.fn(),
      setSpeed: vi.fn(),
      skipBack: vi.fn(),
      skipForward: vi.fn(),
    };
    apiRequestMock.mockResolvedValue(lessonA4);
    render(
      <QueryClientProvider client={makeClient()}>
        <>
          <StickyAudioBar />
          <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a4" />
        </>
      </QueryClientProvider>,
    );
    // Sticky bar visivel no DOM (testid pode variar; ao menos um audio-bar deve aparecer)
    const sticky =
      screen.queryByTestId('sticky-audio-bar') ??
      screen.queryByTestId('podcast-sticky-bar') ??
      screen.queryByRole('region', { name: /audio|podcast/i });
    expect(sticky).not.toBeNull();
  });
});
