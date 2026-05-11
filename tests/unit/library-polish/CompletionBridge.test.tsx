// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Bloco-A-Polish / RF-07 + D4 + D5 — Badge "Concluida" + Toast "Proxima aula"
//
// Spec: Docs/specs/biblioteca-spec-bloco-a-polish.md RF-07 + D4 + D5
//
// Componente target: client/src/pages/biblioteca/LessonViewer.tsx (modificacao)
//
// Comportamento esperado:
//   - Badge "Concluida" (data-testid lesson-completed-badge) renderiza no header
//     quando algum formato tem completedAt !== null
//   - Toast "Proxima aula: A.X — {titulo}" dispara UMA vez quando maxProgressPct
//     cruza de <90 para >=90 (ref previne fire repetido)
//   - Toast NAO dispara quando nao ha proxima aula (ultima do curso)
//   - Toast tem botao "Iniciar A.X" + auto-dismiss 8s
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
// biblioteca-launch-fix wave 2: useSearch adicionado ao mock pra cobrir
// useCoachRecommendationConsume (transitive via LessonViewer wave Item 4 RF-07).
vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
  useLocation: () => ['/biblioteca/curso/x/y', vi.fn()],
  useSearch: () => '',
}));

// Mock useToast pra capturar chamadas.
// FIX implementer: vi.mock eh hoisted antes de const, gerando TDZ no factory.
// Solucao canonica: vi.hoisted() pra que o spy seja inicializado antes
// do registro do mock (sem alterar comportamento — apenas a ordem de eval).
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
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
  title: 'A1',
  subtitle: 'Sub',
  displayLabel: 'A.1',
  formats: {
    article: { html: '<p>x</p>', wordCount: 1, durationSeconds: 600 },
  },
};

const courseWithNext = {
  id: 'course-1',
  slug: 'antes-das-cartas',
  title: 'Antes das Cartas',
  modules: [
    {
      id: 'm1',
      slug: 'mod1',
      title: 'M1',
      lessons: [
        {
          id: 'lesson-a1',
          slug: 'a1-mentalidade',
          title: 'A1',
          displayLabel: 'A.1',
          durationMinutes: 13,
          formats: ['article'],
          hasAccess: true,
        },
        {
          id: 'lesson-a2',
          slug: 'a2-dicotomia',
          title: 'Dicotomia do Controle',
          displayLabel: 'A.2',
          durationMinutes: 12,
          formats: ['article'],
          hasAccess: true,
        },
      ],
    },
  ],
};

const courseLastLesson = {
  id: 'course-1',
  slug: 'antes-das-cartas',
  title: 'Antes das Cartas',
  modules: [
    {
      id: 'm1',
      slug: 'mod1',
      title: 'M1',
      lessons: [
        {
          id: 'lesson-a1',
          slug: 'a1-mentalidade',
          title: 'A1',
          displayLabel: 'A.1',
          durationMinutes: 13,
          formats: ['article'],
          hasAccess: true,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  toastSpy.mockReset();
});

// =============================================================================
// Badge "Concluida" — D5
// =============================================================================
describe('<LessonViewer> badge "Concluida" (RF-07 + D5)', () => {
  it('NAO deve renderizar badge quando todos formatos tem completedAt === null', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 100,
            totalDurationSeconds: 600,
            completedAt: null,
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('lesson-completed-badge')).toBeNull();
  });

  it('deve renderizar badge quando algum formato tem completedAt !== null', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 600,
            totalDurationSeconds: 600,
            completedAt: '2026-05-01T10:00:00Z',
          },
        };
      }
      return null;
    });
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
        screen.getByTestId('lesson-completed-badge'),
      ).toBeInTheDocument();
    });
  });

  it('badge deve conter texto "Concluida"', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 600,
            totalDurationSeconds: 600,
            completedAt: '2026-05-01T10:00:00Z',
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const badge = screen.getByTestId('lesson-completed-badge');
      expect(badge.textContent ?? '').toMatch(/Conclu[ií]da/i);
    });
  });
});

// =============================================================================
// Sprint UX-Biblioteca-1 / RF-05B — toast "Proxima aula" REMOVIDO. Substituido
// por <NextLessonCTA> inline. Testes invertidos: toast NAO disparado + CTA
// inline presente quando aplicavel.
// =============================================================================
describe('<LessonViewer> RF-05B — toast "Proxima aula" removido (inline CTA)', () => {
  it('NAO deve disparar toast "Proxima aula" quando maxProgressPct >= 90', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 540,
            totalDurationSeconds: 600,
            completedAt: null,
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
    // Toast removido pelo RF-05B — substituido por CTA inline.
    const proxAulaToast = toastSpy.mock.calls.some((c) =>
      /Pr[oó]xima aula:/i.test(`${c[0]?.title ?? ''}`),
    );
    expect(proxAulaToast).toBe(false);
  });

  it('deve renderizar <NextLessonCTA> inline quando maxProgressPct >= 90 e existe proxima aula', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 540,
            totalDurationSeconds: 600,
            completedAt: null,
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('next-lesson-cta')).toBeInTheDocument();
    });
  });

  it('NAO deve renderizar CTA quando nao existe proxima aula (ultima)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseLastLesson;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 540,
            totalDurationSeconds: 600,
            completedAt: null,
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('next-lesson-cta')).toBeNull();
  });

  it('NAO deve renderizar CTA quando maxProgressPct < 90', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 300, // 50%
            totalDurationSeconds: 600,
            completedAt: null,
          },
        };
      }
      return null;
    });
    render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-viewer')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('next-lesson-cta')).toBeNull();
  });
});
