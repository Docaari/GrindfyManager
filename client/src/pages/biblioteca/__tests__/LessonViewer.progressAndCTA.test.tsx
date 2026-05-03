// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint UX-Biblioteca-1 / RF-05
//
// Spec: Docs/specs/ux-biblioteca-1.md RF-05
// ADR:  Docs/architecture/decisions/105-auto-navigation-countdown-pattern.md
//
// Page target: client/src/pages/biblioteca/LessonViewer.tsx (existe — modificar)
//
// Mudanca esperada em RF-05:
//   PARTE A — Progress label visual states:
//     <50%   -> text-gray-400 (sem badge)
//     50-89% -> text-green-400 (sem badge)
//     90-99% -> text-green-300 + Badge "Quase la"
//     100%   -> text-green-300 font-semibold + Badge "Concluida"
//   PARTE B — Toast removido + NextLessonCTA inline:
//     - Toast "Proxima aula" NAO mais disparado em maxProgressPct >= 90.
//     - <NextLessonCTA> aparece quando maxProgressPct >= 90 && nextLessonRef.
//     - Ultima aula (sem nextLessonRef) -> CTA NAO renderiza.
//
// Lessons aplicadas:
//   #2  data-testid estavel
//   #14 vi.hoisted para spy compartilhado
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, toastMock, setLocationMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
  setLocationMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: { invalidateQueries: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// Mock wouter useLocation para capturar setLocation invocations.
vi.mock('wouter', async () => {
  const actual: any = await vi.importActual('wouter');
  return {
    ...actual,
    useLocation: () => ['/biblioteca/curso/curso-x/aula-1', setLocationMock],
  };
});

vi.mock('@mux/mux-player-react', () => {
  const ReactMod = require('react');
  const MuxPlayer = ReactMod.forwardRef((_: any, ref: any) =>
    ReactMod.createElement('div', { 'data-testid': 'mux-player-mock', ref }),
  );
  return { default: MuxPlayer, MuxPlayer };
});

vi.mock('@/contexts/AudioPlayerContext', () => ({
  useOptionalAudioPlayer: () => null,
  AudioPlayerProvider: ({ children }: any) => children,
}));

vi.mock('../../../components/biblioteca/PodcastPlayer', () => ({
  PodcastPlayer: () => null,
}));
vi.mock('../../../components/biblioteca/ArticleIframeWithWatermark', () => ({
  ArticleIframeWithWatermark: () => null,
}));

import { LessonViewer } from '../LessonViewer';

const lessonData = {
  id: 'lesson-1',
  slug: 'aula-1',
  courseSlug: 'curso-x',
  title: 'Aula 1',
  subtitle: null,
  displayLabel: '01',
  formats: {
    video: { mux: { playbackId: 'pb-123' }, durationSeconds: 600 },
  },
};

const courseData = {
  id: 'curso-x',
  slug: 'curso-x',
  title: 'Curso X',
  modules: [
    {
      id: 'm-1',
      slug: 'm-1',
      title: 'M1',
      lessons: [
        {
          id: 'lesson-1',
          slug: 'aula-1',
          title: 'Aula 1',
          displayLabel: '01',
          hasAccess: true,
        },
        {
          id: 'lesson-2',
          slug: 'aula-2',
          title: 'Aula 2 - Vies',
          displayLabel: '02',
          hasAccess: true,
        },
      ],
    },
  ],
};

function renderWithProgress(progress: any, course = courseData) {
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (url === '/api/library/lessons/lesson-1') return lessonData;
    if (url.startsWith('/api/library/lessons/lesson-1/progress'))
      return progress;
    if (url === '/api/library/courses/curso-x') return course;
    return null;
  });
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LessonViewer
        lessonId="lesson-1"
        courseSlug="curso-x"
        lessonSlug="aula-1"
        userPlatformId="USER-0001"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  toastMock.mockReset();
  setLocationMock.mockReset();
  try {
    localStorage.clear();
  } catch {}
});

afterEach(() => cleanup());

// =============================================================================
// RF-05 Parte A — progress label visual states
// =============================================================================
describe('<LessonViewer> RF-05A — progress label cor', () => {
  it('progress < 50% deve ter classe text-gray-400 no label', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 100, totalDurationSeconds: 600 }, // ~16%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    const label = screen.getByTestId('lesson-progress-label');
    expect(label.className).toMatch(/text-gray-400/);
    expect(label.className).not.toMatch(/text-green-/);
  });

  it('progress >= 50% e < 90% deve ter classe text-green-400', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 360, totalDurationSeconds: 600 }, // 60%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    const label = screen.getByTestId('lesson-progress-label');
    expect(label.className).toMatch(/text-green-400/);
  });

  it('progress >= 90% e < 100% deve renderizar Badge "Quase la"', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 570, totalDurationSeconds: 600 }, // 95%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    // Badge "Quase la" por testid OU por texto.
    const badge =
      screen.queryByTestId('lesson-progress-badge-almost') ??
      screen.queryByText(/Quase la/i);
    expect(badge).toBeInTheDocument();
  });

  it('progress = 100% deve renderizar Badge "Concluida"', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 600, totalDurationSeconds: 600 }, // 100%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    const badge =
      screen.queryByTestId('lesson-progress-badge-completed') ??
      screen.queryByText(/Concluida/i);
    expect(badge).toBeInTheDocument();
  });

  it('progress 100% NAO deve mostrar badge "Quase la" (apenas Concluida)', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 600, totalDurationSeconds: 600 },
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('lesson-progress-badge-almost')).toBeNull();
  });

  it('progress < 90% NAO deve mostrar nenhum badge', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 200, totalDurationSeconds: 600 }, // 33%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('lesson-progress-badge-almost')).toBeNull();
    expect(screen.queryByTestId('lesson-progress-badge-completed')).toBeNull();
  });
});

// =============================================================================
// RF-05 Parte B — Toast removido + NextLessonCTA inline
// =============================================================================
describe('<LessonViewer> RF-05B — toast removido', () => {
  it('progress >= 90 com proxima aula NAO deve disparar toast com titulo "Proxima aula:"', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 570, totalDurationSeconds: 600 }, // 95%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    // Toast com titulo iniciando com "Proxima aula:" NAO deve ser chamado.
    const toastsCalled = toastMock.mock.calls.map(
      (c) => c[0]?.title ?? '',
    );
    const proxAulaToast = toastsCalled.some((t: string) =>
      /Proxima aula:/i.test(t),
    );
    expect(proxAulaToast).toBe(false);
  });
});

describe('<LessonViewer> RF-05B — NextLessonCTA inline', () => {
  it('progress >= 90 com proxima aula deve renderizar NextLessonCTA inline', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 570, totalDurationSeconds: 600 },
    });
    await waitFor(() => {
      expect(screen.getByTestId('next-lesson-cta')).toBeInTheDocument();
    });
  });

  it('progress < 90 NAO deve renderizar NextLessonCTA', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 100, totalDurationSeconds: 600 }, // ~16%
    });
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('next-lesson-cta')).toBeNull();
  });

  it('progress >= 90 mas ultima aula (sem nextLessonRef) NAO deve renderizar CTA', async () => {
    const courseUltimaAula = {
      id: 'curso-x',
      slug: 'curso-x',
      title: 'Curso X',
      modules: [
        {
          id: 'm-1',
          slug: 'm-1',
          title: 'M1',
          lessons: [
            // Apenas 1 aula — lesson-1 eh a ultima.
            {
              id: 'lesson-1',
              slug: 'aula-1',
              title: 'Aula 1',
              displayLabel: '01',
              hasAccess: true,
            },
          ],
        },
      ],
    };
    renderWithProgress(
      { video: { lastPositionSeconds: 600, totalDurationSeconds: 600 } },
      courseUltimaAula,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lesson-progress-label')).toBeInTheDocument();
    });
    // CTA NAO deve renderizar por nao haver proxima aula.
    expect(screen.queryByTestId('next-lesson-cta')).toBeNull();
  });

  it('NextLessonCTA deve mostrar titulo da proxima aula', async () => {
    renderWithProgress({
      video: { lastPositionSeconds: 570, totalDurationSeconds: 600 },
    });
    await waitFor(() => {
      expect(screen.getByTestId('next-lesson-cta')).toBeInTheDocument();
    });
    const cta = screen.getByTestId('next-lesson-cta');
    expect(cta.textContent ?? '').toMatch(/Vies/i);
  });
});
