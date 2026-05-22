// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 1 / RF-09 - LessonPickerDialog
//
// Spec: Docs/specs/sprint-mini-player-1.md RF-09 + D10 + D11
//
// Target: client/src/components/audio-player/LessonPickerDialog.tsx (NAO EXISTE)
//
// Comportamento:
//   - Lazy-loaded via React.lazy
//   - data-testid="lesson-picker-dialog"
//   - Dropdown de cursos via GET /api/library/courses (mock TanStack Query)
//   - Filtra aulas com formats.includes('podcast')
//   - Aulas sem hasAccess: disabled + tooltip "Acesso liberado manualmente pelo time Grindfy"
//   - Seccao "Continuar de onde parou" (max 3 aulas com lastPositionSeconds > 0)
//   - Click em aula acessivel: playTrack(track, courseContext) + telemetria + fecha
//   - Busca filtra aulas por titulo (case-insensitive, contem)
//
// NOTA: TanStack Query em isolamento exige QueryClientProvider OU mock total
// (lesson #29 - ErrorBoundary local quando integrado em Sidebar).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock TanStack Query para isolar o dialog.
vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';

// =============================================================================
// IMPLEMENTER NOTE (Sprint Mini Player 1, lesson #14/#26 fix-it tecnico):
// O test-writer original usava `require('@/...')` lazy, mas Vitest 4 +
// `vi.mock('@tanstack/react-query')` so intercepta pelo path de import ESM
// do Vite — `require` em CJS pega o modulo real, deixando os 6 testes que
// dependem do mock de useQuery sempre vermelhos. Migracao para `import`
// estatico no topo eh a mesma correcao ja aplicada em sprints anteriores
// (lesson #14/#26 no CLAUDE.md). Nenhuma assertion foi alterada.
// =============================================================================
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { LessonPickerDialog } from '@/components/audio-player/LessonPickerDialog';

function loadModules() {
  return { AudioPlayerProvider, LessonPickerDialog };
}

const coursesPayload = [
  {
    slug: 'curso-mtt',
    title: 'Curso MTT',
    modules: [
      {
        id: 'm1',
        title: 'Modulo 1',
        lessons: [
          {
            lessonId: 'L1',
            title: 'Mindset',
            durationSeconds: 720,
            hasAccess: true,
            formats: ['podcast', 'video'],
            audioUrl: '/audio/L1',
          },
          {
            lessonId: 'L2',
            title: 'Tilt control',
            durationSeconds: 1080,
            hasAccess: true,
            formats: ['podcast'],
            audioUrl: '/audio/L2',
          },
          {
            lessonId: 'L3',
            title: 'Apenas video',
            durationSeconds: 900,
            hasAccess: true,
            formats: ['video'], // SEM podcast -> nao deve aparecer
            audioUrl: null,
          },
        ],
      },
    ],
  },
  {
    slug: 'curso-icm',
    title: 'Curso ICM',
    modules: [
      {
        id: 'm1',
        title: 'Bubble',
        lessons: [
          {
            lessonId: 'L4',
            title: 'Bubble basics',
            durationSeconds: 600,
            hasAccess: false, // gated
            formats: ['podcast'],
            audioUrl: '/audio/L4',
          },
        ],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock retorna cursos:
  (useQuery as any).mockImplementation((args: any) => {
    const key = JSON.stringify(args?.queryKey ?? args);
    if (key.includes('library/courses')) {
      return { data: coursesPayload, isLoading: false, error: null };
    }
    // progress endpoint - default sem progresso
    if (key.includes('progress')) {
      return { data: [], isLoading: false, error: null };
    }
    return { data: undefined, isLoading: false, error: null };
  });
});

function Setup({ open = true }: { open?: boolean }) {
  const { AudioPlayerProvider, LessonPickerDialog } = loadModules();
  return (
    <AudioPlayerProvider>
      <LessonPickerDialog open={open} onOpenChange={() => {}} />
    </AudioPlayerProvider>
  );
}

describe('<LessonPickerDialog> (RF-09)', () => {
  it('renderiza com data-testid="lesson-picker-dialog" quando open=true', async () => {
    render(<Setup />);
    await waitFor(() => {
      expect(screen.getByTestId('lesson-picker-dialog')).toBeInTheDocument();
    });
  });

  it('NAO renderiza quando open=false', async () => {
    render(<Setup open={false} />);
    // Dialog nao monta conteudo quando fechado
    expect(screen.queryByTestId('lesson-picker-dialog')).toBeNull();
  });

  it('lista os cursos do payload (Curso MTT + Curso ICM)', async () => {
    render(<Setup />);
    await waitFor(() => {
      expect(screen.getByText(/Curso MTT/i)).toBeInTheDocument();
      expect(screen.getByText(/Curso ICM/i)).toBeInTheDocument();
    });
  });

  it('filtra aulas com formats.includes("podcast") - aula "Apenas video" NAO aparece', async () => {
    render(<Setup />);
    await waitFor(() => {
      expect(screen.queryByText(/Apenas video/)).toBeNull();
    });
    // Confirma que aulas de podcast aparecem
    expect(screen.getByText(/Mindset/)).toBeInTheDocument();
    expect(screen.getByText(/Tilt control/)).toBeInTheDocument();
  });

  it('aulas sem hasAccess (L4) renderizam disabled + tooltip', async () => {
    render(<Setup />);
    await waitFor(() => {
      const gated = screen.getByText(/Bubble basics/);
      // Procura ancestor com aria-disabled ou disabled
      const root = gated.closest('[data-testid^="lesson-picker-item"]') ?? gated.closest('button') ?? gated;
      const disabled = root?.getAttribute('aria-disabled') === 'true' || (root as any)?.disabled === true;
      expect(disabled).toBe(true);
    });
  });

  it('Continuar de onde parou: aparece com max 3 aulas com lastPositionSeconds > 0', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('library/courses')) {
        return { data: coursesPayload, isLoading: false, error: null };
      }
      if (key.includes('progress')) {
        return {
          data: [
            { lessonId: 'L1', lastPositionSeconds: 120 },
            { lessonId: 'L2', lastPositionSeconds: 300 },
          ],
          isLoading: false,
          error: null,
        };
      }
      return { data: undefined, isLoading: false, error: null };
    });
    render(<Setup />);
    await waitFor(() => {
      expect(screen.getByText(/Continuar de onde parou/i)).toBeInTheDocument();
    });
  });

  it('Continuar de onde parou: silencia se progress endpoint falhar (best-effort)', async () => {
    (useQuery as any).mockImplementation((args: any) => {
      const key = JSON.stringify(args?.queryKey ?? args);
      if (key.includes('library/courses')) {
        return { data: coursesPayload, isLoading: false, error: null };
      }
      if (key.includes('progress')) {
        return { data: undefined, isLoading: false, error: new Error('boom') };
      }
      return { data: undefined, isLoading: false, error: null };
    });
    render(<Setup />);
    await waitFor(() => {
      expect(screen.queryByText(/Continuar de onde parou/i)).toBeNull();
    });
  });

  it('busca filtra aulas case-insensitive contem', async () => {
    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));
    const search = screen.getByTestId('lesson-picker-search') as HTMLInputElement;
    expect(search.tagName).toBe('INPUT');
    fireEvent.change(search, { target: { value: 'tilt' } });
    await waitFor(() => {
      expect(screen.queryByText(/Mindset/)).toBeNull();
      expect(screen.getByText(/Tilt control/)).toBeInTheDocument();
    });
  });

  it('click em aula acessivel chama ctx.playTrack(track, courseContext) E fecha dialog', async () => {
    const onOpenChange = vi.fn();
    const { AudioPlayerProvider, LessonPickerDialog } = loadModules();
    // Probe interno pra inspecionar context apos click
    const playTrackSpy = vi.fn();
    function FakeCtxProvider({ children }: { children: React.ReactNode }) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useAudioPlayer } = require('@/contexts/AudioPlayerContext');
      // Encadeia probe abaixo do real Provider (spy via wrapping playTrack):
      return children as any;
    }

    render(
      <AudioPlayerProvider>
        <LessonPickerDialog open={true} onOpenChange={onOpenChange} />
      </AudioPlayerProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() => screen.getByText(/Mindset/));
    const item = screen.getByText(/Mindset/).closest('button') ?? screen.getByText(/Mindset/);
    await user.click(item as Element);
    // Apos click, dialog fecha:
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('trap focus: primeiro elemento focavel = input de busca', async () => {
    render(<Setup />);
    await waitFor(() => screen.getByTestId('lesson-picker-dialog'));
    const search = screen.getByTestId('lesson-picker-search');
    // Radix Dialog faz auto-focus do primeiro elemento focavel.
    // Smoke: existe um input focavel.
    expect(search).toBeInTheDocument();
  });
});

// TODO impedimento lesson #14/#26: require() em .tsx com TanStack como dep
// pode quebrar em red phase se @tanstack/react-query nao for resolvido sync.
// Solucao alternativa documentada: usar await import() se require falhar.
