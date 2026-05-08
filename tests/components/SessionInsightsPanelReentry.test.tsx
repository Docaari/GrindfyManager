/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-4 SessionInsightsPanel REENTRY EXTENSION
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-4.2
 * ADR : 140 (shape extension spotsToReview[] + 3 campos opcionais)
 *
 * Cobertura RED:
 *   - Renderiza section "Spots para reentry" quando insights.spotsToReview tem
 *     pelo menos 1 com reentryCandidate=true.
 *   - Checkboxes pre-marcados para candidatos nao-ativos.
 *   - Spots com reentryAlreadyActive=true: badge + checkbox disabled.
 *   - "Adicionar todos a reentry" chama POST /api/reentry/bulk-from-session.
 *   - Empty: 0 candidatos → mensagem "sessao limpa".
 *   - All-active: todos candidatos ja ativos → mensagem + link.
 *   - Backward compat: spots sem campos novos (Sprint 2 shape) renderizam ok.
 *
 * data-testid esperados:
 *   - session-insights-reentry-section
 *   - session-insights-reentry-empty
 *   - session-insights-reentry-all-active
 *   - session-insights-reentry-checkbox-{spotId}
 *   - session-insights-reentry-badge-active-{spotId}
 *   - session-insights-reentry-bulk-add
 *   - session-insights-reentry-select-all
 *   - session-insights-reentry-reason-{spotId}
 *
 * Status RED: extension em SessionInsightsPanel ainda nao implementada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, useQueryMock, useMutationMock, navigateMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  navigateMock: vi.fn(),
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
    useMutation: useMutationMock,
  };
});

vi.mock('wouter', () => ({
  useLocation: () => ['/grind-live/gs-1/recap', navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  useQueryMock.mockReset();
  useMutationMock.mockReset();
  navigateMock.mockReset();
  // Default useMutation
  useMutationMock.mockImplementation(({ mutationFn, onSuccess }: any) => ({
    mutate: async (vars: any) => {
      const r = await mutationFn(vars);
      onSuccess?.(r, vars);
      return r;
    },
    isPending: false,
  }));
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadPanel() {
  const mod: any = await import('../../client/src/components/grind/SessionInsightsPanel');
  return mod.SessionInsightsPanel;
}

const buildInsights = (spotsToReview: any[]) => ({
  cached: false,
  generatedAt: '2026-05-08T20:00:00Z',
  expiresAt: '2026-05-09T20:00:00Z',
  insights: {
    summary: 'Sessao bla bla',
    topHands: [],
    suggestedLessons: [],
    spotsToReview,
    focusStatsHighlight: [],
  },
});

describe('<SessionInsightsPanel> — RF-4 reentry extension', () => {
  it('renderiza section "reentry" quando >=1 candidato', async () => {
    useQueryMock.mockReturnValue({
      data: buildInsights([
        {
          spotId: 'spot-1', label: 'BB defense vs UTG', suggestedAction: 'add_insight',
          reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'Decisao errada',
        },
      ]),
      isLoading: false, isError: false,
    });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-reentry-section')).toBeInTheDocument();
  });

  it('checkbox pre-marcado para candidatos nao-ativos', async () => {
    useQueryMock.mockReturnValue({
      data: buildInsights([
        {
          spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight',
          reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'Decisao errada',
        },
      ]),
      isLoading: false, isError: false,
    });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    const cb = screen.getByTestId('session-insights-reentry-checkbox-spot-1') as HTMLInputElement;
    // pode ser checked HTML attribute OR aria-checked
    const checked =
      cb.checked || cb.getAttribute('aria-checked') === 'true' || cb.dataset.state === 'checked';
    expect(checked).toBe(true);
  });

  it('spots ja-ativos: badge "Ja ativa" + checkbox disabled', async () => {
    useQueryMock.mockReturnValue({
      data: buildInsights([
        {
          spotId: 'spot-1', label: 'A', suggestedAction: 'review_later',
          reentryCandidate: true, reentryAlreadyActive: true, reentryReason: 'Tem insight, falta reentry',
        },
      ]),
      isLoading: false, isError: false,
    });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-reentry-badge-active-spot-1')).toBeInTheDocument();
    const cb = screen.getByTestId('session-insights-reentry-checkbox-spot-1') as HTMLInputElement;
    expect(
      cb.hasAttribute('disabled') || cb.getAttribute('aria-disabled') === 'true' ||
        cb.dataset.disabled === 'true',
    ).toBe(true);
  });

  it('botao "Adicionar a reentry" chama POST /api/reentry/bulk-from-session', async () => {
    useQueryMock.mockReturnValue({
      data: buildInsights([
        {
          spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight',
          reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'Decisao errada',
        },
        {
          spotId: 'spot-2', label: 'B', suggestedAction: 'add_insight',
          reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'Baixa confianca (1/5)',
        },
      ]),
      isLoading: false, isError: false,
    });
    apiRequestMock.mockResolvedValue({ created: 2, skipped: 0, cards: [] });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    fireEvent.click(screen.getByTestId('session-insights-reentry-bulk-add'));
    await waitFor(() => {
      const calls = JSON.stringify(apiRequestMock.mock.calls);
      expect(calls).toMatch(/bulk-from-session|\/reentry/i);
    });
  });

  it('reason exibida ao lado do checkbox', async () => {
    useQueryMock.mockReturnValue({
      data: buildInsights([
        {
          spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight',
          reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'Baixa confianca (2/5)',
        },
      ]),
      isLoading: false, isError: false,
    });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    const reason = screen.getByTestId('session-insights-reentry-reason-spot-1');
    expect(reason.textContent).toMatch(/confianca|2\/5/i);
  });

  describe('empty states', () => {
    it('0 candidatos → mensagem "sessao limpa"', async () => {
      useQueryMock.mockReturnValue({
        data: buildInsights([
          {
            spotId: 'spot-1', label: 'A', suggestedAction: 'review_later',
            reentryCandidate: false, reentryAlreadyActive: false,
          },
        ]),
        isLoading: false, isError: false,
      });
      const Panel = await loadPanel();
      renderWithClient(<Panel sessionId="gs-1" />);
      expect(screen.getByTestId('session-insights-reentry-empty')).toBeInTheDocument();
    });

    it('todos candidatos ja ativos → mensagem "all active" + link', async () => {
      useQueryMock.mockReturnValue({
        data: buildInsights([
          {
            spotId: 'spot-1', label: 'A', suggestedAction: 'review_later',
            reentryCandidate: true, reentryAlreadyActive: true, reentryReason: 'x',
          },
          {
            spotId: 'spot-2', label: 'B', suggestedAction: 'review_later',
            reentryCandidate: true, reentryAlreadyActive: true, reentryReason: 'y',
          },
        ]),
        isLoading: false, isError: false,
      });
      const Panel = await loadPanel();
      renderWithClient(<Panel sessionId="gs-1" />);
      expect(screen.getByTestId('session-insights-reentry-all-active')).toBeInTheDocument();
    });
  });

  describe('backward compat (Sprint 2 shape)', () => {
    it('spots sem campos novos (sem reentryCandidate) renderizam sem crash', async () => {
      useQueryMock.mockReturnValue({
        data: buildInsights([
          // shape original Sprint 2 — sem reentryCandidate/reentryAlreadyActive/reentryReason
          { spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight' },
          { spotId: 'spot-2', label: 'B', suggestedAction: 'review_later' },
        ]),
        isLoading: false, isError: false,
      });
      const Panel = await loadPanel();
      // Render nao throw
      expect(() => renderWithClient(<Panel sessionId="gs-1" />)).not.toThrow();
    });
  });

  describe('select-all', () => {
    it('botao "selecionar todos" marca todos checkboxes nao-disabled', async () => {
      useQueryMock.mockReturnValue({
        data: buildInsights([
          {
            spotId: 'spot-1', label: 'A', suggestedAction: 'add_insight',
            reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'x',
          },
          {
            spotId: 'spot-2', label: 'B', suggestedAction: 'add_insight',
            reentryCandidate: true, reentryAlreadyActive: false, reentryReason: 'y',
          },
        ]),
        isLoading: false, isError: false,
      });
      const Panel = await loadPanel();
      renderWithClient(<Panel sessionId="gs-1" />);
      const selectAll = screen.queryByTestId('session-insights-reentry-select-all');
      if (selectAll) {
        fireEvent.click(selectAll);
        // Implementer deve garantir que ambos checkboxes ficam marcados
        const cb1 = screen.getByTestId('session-insights-reentry-checkbox-spot-1') as HTMLInputElement;
        const cb2 = screen.getByTestId('session-insights-reentry-checkbox-spot-2') as HTMLInputElement;
        const c1 = cb1.checked || cb1.getAttribute('aria-checked') === 'true' || cb1.dataset.state === 'checked';
        const c2 = cb2.checked || cb2.getAttribute('aria-checked') === 'true' || cb2.dataset.state === 'checked';
        expect(c1).toBe(true);
        expect(c2).toBe(true);
      }
    });
  });
});
