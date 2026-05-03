// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-05 + D11 — Cross-fade hero -> player
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-05 + D11
// ADR: Docs/architecture/decisions/098-hero-cinematic-animation-strategy.md
//
// Componentes target:
//   - client/src/components/biblioteca/PlayerEntryAnimation.tsx (NAO EXISTE)
//   - LessonHeroPage internal exit state (NAO EXISTE)
//
// Comportamento esperado:
//   - PlayerEntryAnimation wraps children com motion.div fade-in 500ms delay 200ms
//   - Click "Iniciar aula" no hero -> isExiting=true -> fade-out 700ms -> setLocation('/play')
//   - AnimatePresence mode="wait" garante hero unmount antes de player mount
//   - Background do parent eh bg-black para evitar flash branco
//   - Reduced motion respeita: animacoes pulam, navegacao instant
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock framer-motion preserva onAnimationComplete handler para que o test
// possa simular animation done.
const motionCallbacks: Array<() => void> = [];

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
      // Captura onAnimationComplete para simulacao manual via helper.
      if (onAnimationComplete) motionCallbacks.push(onAnimationComplete);
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
  useLocation: () => ['/biblioteca/curso/x/y', setLocationMock],
}));

// Componentes target — RED phase.
// @ts-expect-error
import { PlayerEntryAnimation } from '../../../client/src/components/biblioteca/PlayerEntryAnimation';
// @ts-expect-error
import { LessonHeroPage } from '../../../client/src/pages/biblioteca/LessonHeroPage';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

const lessonFixture = {
  id: 'lesson-id-1',
  slug: 'a1',
  courseSlug: 'antes-das-cartas',
  title: 'Aula A1',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: ['podcast', 'article'],
};

beforeEach(() => {
  vi.clearAllMocks();
  motionCallbacks.length = 0;
  try {
    localStorage.clear();
  } catch {
    // ok
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<PlayerEntryAnimation> wrapper (RF-05)', () => {
  it('deve renderizar children dentro do motion wrapper', () => {
    render(
      <PlayerEntryAnimation>
        <div data-testid="inner-content">conteudo</div>
      </PlayerEntryAnimation>,
    );
    expect(screen.getByTestId('inner-content')).toBeInTheDocument();
  });

  it('deve expor data-testid player-entry-animation no wrapper', () => {
    render(
      <PlayerEntryAnimation>
        <div>x</div>
      </PlayerEntryAnimation>,
    );
    expect(
      screen.getByTestId('player-entry-animation'),
    ).toBeInTheDocument();
  });
});

describe('<LessonHeroPage> exit transition (RF-05)', () => {
  it('click "Iniciar aula" deve mudar root para data-state="exiting"', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-cta-start')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lesson-hero-cta-start'));
    await waitFor(() => {
      // Pagina expoe estado de saida via data-state ou data-exiting.
      const root = screen.getByTestId('lesson-hero-page-root');
      const state =
        root.getAttribute('data-state') ?? root.getAttribute('data-exiting');
      expect(state === 'exiting' || state === 'true').toBe(true);
    });
  });

  it('click "Iniciar aula" multiplo NAO deve disparar setLocation duas vezes (debounce via state)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-cta-start')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    const cta = screen.getByTestId('lesson-hero-cta-start');
    await user.click(cta);
    await user.click(cta);
    await user.click(cta);
    // Eventualmente setLocation deve ter sido chamado para /play apenas uma vez.
    await waitFor(() => {
      const playCalls = setLocationMock.mock.calls.filter((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(playCalls.length).toBe(1);
    });
  });

  it('apos animation complete, setLocation deve ser chamado para /play', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-cta-start')).toBeInTheDocument();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('lesson-hero-cta-start'));
    // Simula onAnimationComplete (caso o componente espere o callback).
    act(() => {
      motionCallbacks.forEach((cb) => cb());
    });
    await waitFor(() => {
      const playCall = setLocationMock.mock.calls.find((c) =>
        typeof c[0] === 'string' ? c[0].endsWith('/play') : false,
      );
      expect(playCall).toBeTruthy();
    });
  });

  it('background do root expoe className contendo bg-black ou tema escuro (sem flash branco)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonHeroPage courseSlug="antes-das-cartas" lessonSlug="a1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-page-root')).toBeInTheDocument();
    });
    const root = screen.getByTestId('lesson-hero-page-root');
    const cls = root.className;
    expect(cls).toMatch(/bg-(black|gray-9|neutral-9|zinc-9)/);
  });
});
