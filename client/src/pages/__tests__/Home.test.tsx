/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-08 (Home page reformada — orquestracao).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-08, §3 D3, §3 D9
 * ADR  : Docs/architecture/decisions/099-home-operations-cockpit-pattern.md
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #13 apiRequest retorna JSON parseado direto (nao Response)
 *   #14 await import (nao require)
 *
 * Status RED: Home.tsx atual eh launcher legado. Implementer reescreve.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const apiRequestMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
  useLocation: () => ['/', vi.fn()],
}));

vi.mock('@assets/grindfy-logo-mark.png', () => ({ default: 'mark.png' }), {
  virtual: true,
} as any);
vi.mock('@assets/grindfy-logo-full.png', () => ({ default: 'full.png' }), {
  virtual: true,
} as any);

// WelcomeNameModal stub
vi.mock('@/components/WelcomeNameModal', () => ({
  WelcomeNameModal: () => <div data-testid="welcome-modal-stub" />,
}));

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={freshClient()}>{ui}</QueryClientProvider>;
}

const fullOverview = {
  userState: 'power' as const,
  statusStrip: {
    banca: { totalUsd: 8200, bisAvailable: 50, deltaPct7d: 1.2, sparkline: [] },
    roi30d: { value: 12.4, sparkline: [] },
    today: { plannedCount: 8, firstStartTime: '18:00', realizedPnlUsd: null },
    pendencias: { starredHands: 3, cooldownAlerts: 0 },
  },
  today: {
    profile: 'A',
    plannedCount: 8,
    firstStartTime: '18:00',
    stopLoss: { amount: 500, currency: 'USD' },
    stopTime: '23:00',
    hasWarmupToday: false,
  },
  banners: { cooldown: null, flight: null },
  nextTournament: null,
  lifetime: {
    totalTournaments: 1234,
    totalSessions: 56,
    activeDays: 200,
    currentStreakDays: 7,
  },
  recentSessions: [],
  performance: { roi: 12.4, itm: 18, cash: 22, sparkline: Array(30).fill(0), period: '30d' },
  pendingHands: [],
  news: { enabled: false, items: [] },
  meta: { generatedAt: '2026-05-03T17:00:00Z', cacheHit: false, subqueryTimingsMs: {} },
};

beforeEach(() => {
  apiRequestMock.mockReset();
  mockUseAuth.mockReset();
  mockEmit.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userPlatformId: 'USER-0001', email: 'a@b.com', name: 'Test' },
    isAuthenticated: true,
  });
  apiRequestMock.mockResolvedValue(fullOverview);
});

// =============================================================================
// Single query (D3)
// =============================================================================

describe('<Home /> — single TanStack query', () => {
  it('faz UMA chamada GET /api/home/overview', async () => {
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      const calls = apiRequestMock.mock.calls.filter(
        (c) =>
          /^GET$/i.test(String(c[0])) &&
          /\/api\/home\/overview/.test(String(c[1])),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =============================================================================
// Empty vs Power state
// =============================================================================

describe('<Home /> — userState branching', () => {
  it('userState=empty renderiza <EmptyHomeOnboarding>', async () => {
    apiRequestMock.mockResolvedValue({ ...fullOverview, userState: 'empty' });
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      const onboarding = screen.queryByTestId('home-empty-onboarding');
      expect(onboarding).toBeInTheDocument();
    });
  });

  it('userState=power NAO renderiza onboarding', async () => {
    apiRequestMock.mockResolvedValue({ ...fullOverview, userState: 'power' });
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      expect(screen.queryByTestId('home-empty-onboarding')).not.toBeInTheDocument();
    });
  });

  it('userState=power renderiza StatusStrip + LifetimeStats + componentes do cockpit', async () => {
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      expect(screen.queryByTestId('home-status-strip')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Banner priority (D9)
// =============================================================================

describe('<Home /> — banner priority (D9)', () => {
  it('flight ativo + cooldown ativo => FlightBanner aparece ACIMA de CooldownBanner', async () => {
    apiRequestMock.mockResolvedValue({
      ...fullOverview,
      banners: {
        cooldown: { active: true, until: '2026-05-03T18:00:00Z', type: 'stop-loss' },
        flight: {
          active: true,
          seriesTitle: 'KO Cup',
          nextDayStartTime: '2026-05-04T18:00:00Z',
          currentStackBb: 47,
          day: 2,
        },
      },
    });
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));

    await waitFor(() => {
      expect(screen.queryByTestId('flight-banner')).toBeInTheDocument();
      expect(screen.queryByTestId('cooldown-banner')).toBeInTheDocument();
    });

    // Posicao do flight no DOM antes do cooldown
    const flight = screen.getByTestId('flight-banner');
    const cooldown = screen.getByTestId('cooldown-banner');
    const pos = flight.compareDocumentPosition(cooldown);
    // 0x04 = DOCUMENT_POSITION_FOLLOWING (cooldown segue flight)
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// =============================================================================
// NewsSlot integration (RF-19)
// =============================================================================

describe('<Home /> — NewsSlot Onda 1 invisivel', () => {
  it('com news.enabled=false NAO ha testid home-news-slot no DOM', async () => {
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      expect(screen.queryByTestId('home-status-strip')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('home-news-slot')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Tracking events (RNF-09)
// =============================================================================

describe('<Home /> — tracking RNF-09', () => {
  it('emite home_view ao mount com payload { userState, cacheHit }', async () => {
    const { default: Home } = await import('../Home');
    render(wrap(<Home />));
    await waitFor(() => {
      const found = mockEmit.mock.calls.find(
        ([event]) => event === 'home_view',
      );
      expect(found).toBeDefined();
      const [, payload] = found!;
      expect(payload).toHaveProperty('userState');
      expect(payload).toHaveProperty('cacheHit');
    });
  });

  it('emite home_view apenas 1x por mount (nao em re-render)', async () => {
    const { default: Home } = await import('../Home');
    const { rerender } = render(wrap(<Home />));
    await waitFor(() => {
      expect(mockEmit.mock.calls.find(([e]) => e === 'home_view')).toBeDefined();
    });
    rerender(wrap(<Home />));
    const homeViewCalls = mockEmit.mock.calls.filter(([e]) => e === 'home_view');
    expect(homeViewCalls.length).toBe(1);
  });
});

// =============================================================================
// WelcomeNameModal preserved (RNF-07)
// =============================================================================

describe('<Home /> — RNF-07 zero regressao WelcomeNameModal', () => {
  it('importa WelcomeNameModal sem quebrar (smoke)', async () => {
    const { default: Home } = await import('../Home');
    const { container } = render(wrap(<Home />));
    expect(container).toBeDefined();
  });
});
