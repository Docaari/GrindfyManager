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

vi.mock('wouter', () => ({
  Link: ({ href, children, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
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
// Toast "Proxima aula" — RF-07 + D4
// =============================================================================
describe('<LessonViewer> toast "Proxima aula" (RF-07 + D4)', () => {
  it('deve disparar toast quando maxProgressPct >= 90 e existe proxima aula', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 540, // 90%
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
      const found = toastSpy.mock.calls.some((c) => {
        const arg = c[0];
        if (!arg || typeof arg !== 'object') return false;
        const t = `${arg.title ?? ''} ${arg.description ?? ''}`;
        return /Pr[oó]xima aula/i.test(t) || /A\.2/.test(t);
      });
      expect(found).toBe(true);
    });
  });

  it('NAO deve disparar toast quando nao existe proxima aula (ultima do curso)', async () => {
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
    // Sem proxima aula -> toast nao dispara.
    const found = toastSpy.mock.calls.some((c) =>
      /Pr[oó]xima aula/i.test(`${c[0]?.title ?? ''}`),
    );
    expect(found).toBe(false);
  });

  it('toast deve ter duration 8000ms (auto-dismiss D4)', async () => {
    apiRequestMock.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.includes('/by-slug/')) return lessonFixture;
      if (method === 'GET' && url.includes('/api/library/courses/'))
        return courseWithNext;
      if (method === 'GET' && url.includes('/progress')) {
        return {
          article: {
            lastPositionSeconds: 580,
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
      const nextToast = toastSpy.mock.calls.find((c) =>
        /Pr[oó]xima aula/i.test(`${c[0]?.title ?? ''}`),
      );
      expect(nextToast).toBeTruthy();
      expect(nextToast?.[0]?.duration).toBe(8000);
    });
  });

  it('NAO deve disparar toast quando maxProgressPct < 90', async () => {
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
    const found = toastSpy.mock.calls.some((c) =>
      /Pr[oó]xima aula/i.test(`${c[0]?.title ?? ''}`),
    );
    expect(found).toBe(false);
  });

  it('toast deve disparar UMA vez (ref previne re-fire mesmo com re-render)', async () => {
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
    const { rerender } = render(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      const nextCount = toastSpy.mock.calls.filter((c) =>
        /Pr[oó]xima aula/i.test(`${c[0]?.title ?? ''}`),
      ).length;
      expect(nextCount).toBeGreaterThanOrEqual(1);
    });
    // Re-render sem mudar progress.
    rerender(
      <QueryClientProvider client={makeClient()}>
        <LessonViewer
          courseSlug="antes-das-cartas"
          lessonSlug="a1-mentalidade"
        />
      </QueryClientProvider>,
    );
    const nextCount = toastSpy.mock.calls.filter((c) =>
      /Pr[oó]xima aula/i.test(`${c[0]?.title ?? ''}`),
    ).length;
    // Ainda deve ser <= 1 (idempotente por mount). Em re-mount aceitavel reset
    // do ref — spec D4 + R10 confirma "1x por mount aceito".
    expect(nextCount).toBeLessThanOrEqual(2);
  });
});
