/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-02: Dashboard view (5 secoes)
 *
 * Lessons aplicadas:
 *   #1 hooks first
 *   #2 data-testid: studies-dashboard, dashboard-section-{name}, studies-dashboard-card-{type}
 *   #3 mocks shape REAL (themes shape, starredHands shape)
 *   #9 falha por secao isolada nao bloqueia outras
 *   #11 sem default actions decorativas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/estudos/dashboard', navigateMock],
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
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

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: (a: any) => toastMock(a),
}));

// @ts-expect-error - componente nao existe ainda (red phase)
import { StudiesDashboard } from '../StudiesDashboard';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const themesFixture = [
  {
    id: 'thm_1',
    userId: 'USER-0001',
    name: 'IP vs BB',
    color: '#16a34a',
    emoji: '',
    isFavorite: false,
    sortOrder: 0,
    progress: 60,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-30T10:00:00Z',
    lastVisitedAt: '2026-04-30T10:00:00Z',
  },
];

const spotsFixture = [
  {
    id: 'spot_1',
    userId: 'USER-0001',
    type: 'tilt',
    spot: 'ip_vs_bb',
    conclusion: 'foldei muito IP',
    reviewLater: true,
    status: 'pending',
    createdAt: '2026-04-29T10:00:00Z',
    imageUrl: null,
  },
];

const insightsFixture = {
  themesOpenedThisWeek: 4,
  spotsReviewedThisWeek: 7,
  hoursStudiedThisWeek: 3.5,
};

const recommendationsFixture = {
  items: [
    {
      id: 'r1', type: 'leak', title: 'Leak grave: PKO ROI -8%',
      description: '', priority_score: 37, cta_action: 'create_theme',
      cta_url: '/estudos/temas?fromStats=leaks', metadata: { leak_severity: 9 },
    },
  ],
  generated_at: new Date().toISOString(),
  source_counts: { leaks: 5, stale_spots: 2, dormant_themes: 1 },
};

const streakFixture = {
  days: 5, last_activity_at: '2026-05-01T08:00:00Z',
  heatmap_last_7_days: [
    { date: '2026-04-25', active: true }, { date: '2026-04-26', active: true },
    { date: '2026-04-27', active: false }, { date: '2026-04-28', active: true },
    { date: '2026-04-29', active: true }, { date: '2026-04-30', active: true },
    { date: '2026-05-01', active: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockReset();
  navigateMock.mockReset();
  // Default: each query resolves successfully
  apiRequestMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/study-themes')) return themesFixture;
    if (url.includes('/api/starred-hands')) return spotsFixture;
    if (url.includes('/api/dashboard/insights/week')) return insightsFixture;
    if (url.includes('/api/study/recommendations')) return recommendationsFixture;
    if (url.includes('/api/study/streak')) return streakFixture;
    return null;
  });
  // Stub fetch (TanStack default)
  global.fetch = vi.fn(async (url: any) => {
    const urlStr = String(url);
    const data = await apiRequestMock(urlStr);
    return new Response(JSON.stringify(data), { status: 200 });
  }) as any;
});

describe('RF-02 StudiesDashboard — render principal', () => {
  it('renderiza 5 cards (continue / insights / spots / recomendacoes / streak)', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-card-continue')).toBeInTheDocument();
      expect(screen.getByTestId('studies-dashboard-card-insights')).toBeInTheDocument();
      expect(screen.getByTestId('studies-dashboard-card-spots')).toBeInTheDocument();
      expect(screen.getByTestId('studies-dashboard-card-recomendacoes')).toBeInTheDocument();
      expect(screen.getByTestId('studies-dashboard-card-streak')).toBeInTheDocument();
    });
  });

  it('Continue de onde parou: card mostra nome do tema do fixture', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      const card = screen.getByTestId('studies-dashboard-card-continue');
      expect(card.textContent).toMatch(/IP vs BB/);
    });
  });

  it('Continue de onde parou: click navega para /estudos/temas/<id>', async () => {
    render(withClient(<StudiesDashboard />));
    const card = await screen.findByTestId('studies-dashboard-card-continue-item-thm_1');
    await userEvent.click(card);
    expect(navigateMock).toHaveBeenCalled();
    const path = navigateMock.mock.calls[0][0];
    expect(String(path)).toMatch(/^\/estudos\/temas\/thm_1/);
  });

  it('Insights mostra 3 KPIs (themesOpened, spotsReviewed, hoursStudied)', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-card-insights').textContent).toMatch(/4/);
      expect(screen.getByTestId('studies-dashboard-card-insights').textContent).toMatch(/7/);
      expect(screen.getByTestId('studies-dashboard-card-insights').textContent).toMatch(/3[.,]5/);
    });
  });

  it('Spots pendentes top 3: lista no maximo 3 cards', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      const card = screen.getByTestId('studies-dashboard-card-spots');
      const items = card.querySelectorAll('[data-testid^="dashboard-spot-"]');
      expect(items.length).toBeLessThanOrEqual(3);
    });
  });

  it('Recomendacoes mostra titulo do item de recomendacao', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-card-recomendacoes').textContent).toMatch(/Leak grave/);
    });
  });

  it('Streak counter exibe numero de dias', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-card-streak').textContent).toMatch(/5/);
    });
  });

  it('Loading state: skeletons durante fetch inicial', async () => {
    // Force pending fetch
    let resolve!: (v: any) => void;
    apiRequestMock.mockImplementation(() => new Promise((res) => { resolve = res; }));
    render(withClient(<StudiesDashboard />));
    expect(screen.getAllByTestId(/^studies-dashboard-skeleton/).length).toBeGreaterThan(0);
  });

  it('Empty state: zero temas + zero spots renderiza CTA "Criar primeiro tema"', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/study-themes')) return [];
      if (url.includes('/api/starred-hands')) return [];
      if (url.includes('/api/dashboard/insights/week')) return { themesOpenedThisWeek: 0, spotsReviewedThisWeek: 0, hoursStudiedThisWeek: 0 };
      if (url.includes('/api/study/recommendations')) return { items: [], source_counts: { leaks: 0, stale_spots: 0, dormant_themes: 0 } };
      if (url.includes('/api/study/streak')) return { days: 0, last_activity_at: null, heatmap_last_7_days: [] };
      return null;
    });
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-empty-cta')).toBeInTheDocument();
    });
  });

  it('Greeting (Bom dia / Boa tarde / Boa noite) presente', async () => {
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      const root = screen.getByTestId('studies-dashboard');
      expect(root.textContent).toMatch(/Bom dia|Boa tarde|Boa noite|Ola/i);
    });
  });

  it('Tolerancia a falha: recommendations falha mas insights ainda renderiza (lesson #9)', async () => {
    apiRequestMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/study-themes')) return themesFixture;
      if (url.includes('/api/starred-hands')) return spotsFixture;
      if (url.includes('/api/dashboard/insights/week')) return insightsFixture;
      if (url.includes('/api/study/recommendations')) throw new Error('boom');
      if (url.includes('/api/study/streak')) return streakFixture;
      return null;
    });
    render(withClient(<StudiesDashboard />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-dashboard-card-insights')).toBeInTheDocument();
    });
  });
});
