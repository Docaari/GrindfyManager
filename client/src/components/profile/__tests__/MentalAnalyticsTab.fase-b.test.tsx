/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Fase B — RF-01/RF-02 widgets (MentalAnalyticsTab)
 *
 * Spec : Docs/specs/sprint-fase-b-lead-measures-2026-06-01.md (RF-01 §widget / RF-02 §widget / RF-03)
 * ADR  : Docs/architecture/decisions/228-fase-b-lead-measures-warmup-compliance-abgame-distribution.md
 *
 * Dois widgets NOVOS, ADITIVOS aos 4 existentes (compliance/distribution/impact/lessons):
 *   - WarmupComplianceWidget   data-testid="mental-analytics-warmup-compliance"
 *       consome GET /api/analytics/warmup-compliance, exibe pct% + "{completed} de {total} sessoes..."
 *   - AbGameDistributionWidget data-testid="mental-analytics-abgame"
 *       consome GET /api/analytics/abgame-distribution, barra A/B + journaledSessions + chips cGameThemes
 *       empty-state data-testid="mental-analytics-abgame-empty"
 *
 * Mock de apiRequest retorna JSON parseado DIRETO (lesson #13), data-testid estavel (#2),
 * componente carregado por import estatico (mesma convencao do teste irmao
 * MentalAnalyticsTab.test.tsx, que usa import estatico — manter paridade; lesson #38
 * — nao misturar import/require no mesmo arquivo).
 *
 * RF-03 (enquadramento): nenhum widget mostra valor monetario/ROI nem comparacao social.
 *
 * Status RED: os widgets ainda nao existem no MentalAnalyticsTab; estes testes falham
 * por testid inexistente, nao por sintaxe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const WARMUP_FULL = {
  total: 10,
  completed: 7,
  complianceRate: 0.7,
  abortedCount: 2,
  decisionNotToPlayCount: 1,
  overrideUsedCount: 0,
};

const ABGAME_FULL = {
  journaledSessions: 5,
  aGameItemCount: 12,
  bGameItemCount: 6,
  cGameEntryCount: 3,
  avgAGamePerSession: 2.4,
  avgBGamePerSession: 1.2,
  abShare: { aGamePct: 0.667, bGamePct: 0.333 },
  cGameThemes: [
    { token: 'paciencia', count: 4 },
    { token: 'volume', count: 2 },
  ],
};

const ABGAME_EMPTY = {
  journaledSessions: 0,
  aGameItemCount: 0,
  bGameItemCount: 0,
  cGameEntryCount: 0,
  avgAGamePerSession: 0,
  avgBGamePerSession: 0,
  abShare: { aGamePct: 0, bGamePct: 0 },
  cGameThemes: [],
};

function routeMock(over: Record<string, any> = {}) {
  return (_method: string, url: string) => {
    if (url.includes('warmup-compliance')) {
      return Promise.resolve(over.warmup ?? WARMUP_FULL);
    }
    if (url.includes('abgame-distribution')) {
      return Promise.resolve(over.abgame ?? ABGAME_FULL);
    }
    // rotas cooldown pre-existentes (nao quebrar os outros widgets)
    if (url.includes('cooldown-compliance')) {
      return Promise.resolve({ total: 30, completed: 18, complianceRate: 0.6 });
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
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

// ============================================================================
// WarmupComplianceWidget — render + conteudo
// ============================================================================

describe('WarmupComplianceWidget (RF-01)', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(routeMock());
  });

  it('renderiza widget com data-testid mental-analytics-warmup-compliance', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mental-analytics-warmup-compliance')).toBeInTheDocument();
    });
  });

  it('chama GET /api/analytics/warmup-compliance', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('warmup-compliance');
    });
  });

  it('exibe pct (70%) e "7 de 10" sessoes', async () => {
    render(wrap(<MentalAnalyticsTab />));
    const widget = await screen.findByTestId('mental-analytics-warmup-compliance');
    await waitFor(() => {
      expect(widget.textContent ?? '').toMatch(/70\s*%/);
    });
    expect(widget.textContent ?? '').toMatch(/7.*10|10.*7/);
  });

  it('nao mostra valor monetario nem ROI (RF-03)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    const widget = await screen.findByTestId('mental-analytics-warmup-compliance');
    await waitFor(() => {
      expect(widget.textContent ?? '').toMatch(/%/);
    });
    const txt = widget.textContent ?? '';
    expect(txt).not.toMatch(/\$|R\$|ROI|lucro|profit/i);
  });
});

describe('WarmupComplianceWidget - loading', () => {
  it('mostra skeleton enquanto carrega', () => {
    apiRequestMock.mockImplementation(() => new Promise(() => {}));
    render(wrap(<MentalAnalyticsTab />));
    const skeleton =
      document.querySelector('[data-testid*="skeleton"]') ??
      document.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });
});

describe('WarmupComplianceWidget - error', () => {
  it('mostra erro isolado quando o fetch do warmup falha (sem derrubar a aba)', async () => {
    apiRequestMock.mockImplementation((_m: string, url: string) => {
      if (url.includes('warmup-compliance')) {
        return Promise.reject(new Error('Network error'));
      }
      return routeMock()(_m, url);
    });
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(
      () => {
        const err =
          screen.queryByTestId('mental-analytics-warmup-compliance-error') ??
          screen.queryByTestId('mental-analytics-error') ??
          screen.queryByText(/erro|falhou|tente novamente/i);
        expect(err).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ============================================================================
// AbGameDistributionWidget — render + conteudo
// ============================================================================

describe('AbGameDistributionWidget (RF-02)', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(routeMock());
  });

  it('renderiza widget com data-testid mental-analytics-abgame', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      expect(screen.getByTestId('mental-analytics-abgame')).toBeInTheDocument();
    });
  });

  it('chama GET /api/analytics/abgame-distribution', async () => {
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(() => {
      const flat = JSON.stringify(apiRequestMock.mock.calls);
      expect(flat).toContain('abgame-distribution');
    });
  });

  it('exibe os temas de C-game (chips: paciencia, volume)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    const widget = await screen.findByTestId('mental-analytics-abgame');
    await waitFor(() => {
      expect(widget.textContent ?? '').toMatch(/paciencia/i);
    });
    expect(widget.textContent ?? '').toMatch(/volume/i);
  });

  it('nao mostra valor monetario nem comparacao social (RF-03)', async () => {
    render(wrap(<MentalAnalyticsTab />));
    const widget = await screen.findByTestId('mental-analytics-abgame');
    await waitFor(() => {
      expect(widget.textContent ?? '').toMatch(/paciencia/i);
    });
    const txt = widget.textContent ?? '';
    expect(txt).not.toMatch(/\$|R\$|ROI|lucro|profit/i);
    expect(txt).not.toMatch(/m[eé]dia dos jogadores|outros jogadores|ranking/i);
  });
});

describe('AbGameDistributionWidget - empty state', () => {
  it('mostra empty-state (testid mental-analytics-abgame-empty) quando journaledSessions=0', async () => {
    apiRequestMock.mockImplementation(routeMock({ abgame: ABGAME_EMPTY }));
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(
      () => {
        const empty =
          screen.queryByTestId('mental-analytics-abgame-empty') ??
          screen.queryByText(/sem registros a\/b\/c|preencha o journal/i);
        expect(empty).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

describe('AbGameDistributionWidget - error', () => {
  it('mostra erro isolado quando o fetch do abgame falha', async () => {
    apiRequestMock.mockImplementation((_m: string, url: string) => {
      if (url.includes('abgame-distribution')) {
        return Promise.reject(new Error('boom'));
      }
      return routeMock()(_m, url);
    });
    render(wrap(<MentalAnalyticsTab />));
    await waitFor(
      () => {
        const err =
          screen.queryByTestId('mental-analytics-abgame-error') ??
          screen.queryByTestId('mental-analytics-error') ??
          screen.queryByText(/erro|falhou|tente novamente/i);
        expect(err).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ============================================================================
// Period selector refaz fetch dos 2 endpoints novos (RF — paridade com cooldown)
// ============================================================================

describe('MentalAnalyticsTab - period selector refaz fetch Fase B', () => {
  beforeEach(() => {
    apiRequestMock.mockImplementation(routeMock());
  });

  it('mudar period para 7d refaz fetch de warmup-compliance e abgame com period=7d', async () => {
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
        expect(/warmup-compliance.*7d|period=7d/.test(flat)).toBe(true);
        expect(/abgame-distribution.*7d|period=7d/.test(flat)).toBe(true);
      });
    }
  });
});
