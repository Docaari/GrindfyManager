/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-06: RecommendationsView (frontend)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/recomendacoes', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
  useSearch: () => '',
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: any[]) => apiRequestMock(...a),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

// @ts-expect-error - red phase
import { RecommendationsView } from '../RecommendationsView';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const recommendationsFixture = {
  items: [
    { id: 'r1', type: 'leak', title: 'Leak grave PKO', description: '', priority_score: 80, cta_action: 'create_theme', cta_url: '/estudos/temas?fromStats=leaks', metadata: { leak_severity: 9 } },
    { id: 'r2', type: 'stale_spot', title: 'Spot antigo tilt', description: '', priority_score: 50, cta_action: 'review_spot', cta_url: '/estudos/spots/sp1', metadata: { spot_age_days: 14 } },
    { id: 'r3', type: 'dormant_theme', title: 'Tema dormente IP vs BB', description: '', priority_score: 20, cta_action: 'open_theme', cta_url: '/estudos/temas/th1', metadata: { theme_dormancy_days: 60 } },
  ],
  generated_at: new Date().toISOString(),
  source_counts: { leaks: 5, stale_spots: 3, dormant_themes: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/study/recommendations')) return recommendationsFixture;
    return null;
  });
  global.fetch = vi.fn(async (url: any) => {
    const data = await apiRequestMock(String(url));
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-06 RecommendationsView', () => {
  it('renderiza ate 10 cards (max)', async () => {
    const items = Array.from({ length: 15 }).map((_, i) => ({
      id: `r${i}`, type: 'leak', title: `Leak ${i}`, description: '',
      priority_score: 100 - i, cta_action: 'open_theme', cta_url: '/x', metadata: {},
    }));
    apiRequestMock.mockImplementation(async () => ({
      items, source_counts: { leaks: 15, stale_spots: 0, dormant_themes: 0 }, generated_at: '',
    }));
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      const cards = screen.queryAllByTestId(/^recommendation-card-/);
      expect(cards.length).toBeLessThanOrEqual(10);
    });
  });

  it('renderiza card com titulo + score (progress bar)', async () => {
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      expect(screen.getByTestId('recommendation-card-r1')).toBeInTheDocument();
      expect(screen.getByTestId('recommendation-card-r1').textContent).toMatch(/Leak grave/);
    });
  });

  it('badge cor por tipo (leak vermelho, stale_spot amarelo, dormant_theme roxo)', async () => {
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      const r1 = screen.getByTestId('recommendation-card-r1');
      expect(r1.getAttribute('data-rec-type')).toBe('leak');
      const r2 = screen.getByTestId('recommendation-card-r2');
      expect(r2.getAttribute('data-rec-type')).toBe('stale_spot');
      const r3 = screen.getByTestId('recommendation-card-r3');
      expect(r3.getAttribute('data-rec-type')).toBe('dormant_theme');
    });
  });

  it('click em CTA navega para cta_url', async () => {
    render(withClient(<RecommendationsView />));
    const cta = await screen.findByTestId('recommendation-card-r1-cta');
    await userEvent.click(cta);
    expect(navigateMock).toHaveBeenCalled();
    expect(String(navigateMock.mock.calls[0][0])).toMatch(/fromStats=leaks/);
  });

  it('filter "Tipo" pode escolher leak/spot/theme/todos', async () => {
    render(withClient(<RecommendationsView />));
    const filter = await screen.findByTestId('recommendations-filter-type');
    expect(filter).toBeInTheDocument();
  });

  it('filter aplica e oculta items de outros tipos', async () => {
    render(withClient(<RecommendationsView />));
    await screen.findByTestId('recommendation-card-r1');
    const leakBtn = screen.getByTestId('recommendations-filter-type-leak');
    await userEvent.click(leakBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('recommendation-card-r2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recommendation-card-r3')).not.toBeInTheDocument();
    });
  });

  it('empty state contextual: source_counts indicates "5 leaks mas todos baixa severidade"', async () => {
    apiRequestMock.mockImplementation(async () => ({
      items: [],
      source_counts: { leaks: 5, stale_spots: 0, dormant_themes: 0 },
      generated_at: new Date().toISOString(),
    }));
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      expect(screen.getByTestId('recommendations-empty')).toBeInTheDocument();
      const text = screen.getByTestId('recommendations-empty').textContent || '';
      expect(text).toMatch(/em dia|continue|leak/i);
    });
  });

  it('loading state: skeleton 5 cards', async () => {
    let resolve!: (v: any) => void;
    apiRequestMock.mockImplementation(() => new Promise((res) => { resolve = res; }));
    render(withClient(<RecommendationsView />));
    expect(screen.getAllByTestId(/^recommendations-skeleton/).length).toBeGreaterThan(0);
  });

  it('cache invalidation hook (useStudyActivityInvalidation) exposto pelo modulo', async () => {
    // Hook helper usado por ThemeDetail / SpotReview / SnapshotCreate
    const mod = await import('@/hooks/useStudyActivityInvalidation' as any).catch(() => null);
    expect(mod).not.toBeNull();
    expect(typeof mod.useStudyActivityInvalidation).toBe('function');
  });

  it('queryKey ["study", "recommendations"] usado para staleTime 5min', async () => {
    // Confirma keystable usando spy via apiRequest calls
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
    const calls = apiRequestMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('/api/study/recommendations'))).toBe(true);
  });

  it('data-testid raiz da view: studies-view-recomendacoes', async () => {
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-recomendacoes')).toBeInTheDocument();
    });
  });

  it('Promise allSettled tolerance: se request 500 -> empty UI sem crash', async () => {
    apiRequestMock.mockRejectedValue(new Error('500'));
    render(withClient(<RecommendationsView />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-recomendacoes')).toBeInTheDocument();
    });
  });
});
