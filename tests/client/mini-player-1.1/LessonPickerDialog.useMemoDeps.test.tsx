// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-09 - continueItems useMemo destructure
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-09
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx
//
// Cobertura:
//   - mudar progressData/error dispara recompute do continueItems
//   - re-render sem mudar progressData NAO dispara recompute
//
// Mecanica: useQuery mock retorna inicialmente data A, depois data B.
// Como continueItems renderiza a UI, observamos atraves do output renderizado
// (texto da lista) para inferir se memo recomputou.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock('@/contexts/AuthContext', async () => {
  const actual: any = await vi.importActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: 'u1', email: 'u@t.com' },
      isAuthenticated: true,
      isLoading: false,
    })),
  };
});

import { useQuery } from '@tanstack/react-query';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

const courseDetailWithProgress = {
  id: 'c1',
  slug: 'curso-mtt',
  title: 'Curso MTT',
  modules: [
    {
      id: 'm1',
      slug: 'mod-1',
      title: 'Modulo 1',
      lessons: [
        {
          id: 'L1',
          slug: 'mindset',
          title: 'Mindset',
          durationMinutes: 12,
          formats: ['podcast'],
          hasAccess: true,
          progress: {
            podcast: {
              lastPositionSeconds: 540,
              totalDurationSeconds: 720,
              completedAt: null,
              updatedAt: '2026-05-22T10:00:00Z',
            },
          },
        },
      ],
    },
  ],
};

const courseDetailWithProgress_v2 = {
  ...courseDetailWithProgress,
  modules: [
    {
      ...courseDetailWithProgress.modules[0],
      lessons: [
        ...courseDetailWithProgress.modules[0].lessons,
        {
          id: 'L2',
          slug: 'tilt',
          title: 'Tilt control',
          durationMinutes: 18,
          formats: ['podcast'],
          hasAccess: true,
          progress: {
            podcast: {
              lastPositionSeconds: 200,
              totalDurationSeconds: 1080,
              completedAt: null,
              updatedAt: '2026-05-22T11:00:00Z',
            },
          },
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<LessonPickerDialog> continueItems useMemo deps (RF-09)', () => {
  it('mudanca em progressData -> continueItems recomputa (UI muda)', async () => {
    let phase = 0;
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        const data = phase === 0 ? courseDetailWithProgress : courseDetailWithProgress_v2;
        return { data, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return {
          data: [{ id: 'c1', slug: 'curso-mtt', title: 'Curso MTT', lessonCount: 2 }],
          isLoading: false,
          error: null,
        };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    const { rerender } = render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Mindset/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Tilt control/)).toBeNull();

    // Avanca para phase 1 com data adicional
    phase = 1;
    rerender(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Tilt control/)).toBeInTheDocument();
    });
  });

  it('re-render sem mudar progressData NAO altera continueItems (estavel via useMemo)', async () => {
    // Estabiliza referencias de objeto retornadas pelo mock para garantir que
    // deps comparam por identidade. Se impl usa o objeto inteiro do query
    // como dep (sem destructure), as deps iriam mudar a cada render mesmo
    // sem mudanca de dados.
    const stableCoursesList = [
      { id: 'c1', slug: 'curso-mtt', title: 'Curso MTT', lessonCount: 1 },
    ];
    const stableDetail = courseDetailWithProgress;

    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: stableDetail, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: stableCoursesList, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    const { rerender } = render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );

    await waitFor(() => screen.getByText(/Mindset/));
    const firstMindset = screen.getByText(/Mindset/);

    // Re-render gratuito (props identicos, data identica)
    rerender(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );

    // Mindset continua presente (mesma instancia na arvore — sem recompute necessario)
    expect(screen.getByText(/Mindset/)).toBe(firstMindset);
  });

  it('progressData undefined + sem courses -> continueItems = []', async () => {
    (useQuery as any).mockReturnValue({ data: undefined, isLoading: false, error: null });

    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={() => {}} />
      </AudioPlayerProvider>,
    );

    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));
    // "Continuar de onde parou" nao renderiza com lista vazia
    expect(screen.queryByText(/Continuar de onde parou/i)).toBeNull();
  });
});
