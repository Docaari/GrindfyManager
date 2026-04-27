import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-2 — MentalAnalyticsTab
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-06)
//
// Modulo NAO existe ainda — Implementer cria em:
//   client/src/components/profile/MentalAnalyticsTab.tsx
//
// Contrato:
//   <MentalAnalyticsTab />  (autocontido — usa useQuery internamente)
//
// Comportamento:
//   - 4 widgets: gauge compliance, donut distribution, comparison impact, word cloud lessons
//   - Period selector 7d/30d/90d
//   - Loading state (skeletons)
//   - Error state (msg amigavel)
//   - Data vazia (info)
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

import { MentalAnalyticsTab } from '@/components/profile/MentalAnalyticsTab';

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
});

// ============================================================================
// 4 widgets render
// ============================================================================

describe('MentalAnalyticsTab - 4 widgets', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (url.includes('cooldown-compliance')) {
        return Promise.resolve({ total: 30, completed: 18, complianceRate: 0.6 });
      }
      if (url.includes('starred-hands-distribution')) {
        return Promise.resolve([
          { type: 'tilt', count: 12 },
          { type: 'leak', count: 7 },
        ]);
      }
      if (url.includes('cooldown-impact')) {
        return Promise.resolve({
          withCooldown: { avgRoi: 0.18 },
          withoutCooldown: { avgRoi: 0.05 },
          delta: 0.13,
        });
      }
      if (url.includes('top-lessons')) {
        return Promise.resolve([
          { token: 'paciencia', count: 8 },
          { token: 'volume', count: 5 },
        ]);
      }
      return Promise.resolve({});
    });
  });

  it('renderiza widget compliance (testid mental-analytics-compliance)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(
        screen.getByTestId('mental-analytics-compliance'),
      ).toBeInTheDocument();
    });
  });

  it('renderiza widget distribution (testid mental-analytics-distribution)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(
        screen.getByTestId('mental-analytics-distribution'),
      ).toBeInTheDocument();
    });
  });

  it('renderiza widget impact (testid mental-analytics-impact)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(
        screen.getByTestId('mental-analytics-impact'),
      ).toBeInTheDocument();
    });
  });

  it('renderiza widget lessons (testid mental-analytics-lessons)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(
        screen.getByTestId('mental-analytics-lessons'),
      ).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Loading state
// ============================================================================

describe('MentalAnalyticsTab - loading skeletons', () => {
  it('mostra skeleton enquanto data carrega', () => {
    apiRequestMock.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    render(wrap(<MentalAnalyticsTab />));

    const skeleton =
      screen.queryByTestId('mental-analytics-skeleton') ??
      document.querySelector('[data-testid*="skeleton"]') ??
      document.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });
});

// ============================================================================
// Error state
// ============================================================================

describe('MentalAnalyticsTab - error state', () => {
  it('mostra mensagem de erro quando fetch falha', async () => {
    apiRequestMock.mockRejectedValue(new Error('Network error'));
    render(wrap(<MentalAnalyticsTab />));

    await waitFor(
      () => {
        const err =
          screen.queryByTestId('mental-analytics-error') ??
          screen.queryByText(/erro|falhou|tente novamente/i);
        expect(err).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ============================================================================
// Empty state
// ============================================================================

describe('MentalAnalyticsTab - data vazia', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (url.includes('cooldown-compliance')) {
        return Promise.resolve({ total: 0, completed: 0, complianceRate: 0 });
      }
      if (url.includes('starred-hands-distribution')) return Promise.resolve([]);
      if (url.includes('cooldown-impact')) {
        return Promise.resolve({
          withCooldown: { avgRoi: 0 },
          withoutCooldown: { avgRoi: 0 },
          delta: 0,
        });
      }
      if (url.includes('top-lessons')) return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  it('mostra mensagem informativa quando nao ha dados (lessons)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(
      () => {
        const empty =
          screen.queryByTestId('mental-analytics-lessons-empty') ??
          screen.queryByText(/sem dados|nenhuma li[cç][aã]o|comece registrando/i);
        expect(empty).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ============================================================================
// Period selector
// ============================================================================

describe('MentalAnalyticsTab - period selector', () => {
  beforeEach(() => {
    apiRequestMock.mockResolvedValue({});
  });

  it('renderiza period selector (7d/30d/90d)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    const selector =
      screen.queryByTestId('mental-analytics-period') ??
      screen.queryByRole('combobox') ??
      screen.queryByLabelText(/per[ií]odo/i);
    expect(selector).toBeTruthy();
  });

  it('mudar period para 7d refaz fetch com period=7d', async () => {
    const user = userEvent.setup();
    render(wrap(<MentalAnalyticsTab />));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });

    const selector7d =
      screen.queryByTestId('mental-analytics-period-7d') ??
      screen.queryByRole('button', { name: /^7d$/i }) ??
      screen.queryByText(/^7d$/i);

    if (selector7d) {
      apiRequestMock.mockClear();
      await user.click(selector7d as HTMLElement);

      await waitFor(() => {
        const flat = JSON.stringify(apiRequestMock.mock.calls);
        expect(/period=7d|7d/.test(flat)).toBe(true);
      });
    }
  });
});
