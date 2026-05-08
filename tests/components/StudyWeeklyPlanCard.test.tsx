/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-3.6 StudyWeeklyPlanCard.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.6
 *
 * Cobertura:
 *   - Renderiza 5 dias (mon..fri) com header + total estimado
 *   - Cada activity row: checkbox + title + duracao + tipo badge + CTA target icon
 *   - Toggle item dispara PATCH /api/study-weekly-plan/items/:itemId/toggle
 *   - Empty state (sem plano para semana corrente): CTA "Gerar plano agora"
 *   - Loading state durante geracao (skeleton)
 *   - Contador top-right "X/14 completed" + barra progresso
 *   - Botao Regenerar abre confirm dialog
 *
 * data-testid:
 *   - study-weekly-plan-card (root)
 *   - study-weekly-plan-day-{mon|tue|wed|thu|fri}
 *   - study-weekly-plan-item-{itemId} (row)
 *   - study-weekly-plan-item-checkbox-{itemId}
 *   - study-weekly-plan-empty
 *   - study-weekly-plan-generate-cta
 *   - study-weekly-plan-regenerate
 *   - study-weekly-plan-progress-counter
 *
 * Status RED: client/src/components/study/StudyWeeklyPlanCard.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, useQueryMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
    useMutation: ({ mutationFn }: any) => ({
      mutate: (vars: any) => mutationFn(vars),
      mutateAsync: (vars: any) => mutationFn(vars),
      isPending: false,
    }),
  };
});

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  useQueryMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadCard() {
  const mod: any = await import('../../client/src/components/study/StudyWeeklyPlanCard');
  return mod.StudyWeeklyPlanCard;
}

const fullPlan = {
  id: 'swp-1',
  userId: 'USER-0001',
  weekStartDate: '2026-05-04',
  source: 'coach_auto',
  dailyTargetMinutes: 45,
  generatedAt: '2026-05-04T09:00:00Z',
  completedItemsJsonb: ['item-mon-1'],
  planJsonb: {
    days: [
      {
        dayLabel: 'mon',
        date: '2026-05-04',
        activities: [
          { itemId: 'item-mon-1', type: 'drill_gto', title: 'Drill 3bet OOP', description: '', estimatedMinutes: 30, ctaTarget: null, themeId: null, lessonId: null, handIds: [], reasoning: '' },
          { itemId: 'item-mon-2', type: 'lesson', title: 'Aula Ep5', description: '', estimatedMinutes: 15, ctaTarget: '/biblioteca/curso/x/y/play', themeId: null, lessonId: 'lesson-x', handIds: [], reasoning: '' },
        ],
      },
      { dayLabel: 'tue', date: '2026-05-05', activities: [
        { itemId: 'item-tue-1', type: 'lesson', title: 'Ep4', description: '', estimatedMinutes: 12, ctaTarget: '/biblioteca/curso/a/b/play', themeId: null, lessonId: 'lesson-a', handIds: [], reasoning: '' },
      ] },
      { dayLabel: 'wed', date: '2026-05-06', activities: [
        { itemId: 'item-wed-1', type: 'hand_review', title: 'Review', description: '', estimatedMinutes: 30, ctaTarget: null, themeId: null, lessonId: null, handIds: ['h-1'], reasoning: '' },
      ] },
      { dayLabel: 'thu', date: '2026-05-07', activities: [
        { itemId: 'item-thu-1', type: 'snapshot_review', title: 'Snapshot', description: '', estimatedMinutes: 15, ctaTarget: null, themeId: null, lessonId: null, handIds: [], reasoning: '' },
      ] },
      { dayLabel: 'fri', date: '2026-05-08', activities: [
        { itemId: 'item-fri-1', type: 'theory_read', title: 'Theory', description: '', estimatedMinutes: 20, ctaTarget: null, themeId: null, lessonId: null, handIds: [], reasoning: '' },
      ] },
    ],
  },
};

describe('<StudyWeeklyPlanCard>', () => {
  it('renderiza root quando plan disponivel', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('study-weekly-plan-card')).toBeInTheDocument();
  });

  it('renderiza 5 dias (mon..fri)', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('study-weekly-plan-day-mon')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-day-tue')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-day-wed')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-day-thu')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-day-fri')).toBeInTheDocument();
  });

  it('renderiza items por dia', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('study-weekly-plan-item-item-mon-1')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-item-item-mon-2')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-item-item-tue-1')).toBeInTheDocument();
  });

  it('checkbox marcado quando itemId em completed_items_jsonb', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    const cb1 = screen.getByTestId('study-weekly-plan-item-checkbox-item-mon-1');
    expect(cb1).toBeInTheDocument();
    // Plano fixture completed=['item-mon-1']
    expect((cb1 as HTMLInputElement).checked || cb1.getAttribute('aria-checked') === 'true' || cb1.getAttribute('data-state') === 'checked').toBe(true);
  });

  it('toggle item dispara PATCH com {completed: true}', async () => {
    apiRequestMock.mockResolvedValue({ ...fullPlan, completedItemsJsonb: ['item-mon-1', 'item-mon-2'] });
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);

    const cb = screen.getByTestId('study-weekly-plan-item-checkbox-item-mon-2');
    fireEvent.click(cb);

    expect(apiRequestMock).toHaveBeenCalled();
    const call = apiRequestMock.mock.calls[0];
    expect(call[0]).toMatch(/PATCH/i);
    expect(call[1]).toMatch(/study-weekly-plan\/items\/item-mon-2\/toggle/);
  });

  it('contador "X/N completed" reflete completed_items', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    const counter = screen.getByTestId('study-weekly-plan-progress-counter');
    expect(counter.textContent).toMatch(/1\s*\/\s*6/);
  });

  it('empty state quando plan ausente: CTA "Gerar plano agora"', async () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('study-weekly-plan-empty')).toBeInTheDocument();
    expect(screen.getByTestId('study-weekly-plan-generate-cta')).toBeInTheDocument();
  });

  it('empty CTA dispara POST regenerate', async () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    apiRequestMock.mockResolvedValue(fullPlan);
    const Card = await loadCard();
    renderWithClient(<Card />);

    fireEvent.click(screen.getByTestId('study-weekly-plan-generate-cta'));
    expect(apiRequestMock).toHaveBeenCalled();
    const call = apiRequestMock.mock.calls[0];
    expect(call[0]).toMatch(/POST/i);
    expect(call[1]).toMatch(/study-weekly-plan\/regenerate/);
  });

  it('botao Regenerar visivel quando plan presente', async () => {
    useQueryMock.mockReturnValue({ data: fullPlan, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('study-weekly-plan-regenerate')).toBeInTheDocument();
  });

  it('renderiza loading skeleton quando isLoading', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card />);
    // Sem cards reais
    expect(screen.queryByTestId('study-weekly-plan-day-mon')).not.toBeInTheDocument();
  });
});
