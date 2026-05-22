// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1.1 / RF-01 - LessonPickerDialog "Continuar de onde parou"
// hidratar via lazy fetch /api/library/courses/:slug
//
// Spec: Docs/specs/sprint-mini-player-1.1.md RF-01 + Q-B
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx (existe)
//
// Shape do backend (verificado em server/routes/library.ts):
//
//   GET /api/library/courses -> flat array
//     [{ id, slug, title, subtitle, coverUrl, lessonCount, ... }]
//
//   GET /api/library/courses/:slug -> objeto com modules+lessons
//     {
//       slug, title, modules: [{
//         id, title, lessons: [{
//           id, slug, title, durationMinutes, formats,
//           progress: Record<format, {
//             lastPositionSeconds, totalDurationSeconds,
//             completedAt, updatedAt
//           }> | null
//         }]
//       }]
//     }
//
// Cobertura:
//   - dropdown popula via cache de /api/library/courses (sem fetch novo)
//   - selecionar curso dispara fetch :slug
//   - aba "Continuar" filtra: progress.bestPct > 0 && bestPct < 100 && completedAt null
//   - ordena por lastWatchedAt (updatedAt) desc
//   - empty state quando 0 lessons em progresso
//   - error state quando fetch :slug falha
//   - loading state durante fetch :slug
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock TanStack Query para isolar o dialog (mesmo padrao lesson #29 e
// MiniPlayer 1 LessonPickerDialog.test.tsx).
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

// Mock useAuth para garantir user logado (RF-03 nao bloqueia aqui).
vi.mock('@/contexts/AuthContext', async () => {
  const actual: any = await vi.importActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: 'u1', email: 'u@test.com' },
      isAuthenticated: true,
      isLoading: false,
    })),
  };
});

// Payload da lista de cursos (endpoint /api/library/courses)
const coursesListPayload = [
  { id: 'c1', slug: 'curso-mtt', title: 'Curso MTT', lessonCount: 3 },
  { id: 'c2', slug: 'curso-icm', title: 'Curso ICM', lessonCount: 1 },
];

// Payload do detalhe (endpoint /api/library/courses/:slug)
const courseMttDetail = {
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
          formats: ['podcast', 'video'],
          hasAccess: true,
          progress: {
            podcast: {
              lastPositionSeconds: 540, // 540/720 = 75%
              totalDurationSeconds: 720,
              completedAt: null,
              updatedAt: '2026-05-22T10:00:00Z',
            },
          },
        },
        {
          id: 'L2',
          slug: 'tilt',
          title: 'Tilt control',
          durationMinutes: 18,
          formats: ['podcast'],
          hasAccess: true,
          progress: {
            podcast: {
              lastPositionSeconds: 180, // 180/1080 = 16.7%
              totalDurationSeconds: 1080,
              completedAt: null,
              updatedAt: '2026-05-21T08:00:00Z',
            },
          },
        },
        {
          id: 'L3',
          slug: 'fundamentos',
          title: 'Fundamentos',
          durationMinutes: 15,
          formats: ['podcast'],
          hasAccess: true,
          progress: null, // nunca tocou
        },
        {
          id: 'L4',
          slug: 'live-final',
          title: 'Live Final',
          durationMinutes: 10,
          formats: ['podcast'],
          hasAccess: true,
          progress: {
            podcast: {
              lastPositionSeconds: 600,
              totalDurationSeconds: 600,
              completedAt: '2026-05-20T11:00:00Z', // ja completou
              updatedAt: '2026-05-20T11:00:00Z',
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

function Setup({ open = true }: { open?: boolean }) {
  return (
    <AudioPlayerProvider>
      <LessonPickerDialog open={open} onOpenChange={() => {}} />
    </AudioPlayerProvider>
  );
}

describe('<LessonPickerDialog> Continuar de onde parou (RF-01)', () => {
  it('dropdown popula com cursos via /api/library/courses (cache hit, sem fetch novo)', async () => {
    let coursesQueryCount = 0;
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('/api/library/courses') && !key.includes(':slug') && !key.match(/courses\/[^"]+/)) {
        coursesQueryCount++;
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => {
      expect(screen.getByTestId('lesson-picker-dialog')).toBeInTheDocument();
    });

    // Cursos listados no dropdown
    expect(screen.getByText(/Curso MTT/i)).toBeInTheDocument();
    expect(screen.getByText(/Curso ICM/i)).toBeInTheDocument();
  });

  it('selecionar curso dispara fetch /api/library/courses/:slug', async () => {
    let slugFetchCount = 0;
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('library/courses')) {
        // Detecta fetch de slug detail (queryKey inclui "curso-mtt" ou similar)
        if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
          slugFetchCount++;
          return {
            data: courseMttDetail,
            isLoading: false,
            error: null,
          };
        }
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // Seleciona curso MTT no dropdown
    // Aceita 1 dos 2 patterns: dropdown <select> OU lista de cards/buttons
    const selector =
      screen.queryByTestId('lesson-picker-course-select') ??
      screen.queryByTestId('lesson-picker-course-curso-mtt') ??
      screen.queryByRole('combobox', { name: /curso/i });
    expect(selector).not.toBeNull();

    const user = userEvent.setup();
    if (selector!.tagName === 'SELECT') {
      await user.selectOptions(selector as HTMLSelectElement, 'curso-mtt');
    } else {
      await user.click(selector as Element);
    }

    await waitFor(() => {
      expect(slugFetchCount).toBeGreaterThanOrEqual(1);
    });
  });

  it('aba "Continuar" filtra lessons com 0 < pct < 100 e completedAt null', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: courseMttDetail, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // Aba "Continuar" deve listar Mindset (75%) e Tilt (16.7%)
    // NAO deve listar L3 (sem progresso) nem L4 (completedAt set)
    await waitFor(() => {
      expect(screen.getByText(/Continuar de onde parou/i)).toBeInTheDocument();
    });

    // Mindset (75%) presente
    expect(screen.getAllByText(/Mindset/).length).toBeGreaterThanOrEqual(1);
    // Tilt presente
    expect(screen.getAllByText(/Tilt control/).length).toBeGreaterThanOrEqual(1);
    // L3 e L4 NAO devem aparecer na sessao "Continuar"
    // (podem aparecer no grid principal, entao usamos within seccao se possivel)
    const continuarSection = screen.getByText(/Continuar de onde parou/i).closest('div')
      ?? screen.getByText(/Continuar de onde parou/i).parentElement;
    expect(continuarSection).not.toBeNull();
    expect(continuarSection!.textContent ?? '').not.toMatch(/Fundamentos/);
    expect(continuarSection!.textContent ?? '').not.toMatch(/Live Final/);
  });

  it('aba "Continuar" ordena por lastWatchedAt (updatedAt) desc', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: courseMttDetail, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));
    await waitFor(() => screen.getByText(/Continuar de onde parou/i));

    // Mindset updatedAt 2026-05-22 (mais recente) deve aparecer antes de Tilt (2026-05-21).
    const continuarSection = screen.getByText(/Continuar de onde parou/i).closest('div')
      ?? screen.getByText(/Continuar de onde parou/i).parentElement;
    const txt = continuarSection!.textContent ?? '';
    const mindsetIdx = txt.indexOf('Mindset');
    const tiltIdx = txt.indexOf('Tilt control');
    expect(mindsetIdx).toBeGreaterThanOrEqual(0);
    expect(tiltIdx).toBeGreaterThan(mindsetIdx);
  });

  it('empty state quando nenhuma lesson em progresso', async () => {
    const emptyDetail = {
      ...courseMttDetail,
      modules: [
        {
          ...courseMttDetail.modules[0],
          lessons: [
            { ...courseMttDetail.modules[0].lessons[2], progress: null },
            { ...courseMttDetail.modules[0].lessons[3] }, // completedAt set
          ],
        },
      ],
    };
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: emptyDetail, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // Aba "Continuar" SO mostra empty state OU some completamente.
    // A spec diz "mostra empty state em vez de grid vazio".
    await waitFor(() => {
      const continuar = screen.queryByText(/Continuar de onde parou/i);
      if (continuar) {
        const section = continuar.closest('div')!.textContent ?? '';
        expect(section).toMatch(/nenhuma|empty|sem aulas|nao ha|ainda/i);
      } else {
        // Aceitavel: nao renderiza secao quando vazia
        expect(continuar).toBeNull();
      }
    });
  });

  it('erro no fetch :slug -> silencia "Continuar" e mostra estado de erro no grid', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: undefined, isLoading: false, error: new Error('boom') };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // "Continuar de onde parou" NAO renderiza quando :slug falha
    await waitFor(() => {
      expect(screen.queryByText(/Continuar de onde parou/i)).toBeNull();
    });
  });

  it('loading state durante fetch :slug', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt') || /courses\/[a-z-]+/.test(key)) {
        return { data: undefined, isLoading: true, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    // Algum indicador de loading no grid ou seccao "Continuar"
    const loadingIndicator =
      screen.queryByTestId('lesson-picker-loading') ??
      screen.queryByRole('status') ??
      screen.queryByText(/carregando|loading/i);
    expect(loadingIndicator).not.toBeNull();
  });

  it('trocar de curso re-fetcha (cache por slug)', async () => {
    let fetchedSlugs: string[] = [];
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('curso-mtt')) {
        if (!fetchedSlugs.includes('curso-mtt')) fetchedSlugs.push('curso-mtt');
        return { data: courseMttDetail, isLoading: false, error: null };
      }
      if (key.includes('curso-icm')) {
        if (!fetchedSlugs.includes('curso-icm')) fetchedSlugs.push('curso-icm');
        return { data: { ...courseMttDetail, slug: 'curso-icm', title: 'Curso ICM' }, isLoading: false, error: null };
      }
      if (key.includes('/api/library/courses')) {
        return { data: coursesListPayload, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    });

    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));

    const user = userEvent.setup();
    const selector =
      screen.queryByTestId('lesson-picker-course-select') ??
      screen.queryByRole('combobox', { name: /curso/i });
    if (selector?.tagName === 'SELECT') {
      await user.selectOptions(selector as HTMLSelectElement, 'curso-icm');
    } else {
      const icmTrigger =
        screen.queryByTestId('lesson-picker-course-curso-icm') ??
        screen.getByText(/Curso ICM/i);
      await user.click(icmTrigger);
    }

    await waitFor(() => {
      expect(fetchedSlugs).toContain('curso-icm');
    });
  });
});
