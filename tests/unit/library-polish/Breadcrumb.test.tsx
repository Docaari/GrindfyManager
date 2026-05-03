// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-08 — Breadcrumb sticky no LessonViewer
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-08
//
// Componente target: client/src/pages/biblioteca/LessonViewer.tsx (modificacao)
// Adiciona breadcrumb sticky no topo: "Biblioteca / {courseTitle} / Aula {label}"
//
// data-testid: lesson-viewer-breadcrumb
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// Mock Mux player.
vi.mock('@mux/mux-player-react', () => ({
  default: (props: any) => (
    <div data-testid="mux-player-mock" data-playback-id={props.playbackId} />
  ),
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));

// Sprint UX-Biblioteca-1 / RF-05B: LessonViewer agora usa useLocation pra
// auto-nav do NextLessonCTA. Adicionamos mock no-op aqui.
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
  useLocation: () => ['/biblioteca/curso/x/y', vi.fn()],
}));

import { LessonViewer } from '../../../client/src/pages/biblioteca/LessonViewer';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

const lessonFixture = {
  id: 'lesson-a1',
  slug: 'a1-mentalidade',
  courseSlug: 'antes-das-cartas',
  title: 'Mentalidade Fixa',
  subtitle: 'Sub',
  displayLabel: 'A.1',
  formats: {
    article: { html: '<p>x</p>', wordCount: 1 },
  },
};

const courseFixture = {
  id: 'course-1',
  slug: 'antes-das-cartas',
  title: 'Antes das Cartas',
  modules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<LessonViewer> breadcrumb sticky (RF-08)', () => {
  function setupMocks() {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (
        method === 'GET' &&
        url.includes('/api/library/lessons/by-slug/')
      ) {
        return lessonFixture;
      }
      if (method === 'GET' && url.includes('/api/library/courses/')) {
        return courseFixture;
      }
      if (method === 'GET' && url.includes('/progress')) return {};
      return null;
    });
  }

  it('deve renderizar breadcrumb com data-testid lesson-viewer-breadcrumb', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId('lesson-viewer-breadcrumb'),
      ).toBeInTheDocument();
    });
  });

  it('breadcrumb deve conter texto "Biblioteca"', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      expect(br.textContent).toMatch(/Biblioteca/);
    });
  });

  it('breadcrumb deve conter courseTitle', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      expect(br.textContent).toMatch(/Antes das Cartas/);
    });
  });

  it('breadcrumb deve conter "Aula {displayLabel}"', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      expect(br.textContent).toMatch(/Aula\s*A\.1/);
    });
  });

  it('breadcrumb deve ter aria-label="Breadcrumb" para a11y', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      expect(br.getAttribute('aria-label')).toBe('Breadcrumb');
    });
  });

  it('breadcrumb deve ter classe sticky (position: sticky via Tailwind class)', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      // Tailwind: sticky top-0
      expect(br.className).toMatch(/sticky/);
    });
  });

  it('breadcrumb link "Biblioteca" deve ter href="/biblioteca"', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      const links = br.querySelectorAll('a');
      const found = Array.from(links).some(
        (a) => (a as HTMLAnchorElement).getAttribute('href') === '/biblioteca',
      );
      expect(found).toBe(true);
    });
  });

  it('breadcrumb link de curso deve apontar para /biblioteca/curso/{slug}', async () => {
    setupMocks();
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const br = screen.getByTestId('lesson-viewer-breadcrumb');
      const links = br.querySelectorAll('a');
      const found = Array.from(links).some(
        (a) =>
          (a as HTMLAnchorElement).getAttribute('href') ===
          '/biblioteca/curso/antes-das-cartas',
      );
      expect(found).toBe(true);
    });
  });
});
