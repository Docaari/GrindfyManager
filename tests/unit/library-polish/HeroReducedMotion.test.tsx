// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / D11 + ADR-098 — Reduced motion compliance
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md D11 + RF-01 + RF-04
// ADR: Docs/architecture/decisions/098-hero-cinematic-animation-strategy.md
//
// Componente target: client/src/components/biblioteca/LessonHero.tsx (NAO EXISTE)
//
// Spec D11: prefers-reduced-motion: reduce desabilita animacoes (mount instant).
// Skip button RF-04 mantem timer 3000ms (delay de UX, nao animation).
// useReducedMotion hook do framer-motion retorna boolean reactive.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock seletivo: useReducedMotion retorna true. motion components ainda
// renderizam DOM; queremos verificar comportamento condicional.
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
      // Marca elementos com data-reduced-motion=true para que assertions
      // possam validar que componente respondeu ao hook.
      return React.createElement(tag, { ref, ...domProps }, children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, prop: string) => passthrough(prop),
      },
    ),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true, // FORCED REDUCED MOTION
  };
});

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Componente target — RED phase, ainda nao existe.
// @ts-expect-error
import { LessonHero } from '../../../client/src/components/biblioteca/LessonHero';

const baseLesson = {
  id: 'l-a1',
  slug: 'a1',
  courseSlug: 'antes-das-cartas',
  title: 'Aula A1',
  subtitle: 'Sub',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast', 'article'] as Array<'video' | 'podcast' | 'article'>,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<LessonHero> reduced motion (D11 + WCAG 2.3.3)', () => {
  it('deve montar mesmo com useReducedMotion === true (sem quebrar)', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-hero-title')).toBeInTheDocument();
  });

  it('deve marcar root com data-reduced-motion="true" quando hook retorna true', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    const root = screen.getByTestId('lesson-hero');
    // Componente deve expor o estado reduced-motion via attr para testes/css.
    expect(root.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('CTA primario continua interativo com reduced motion', async () => {
    const onStart = vi.fn();
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={onStart}
      />,
    );
    await user.click(screen.getByTestId('lesson-hero-cta-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('skip button ainda aparece apos 3s mesmo com reduced motion (delay eh UX, nao animation)', async () => {
    vi.useFakeTimers();
    const { act } = await import('@testing-library/react');
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-skip-button')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('lesson-hero-skip-button')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
