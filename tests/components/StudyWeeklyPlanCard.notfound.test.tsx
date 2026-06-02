/**
 * Sprint Estudos-UX-Fix BUG-D — StudyWeeklyPlanCard: 404 != erro.
 *
 * Antes, GET /api/study-weekly-plan 404 ("sem plano nesta semana", estado
 * legitimo de quem nunca gerou plano) era lancado por apiRequest -> query.isError
 * -> o card mostrava "Nao consegui carregar seu plano" pra TODO usuario sem plano.
 *
 * Agora o queryFn distingue:
 *   - 404            -> retorna null  -> empty state ("Gerar plano agora")
 *   - 500 / timeout  -> propaga erro  -> error state (retry CTA)
 *
 * Este arquivo usa o useQuery REAL (nao mocka @tanstack) para exercitar o catch
 * dentro do queryFn — distinto de StudyWeeklyPlanCard.test.tsx que mocka useQuery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadCard() {
  const mod: any = await import('../../client/src/components/study/StudyWeeklyPlanCard');
  return mod.StudyWeeklyPlanCard;
}

describe('StudyWeeklyPlanCard — BUG-D 404 vs erro real', () => {
  it('404 (sem plano) renderiza empty state, NAO o error state', async () => {
    const err: any = new Error('Plano nao encontrado');
    err.response = { status: 404, data: { code: 'NOT_FOUND' } };
    apiRequestMock.mockRejectedValue(err);

    const StudyWeeklyPlanCard = await loadCard();
    renderWithClient(<StudyWeeklyPlanCard />);

    await waitFor(() => {
      expect(screen.getByTestId('study-weekly-plan-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('study-weekly-plan-error')).toBeNull();
  });

  it('500 (erro real) renderiza error state com retry', async () => {
    const err: any = new Error('Internal error');
    err.response = { status: 500, data: { message: 'Internal error' } };
    apiRequestMock.mockRejectedValue(err);

    const StudyWeeklyPlanCard = await loadCard();
    renderWithClient(<StudyWeeklyPlanCard />);

    await waitFor(() => {
      expect(screen.getByTestId('study-weekly-plan-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('study-weekly-plan-empty')).toBeNull();
  });
});
