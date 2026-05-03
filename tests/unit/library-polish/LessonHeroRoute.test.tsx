// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-02 — Routing wrapper /play vs hero
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-02
// ADR: Docs/architecture/decisions/096-hero-prologue-routing-pattern.md
//
// Modulo target: client/src/App.tsx (modificacao das rotas) + LessonHeroPage.
// Estrategia: testar via MemoryRouter (memory-location wouter) para confirmar
// que cada path resolve para o componente correto.
//
// Comportamento esperado:
//   - /biblioteca/curso/:slug/:lesson         -> LessonHeroPage
//   - /biblioteca/curso/:slug/:lesson/play    -> LessonViewer
//   - Direct URL /play funciona (deep link bypass do hero)
//   - Slugs invalidos caem em error states do componente correspondente
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Router as WouterRouter, Switch, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock framer-motion (mesma estrategia).
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

// Mock Mux player to avoid HLS in jsdom.
vi.mock('@mux/mux-player-react', () => ({
  default: (props: any) => (
    <div data-testid="mux-player-mock" data-playback-id={props.playbackId} />
  ),
}));

// Componentes target — RED phase, ainda nao existem.
// @ts-expect-error
import { LessonHeroPage } from '../../../client/src/pages/biblioteca/LessonHeroPage';
import { LessonViewer } from '../../../client/src/pages/biblioteca/LessonViewer';

const lessonFixture = {
  id: 'lesson-1',
  slug: 'a1-x',
  courseSlug: 'antes-das-cartas',
  title: 'Aula A1',
  subtitle: 'Sub',
  coverKey: 'covers/a1.jpg',
  durationMinutes: 13,
  formats: { article: { html: '<p>x</p>', wordCount: 1 } },
  learningObjectives: [],
  tags: [],
};

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function renderRouter(initialPath: string) {
  // wouter memory-location nao depende de window.location (jsdom-friendly).
  const { hook } = memoryLocation({ path: initialPath, static: false });
  return render(
    <QueryClientProvider client={makeClient()}>
      <WouterRouter hook={hook as any}>
        <Switch>
          <Route path="/biblioteca/curso/:courseSlug/:lessonSlug/play">
            {(params: any) => (
              <LessonViewer
                courseSlug={params.courseSlug}
                lessonSlug={params.lessonSlug}
              />
            )}
          </Route>
          <Route path="/biblioteca/curso/:courseSlug/:lessonSlug">
            {(params: any) => (
              <LessonHeroPage
                courseSlug={params.courseSlug}
                lessonSlug={params.lessonSlug}
              />
            )}
          </Route>
        </Switch>
      </WouterRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    // ok
  }
});

describe('Routing — RF-02 (/play sub-rota)', () => {
  it('path /biblioteca/curso/:slug/:lesson deve carregar LessonHeroPage', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderRouter('/biblioteca/curso/antes-das-cartas/a1-x');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero')).toBeInTheDocument();
    });
    // Garantir que LessonViewer NAO foi montado.
    expect(screen.queryByTestId('lesson-viewer')).toBeNull();
  });

  it('path /biblioteca/curso/:slug/:lesson/play deve carregar LessonViewer', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    renderRouter('/biblioteca/curso/antes-das-cartas/a1-x/play');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
    // Garantir que LessonHero NAO foi montado.
    expect(screen.queryByTestId('lesson-hero')).toBeNull();
  });

  it('rota /play declarada antes de :lesson NAO causa conflito (Wouter ordering)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    // Esperamos que a rota mais especifica (4-segments com /play) ganhe
    // sobre a generica (3-segments) quando path tem /play.
    renderRouter('/biblioteca/curso/x/y/play');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
  });

  it('direct URL para /play funciona como deep link (sem precisar do hero)', async () => {
    apiRequestMock.mockResolvedValue(lessonFixture);
    // Sem flag localStorage, sem visit previa do hero.
    renderRouter('/biblioteca/curso/antes-das-cartas/a1-x/play');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
  });

  it('slug invalido na rota generica resolve no LessonHeroPage error state', async () => {
    const err: any = new Error('not found');
    err.response = { status: 404 };
    apiRequestMock.mockRejectedValue(err);
    renderRouter('/biblioteca/curso/x/inexistente');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-hero-page-error')).toBeInTheDocument();
    });
  });

  it('slug invalido em /play resolve no LessonViewer error state', async () => {
    const err: any = new Error('not found');
    err.response = { status: 404 };
    apiRequestMock.mockRejectedValue(err);
    renderRouter('/biblioteca/curso/x/inexistente/play');
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer-error')).toBeInTheDocument();
    });
  });
});
