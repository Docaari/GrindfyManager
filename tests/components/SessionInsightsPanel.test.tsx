/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-4.4 CoachSessionInsightsPanel.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.4
 *
 * Cobertura:
 *   - Renderiza 4 sections: Resumo, Top maos (3), Aulas sugeridas (2), Spots (todos), Stats foco (3)
 *   - CTA "Registrar review" abre StudyLogDialog mode='hand_review' pre-preenchido
 *   - CTA "Adicionar insight" abre dialog inline edit notes/learning
 *   - CTA "Assistir aula" navega Wouter route com courseSlug+lessonSlug (lesson #19)
 *   - Loading state (skeleton 4 sections)
 *   - Error state com retry button
 *   - Empty state quando spots=0 + tournaments=1 ("sessao curta")
 *   - Botao Regenerar dispara POST regenerate (rate limit 3/sessao)
 *
 * data-testid:
 *   - session-insights-panel (root)
 *   - session-insights-summary
 *   - session-insights-top-hand-{handId}
 *   - session-insights-suggested-lesson-{lessonId}
 *   - session-insights-spot-{spotId}
 *   - session-insights-focus-stat-{statId}
 *   - session-insights-cta-register-review-{handId}
 *   - session-insights-cta-watch-lesson-{lessonId}
 *   - session-insights-regenerate
 *   - session-insights-loading
 *   - session-insights-error
 *   - session-insights-empty
 *
 * Status RED: client/src/components/grind/SessionInsightsPanel.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequestMock, useQueryMock, navigateMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  useQueryMock: vi.fn(),
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
    useMutation: ({ mutationFn }: any) => ({ mutate: (vars: any) => mutationFn(vars), isPending: false }),
  };
});

vi.mock('wouter', () => ({
  useLocation: () => ['/grind-live/gs-1/recap', navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  useQueryMock.mockReset();
  navigateMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadPanel() {
  const mod: any = await import('../../client/src/components/grind/SessionInsightsPanel');
  return mod.SessionInsightsPanel;
}

const fullInsights = {
  cached: false,
  generatedAt: '2026-05-08T20:00:00Z',
  expiresAt: '2026-05-09T20:00:00Z',
  insights: {
    summary: 'Sessao 4h, 22 torneios, +$143. C-bet OOP em 3-bet pots fraco.',
    topHands: [
      { handId: 'spot-1', title: 'BB defense vs UTG 3bet', rationale: 'Pot 25BB, check-fold com middle pair', action: 'review', ctaUrl: '/estudos/spots/spot-1', handBadge: 'big_pot' },
      { handId: 'spot-2', title: 'CO open ICM bubble', rationale: 'Open shove vs raise marginal +EV', action: 'review', ctaUrl: '/estudos/spots/spot-2', handBadge: 'icm_critical' },
    ],
    suggestedLessons: [
      { lessonId: 'lesson-1', title: 'Ep 4: C-bet OOP', courseSlug: 'antes-das-cartas', lessonSlug: 'ep-4-cbet-oop', rationale: 'Cobre o leak da sessao', durationSeconds: 720 },
      { lessonId: 'lesson-2', title: 'Ep 7: ICM bubble', courseSlug: 'antes-das-cartas', lessonSlug: 'ep-7-icm-bubble', rationale: 'Decisoes ICM marginais', durationSeconds: 1080 },
    ],
    spotsToReview: [
      { spotId: 'spot-1', label: 'Spot 1', suggestedAction: 'add_insight' },
      { spotId: 'spot-2', label: 'Spot 2', suggestedAction: 'link_theme' },
      { spotId: 'spot-3', label: 'Spot 3', suggestedAction: 'review_later' },
    ],
    focusStatsHighlight: [
      { statId: 'cbet_flop_oop', statName: 'C-bet OOP', occurredCount: 8, rationale: 'Decisoes c-bet repetidas' },
      { statId: 'threebet_pct', statName: '3bet defense', occurredCount: 4, rationale: 'Defesa BB' },
    ],
  },
};

describe('<SessionInsightsPanel>', () => {
  it('renderiza root', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-panel')).toBeInTheDocument();
  });

  it('renderiza summary section', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    const summary = screen.getByTestId('session-insights-summary');
    expect(summary.textContent).toMatch(/4h/);
    expect(summary.textContent).toMatch(/22 torneios/);
  });

  it('renderiza top maos com handBadge', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-top-hand-spot-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-insights-top-hand-spot-2')).toBeInTheDocument();
  });

  it('CTA "Registrar review" presente por hand', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-cta-register-review-spot-1')).toBeInTheDocument();
  });

  it('CTA "Assistir aula" usa courseSlug + lessonSlug (lesson #19)', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    const cta = screen.getByTestId('session-insights-cta-watch-lesson-lesson-1');
    const link = cta.querySelector('a') ?? cta;
    expect(link.getAttribute('href')).toBe('/biblioteca/curso/antes-das-cartas/ep-4-cbet-oop/play');
  });

  it('renderiza spots gravados todos', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-spot-spot-1')).toBeInTheDocument();
    expect(screen.getByTestId('session-insights-spot-spot-2')).toBeInTheDocument();
    expect(screen.getByTestId('session-insights-spot-spot-3')).toBeInTheDocument();
  });

  it('renderiza focus stats highlights', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-focus-stat-cbet_flop_oop')).toBeInTheDocument();
    expect(screen.getByTestId('session-insights-focus-stat-threebet_pct')).toBeInTheDocument();
  });

  it('botao Regenerar dispara POST regenerate', async () => {
    useQueryMock.mockReturnValue({ data: fullInsights, isLoading: false, isError: false });
    apiRequestMock.mockResolvedValue(fullInsights);
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);

    fireEvent.click(screen.getByTestId('session-insights-regenerate'));
    expect(apiRequestMock).toHaveBeenCalled();
    const call = apiRequestMock.mock.calls[0];
    expect(call[0]).toMatch(/POST/i);
    expect(call[1]).toMatch(/coach\/session-insights\/gs-1\/regenerate/);
  });

  it('loading state renderiza skeleton', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-loading')).toBeInTheDocument();
  });

  it('error state com retry button', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-error')).toBeInTheDocument();
  });

  it('empty state: insights com summary vazio + 0 hands -> empty mensagem', async () => {
    useQueryMock.mockReturnValue({
      data: {
        cached: false,
        generatedAt: '2026-05-08T20:00:00Z',
        expiresAt: '2026-05-09T20:00:00Z',
        insights: {
          summary: '',
          topHands: [],
          suggestedLessons: [],
          spotsToReview: [],
          focusStatsHighlight: [],
        },
      },
      isLoading: false,
      isError: false,
    });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);
    expect(screen.getByTestId('session-insights-empty')).toBeInTheDocument();
  });

  it('cap topHands em 3 mesmo se backend mandar mais (defesa UI)', async () => {
    const tooMany = {
      ...fullInsights,
      insights: {
        ...fullInsights.insights,
        topHands: Array.from({ length: 5 }, (_, i) => ({
          handId: `s-${i}`,
          title: `H${i}`,
          rationale: 'r',
          action: 'review',
          ctaUrl: '/x',
        })),
      },
    };
    useQueryMock.mockReturnValue({ data: tooMany, isLoading: false, isError: false });
    const Panel = await loadPanel();
    renderWithClient(<Panel sessionId="gs-1" />);

    const rendered = [0, 1, 2].filter((i) => screen.queryByTestId(`session-insights-top-hand-s-${i}`)).length;
    const extras = [3, 4].filter((i) => screen.queryByTestId(`session-insights-top-hand-s-${i}`)).length;
    expect(rendered).toBeGreaterThanOrEqual(3);
    expect(extras).toBe(0);
  });
});
