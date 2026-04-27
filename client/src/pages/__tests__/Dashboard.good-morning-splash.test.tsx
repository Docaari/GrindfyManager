import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — Dashboard splash "Bom dia!"
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-02 Bloco 4 + Sleep Gate)
//
// Comportamento:
//   - Quando user.dashboardSnoozedUntil > now(): renderiza splash
//     (testid dashboard-good-morning-splash) com mensagem "Bom dia!" + CTA
//     "Pronto para a proxima?"
//   - CTA limpa snooze (PATCH /api/users/me {dashboardSnoozedUntil: null})
//   - Quando dashboardSnoozedUntil < now() OU null: NAO mostra splash, dashboard
//     normal renderiza
//
// Test usa Dashboard component como caixa preta — apenas asserts no splash.
// =============================================================================

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

// Mock contextos pesados — Dashboard usa muitos contextos/queries.
const useAuthMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

// Stub child components para isolamento — splash e independente da arvore
// completa do Dashboard. Implementer pode optar por renderizar splash em
// componente separado (preferivel) e Dashboard apenas mounta-lo.
vi.mock('@/components/dashboard/DashboardFilters', () => ({
  DashboardFilters: () => <div data-testid="stub-filters" />,
}));
vi.mock('@/components/dashboard/DashboardMetrics', () => ({
  DashboardMetrics: () => <div data-testid="stub-metrics" />,
}));
vi.mock('@/components/dashboard/DashboardTabs', () => ({
  DashboardTabs: () => <div data-testid="stub-tabs" />,
}));
vi.mock('@/components/dashboard/TabEvolution', () => ({ TabEvolution: () => null }));
vi.mock('@/components/dashboard/TabSite', () => ({ TabSite: () => null }));
vi.mock('@/components/dashboard/TabBuyin', () => ({ TabBuyin: () => null }));
vi.mock('@/components/dashboard/TabCategory', () => ({ TabCategory: () => null }));
vi.mock('@/components/dashboard/TabSpeed', () => ({ TabSpeed: () => null }));
vi.mock('@/components/dashboard/TabPeriod', () => ({ TabPeriod: () => null }));
vi.mock('@/components/dashboard/TabParticipants', () => ({ TabParticipants: () => null }));
vi.mock('@/components/dashboard/TabPosition', () => ({ TabPosition: () => null }));
vi.mock('@/components/dashboard/TicketsWidget', () => ({ TicketsWidget: () => null }));
vi.mock('@/components/bankroll/BankrollWidget', () => ({ BankrollWidget: () => null }));

import Dashboard from '@/pages/Dashboard';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({});
});

// ============================================================================
// snoozedUntil > now() -> splash visivel
// ============================================================================

describe('Dashboard - splash "Bom dia!" quando snoozedUntil futuro', () => {
  it('renderiza splash (testid dashboard-good-morning-splash) quando snoozed', async () => {
    const future = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // +6h
    useAuthMock.mockReturnValue({
      user: {
        userPlatformId: 'USER-0001',
        dashboardSnoozedUntil: future,
      },
    });

    render(wrap(<Dashboard />));

    await waitFor(() => {
      expect(
        screen.getByTestId('dashboard-good-morning-splash'),
      ).toBeInTheDocument();
    });
  });

  it('splash mostra mensagem "Bom dia!"', async () => {
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    useAuthMock.mockReturnValue({
      user: {
        userPlatformId: 'USER-0001',
        dashboardSnoozedUntil: future,
      },
    });

    render(wrap(<Dashboard />));

    await waitFor(() => {
      expect(screen.getByText(/bom dia/i)).toBeInTheDocument();
    });
  });

  it('splash mostra CTA "Pronto para a proxima?"', async () => {
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    useAuthMock.mockReturnValue({
      user: {
        userPlatformId: 'USER-0001',
        dashboardSnoozedUntil: future,
      },
    });

    render(wrap(<Dashboard />));

    await waitFor(() => {
      const cta =
        screen.queryByTestId('dashboard-good-morning-cta') ??
        screen.queryByRole('button', { name: /pronto para a pr[oó]xima/i });
      expect(cta).toBeTruthy();
    });
  });

  it('clicar CTA dispara PATCH /api/users/me com dashboardSnoozedUntil=null', async () => {
    const user = userEvent.setup();
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    useAuthMock.mockReturnValue({
      user: {
        userPlatformId: 'USER-0001',
        dashboardSnoozedUntil: future,
      },
    });

    render(wrap(<Dashboard />));

    const cta = await waitFor(() => {
      return (
        screen.queryByTestId('dashboard-good-morning-cta') ??
        screen.queryByRole('button', { name: /pronto para a pr[oó]xima/i })
      );
    });

    if (cta) {
      await user.click(cta as HTMLElement);

      await waitFor(() => {
        const flat = JSON.stringify(apiRequestMock.mock.calls);
        expect(/PATCH/i.test(flat)).toBe(true);
        expect(/users\/me/.test(flat)).toBe(true);
        expect(/dashboardSnoozedUntil/.test(flat)).toBe(true);
      });
    }
  });
});

// ============================================================================
// snoozedUntil <= now() ou null -> NAO mostra splash
// ============================================================================

describe('Dashboard - sem splash quando snoozedUntil expirou ou null', () => {
  it('snoozedUntil null: NAO renderiza splash', () => {
    useAuthMock.mockReturnValue({
      user: { userPlatformId: 'USER-0001', dashboardSnoozedUntil: null },
    });
    render(wrap(<Dashboard />));
    expect(
      screen.queryByTestId('dashboard-good-morning-splash'),
    ).not.toBeInTheDocument();
  });

  it('snoozedUntil no passado: NAO renderiza splash', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // -1h
    useAuthMock.mockReturnValue({
      user: { userPlatformId: 'USER-0001', dashboardSnoozedUntil: past },
    });
    render(wrap(<Dashboard />));
    expect(
      screen.queryByTestId('dashboard-good-morning-splash'),
    ).not.toBeInTheDocument();
  });
});
