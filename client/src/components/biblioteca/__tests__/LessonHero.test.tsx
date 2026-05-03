// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-04
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-04
//
// Componente target: client/src/components/biblioteca/LessonHero.tsx (existe — modificar)
//
// Mudanca esperada em RF-04 (lesson #11 — default minimo):
//   - REMOVER botao decorativo "Adicionar lista" (data-testid lesson-hero-cta-add-list)
//   - Manter CTA primario "Iniciar aula".
//
// Tests existentes em tests/unit/library-polish/LessonHero.test.tsx assertam PRESENCA.
// Estes testes assertam AUSENCIA — implementer deve remover o botao para que ambos
// passem (red phase: estes falham ate remocao; tests existentes serao atualizados
// em paralelo pelo implementer ou ficaram quebrados ate alinhamento).
//
// Lessons aplicadas:
//   #2  data-testid estavel
//   #11 default minimo
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// Mock framer-motion (mesma estrategia dos outros tests do hero).
vi.mock('framer-motion', () => {
  const ReactMod = require('react');
  const passthrough = (tag: string) =>
    ReactMod.forwardRef(({ children, ...rest }: any, ref: any) => {
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
      return ReactMod.createElement(tag, { ref, ...domProps }, children);
    });
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, prop: string) => passthrough(prop),
      },
    ),
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => false,
  };
});

import { LessonHero } from '../LessonHero';

const baseLesson = {
  id: 'l-a1',
  slug: 'a1-mentalidade',
  courseSlug: 'antes-das-cartas',
  title: 'Mentalidade Fixa vs de Crescimento',
  subtitle: 'A crenca invisivel.',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast' as const, 'article' as const],
};

afterEach(() => cleanup());

describe('<LessonHero> — RF-04: remover CTA "Adicionar lista" decorativo', () => {
  it('NAO deve renderizar elemento com data-testid="lesson-hero-cta-add-list"', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('lesson-hero-cta-add-list')).toBeNull();
  });

  it('NAO deve renderizar texto "Adicionar lista" no DOM', () => {
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={vi.fn()}
      />,
    );
    // Inspeciona texto inteiro do hero — nenhuma ocorrencia de "Adicionar lista".
    const root = screen.getByTestId('lesson-hero');
    expect(root.textContent ?? '').not.toMatch(/Adicionar lista/i);
  });

  it('CTA primario "Iniciar aula" CONTINUA renderizado e funcional', () => {
    const onStart = vi.fn();
    render(
      <LessonHero
        lesson={baseLesson}
        episodeNumber={1}
        blockLabel="Bloco A"
        onStart={onStart}
      />,
    );
    const cta = screen.getByTestId('lesson-hero-cta-start');
    expect(cta).toBeInTheDocument();
    expect((cta.textContent ?? '').toLowerCase()).toMatch(/iniciar aula/);
  });
});
