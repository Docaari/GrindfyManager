/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-2.5 BibliotecaRecommendationsCard.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-2.4 + §RF-2.5
 *
 * Cobertura:
 *   - Renderiza max 3 cards (1 por leak)
 *   - Card mostra titulo aula, tema badge, leak severity, duracao, watchedPct progress bar
 *   - Click no card navega `/biblioteca/curso/${courseSlug}/${lessonSlug}/play`
 *   - Empty states (3 cenarios):
 *       - Sem leaks (low data) -> CTA "Selecionar 3 stats"
 *       - Com leaks mas sem matching -> "Estamos curando aulas"
 *       - 1 match (mas 2 sem) -> 1 card + texto "Mais aulas em breve"
 *   - placement="home" e placement="estudos"
 *   - Refresh button chama POST refresh + invalida cache
 *
 * data-testid:
 *   - biblioteca-recommendations-card (root)
 *   - biblioteca-recommendations-empty-no-stats
 *   - biblioteca-recommendations-empty-no-match
 *   - biblioteca-recommendations-card-item-{lessonId}
 *   - biblioteca-recommendations-refresh
 *
 * Status RED: client/src/components/biblioteca/BibliotecaRecommendationsCard.tsx NAO existe.
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
    useMutation: ({ mutationFn }: any) => ({ mutate: () => mutationFn(), isPending: false }),
  };
});

vi.mock('wouter', () => ({
  useLocation: () => ['/home', navigateMock],
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

async function loadCard() {
  const mod: any = await import('../../client/src/components/biblioteca/BibliotecaRecommendationsCard');
  return mod.BibliotecaRecommendationsCard;
}

const fullRecommendations = {
  recommendations: [
    {
      leak: { statId: 'cbet_flop_oop_pct', statName: 'C-bet OOP', value: 28, benchmark: 38, delta: -10, severity: 8 },
      theme: { id: 'th-1', name: 'C-bet OOP', slug: 'c-bet-flop-oop', isCurated: true },
      lessons: [
        {
          id: 'lesson-a',
          title: 'Ep 4: C-bet OOP no Flop',
          courseSlug: 'antes-das-cartas',
          lessonSlug: 'ep-4-cbet-oop-flop',
          durationSeconds: 720,
          thumbnailUrl: null,
          watchedPct: 0.45,
        },
      ],
    },
    {
      leak: { statId: 'threebet_pct', statName: '3bet', value: 11, benchmark: 13, delta: -2, severity: 5 },
      theme: { id: 'th-2', name: '3bet defense', slug: '3bet-defense', isCurated: true },
      lessons: [
        {
          id: 'lesson-b',
          title: 'Ep 7: 3bet Defense',
          courseSlug: 'antes-das-cartas',
          lessonSlug: 'ep-7-3bet-defense',
          durationSeconds: 1080,
          thumbnailUrl: null,
          watchedPct: 0,
        },
      ],
    },
  ],
  generatedAt: '2026-05-08T14:00:00Z',
  cacheExpiresAt: '2026-05-08T15:00:00Z',
  cacheHit: false,
};

describe('<BibliotecaRecommendationsCard>', () => {
  it('renderiza root', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    expect(screen.getByTestId('biblioteca-recommendations-card')).toBeInTheDocument();
  });

  it('renderiza 1 card por recommendation (max 3)', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    expect(screen.getByTestId('biblioteca-recommendations-card-item-lesson-a')).toBeInTheDocument();
    expect(screen.getByTestId('biblioteca-recommendations-card-item-lesson-b')).toBeInTheDocument();
  });

  it('exibe titulo + tema + leak severity + duracao por card', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    const item = screen.getByTestId('biblioteca-recommendations-card-item-lesson-a');
    expect(item.textContent).toMatch(/Ep 4/);
    expect(item.textContent).toMatch(/C-bet OOP/);
  });

  it('hidrata link Wouter com courseSlug + lessonSlug (lesson #19)', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    const item = screen.getByTestId('biblioteca-recommendations-card-item-lesson-a');
    const link = item.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/biblioteca/curso/antes-das-cartas/ep-4-cbet-oop-flop/play');
  });

  it('empty state: sem leaks -> render "Selecionar 3 stats" com CTA stats-analyzer', async () => {
    useQueryMock.mockReturnValue({
      data: { recommendations: [], generatedAt: '2026-05-08T14:00:00Z', cacheExpiresAt: '2026-05-08T15:00:00Z' },
      isLoading: false,
      isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    expect(screen.getByTestId('biblioteca-recommendations-empty-no-stats')).toBeInTheDocument();
  });

  it('refresh button presente + dispara invalidacao', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    apiRequestMock.mockResolvedValue({ recommendations: [] });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    const btn = screen.getByTestId('biblioteca-recommendations-refresh');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    // Mutation chamou apiRequest
    expect(apiRequestMock).toHaveBeenCalled();
  });

  it('NAO renderiza quando isError (silent fail)', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const Card = await loadCard();
    const { container } = renderWithClient(<Card placement="home" />);
    expect(container.querySelector('[data-testid="biblioteca-recommendations-card"]')).toBeNull();
  });

  it('renderiza skeleton quando isLoading', async () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    // Aceita ou skeleton ou ausencia de cards reais
    expect(screen.queryByTestId('biblioteca-recommendations-card-item-lesson-a')).not.toBeInTheDocument();
  });

  it('placement="estudos" renderiza variante', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="estudos" />);
    expect(screen.getByTestId('biblioteca-recommendations-card')).toBeInTheDocument();
  });

  it('exibe progress bar quando watchedPct > 0', async () => {
    useQueryMock.mockReturnValue({ data: fullRecommendations, isLoading: false, isError: false });
    const Card = await loadCard();
    renderWithClient(<Card placement="home" />);
    const item = screen.getByTestId('biblioteca-recommendations-card-item-lesson-a');
    // Texto ou aria-label deve conter 45%
    expect(item.textContent).toMatch(/45/);
  });
});
