/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M2: Setting bankrollManagementEnabled (lado Settings.tsx)
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M2 Cenarios 1, 2, 4, 5)
 * ADR-047 + ADR-048
 *
 * Cenarios cobertos:
 *   1. Switch [data-testid=setting-bankroll-management-toggle] reflete valor server
 *   2. Toggle off: PUT /api/user-settings com bankrollManagementEnabled=false
 *   3. Toggle off ESCONDE wallets list section. Mantem bankrollAmount + bankrollRule.
 *   4. Toggle on volta a mostrar wallets list.
 *
 * Modulo Settings.tsx EXISTE — implementer DEVE adicionar:
 *   - Switch novo data-testid=setting-bankroll-management-toggle no header
 *     da secao "Banca (Bankroll)"
 *   - Render condicional da lista de wallets baseado no toggle
 *   - Mutation PUT /api/user-settings com bankrollManagementEnabled boolean
 *   - GET /api/user-settings deve retornar bankrollManagementEnabled
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from '../Settings';

const apiRequestMock = vi.fn();
const invalidateQueriesMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  queryClient: {
    invalidateQueries: (...a: any[]) => invalidateQueriesMock(...a),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
}));

vi.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({ autoCollapseForGrind: false, setAutoCollapseForGrind: vi.fn() }),
}));

// useBankroll padrao — sem banca configurada para nao gerar form pre-preenchido.
vi.mock('@/hooks/useBankroll', () => ({
  useBankroll: () => ({
    data: { configured: true, amount: 1000, rule: '1pct' },
  }),
}));

vi.mock('@/components/bankroll/BankrollMovementDialog', () => ({
  BankrollMovementDialog: () => null,
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockReset();
  invalidateQueriesMock.mockReset();
  // Default GET /api/user-settings retorna bankrollManagementEnabled=true.
  apiRequestMock.mockImplementation((method: string, url: string) => {
    if (method === 'GET' && url.includes('/api/user-settings')) {
      return Promise.resolve({
        bankrollManagementEnabled: true,
        soundMode: 'tts',
        alertVolume: 0.8,
      });
    }
    if (method === 'GET' && url.includes('/api/wallets')) {
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  });
});

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>,
  );
}

// =============================================================================
// Cenario 1: switch reflete valor server
// =============================================================================

describe('Settings Sprint B2 (M2) — switch bankroll-management-toggle', () => {
  it('renderiza switch [data-testid=setting-bankroll-management-toggle]', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('setting-bankroll-management-toggle')).toBeInTheDocument();
    });
  });

  it('switch reflete bankrollManagementEnabled=true do server (checked=true)', async () => {
    renderSettings();
    await waitFor(() => {
      const toggle = screen.getByTestId('setting-bankroll-management-toggle');
      // Switch shadcn usa atributo aria-checked OU data-state="checked".
      const ariaChecked = toggle.getAttribute('aria-checked');
      const dataState = toggle.getAttribute('data-state');
      expect(ariaChecked === 'true' || dataState === 'checked').toBe(true);
    });
  });

  it('switch reflete bankrollManagementEnabled=false do server (checked=false)', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/user-settings')) {
        return Promise.resolve({ bankrollManagementEnabled: false });
      }
      if (method === 'GET' && url.includes('/api/wallets')) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });

    renderSettings();
    await waitFor(() => {
      const toggle = screen.getByTestId('setting-bankroll-management-toggle');
      const ariaChecked = toggle.getAttribute('aria-checked');
      const dataState = toggle.getAttribute('data-state');
      expect(ariaChecked === 'false' || dataState === 'unchecked').toBe(true);
    });
  });
});

// =============================================================================
// Cenario 2: toggle dispara PUT /api/user-settings
// =============================================================================

describe('Settings Sprint B2 (M2) — PUT /api/user-settings ao togglar', () => {
  it('toggle off dispara PUT com bankrollManagementEnabled=false', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('setting-bankroll-management-toggle')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('setting-bankroll-management-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      const putCalls = apiRequestMock.mock.calls.filter(
        (c: any[]) => c[0] === 'PUT' && typeof c[1] === 'string' && c[1].includes('/api/user-settings'),
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = putCalls[0][2];
      expect(body.bankrollManagementEnabled).toBe(false);
    });
  });

  it('toggle on dispara PUT com bankrollManagementEnabled=true', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/user-settings')) {
        return Promise.resolve({ bankrollManagementEnabled: false });
      }
      if (method === 'GET' && url.includes('/api/wallets')) {
        return Promise.resolve([]);
      }
      if (method === 'PUT') return Promise.resolve({ ok: true });
      return Promise.resolve({});
    });

    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('setting-bankroll-management-toggle')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('setting-bankroll-management-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      const putCalls = apiRequestMock.mock.calls.filter(
        (c: any[]) => c[0] === 'PUT' && typeof c[1] === 'string' && c[1].includes('/api/user-settings'),
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = putCalls[0][2];
      expect(body.bankrollManagementEnabled).toBe(true);
    });
  });
});

// =============================================================================
// Cenario 3: toggle off esconde lista de wallets, mantem banca legada
// =============================================================================

describe('Settings Sprint B2 (M2) — render condicional baseado no toggle', () => {
  it('toggle on (default): lista de wallets visivel', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('setting-bankroll-management-toggle')).toBeInTheDocument();
    });
    // Lista de wallets data-testid (estavel a ser implementado)
    expect(screen.queryByTestId('wallets-list-section')).toBeInTheDocument();
  });

  it('toggle off esconde wallets-list-section', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/user-settings')) {
        return Promise.resolve({ bankrollManagementEnabled: false });
      }
      if (method === 'GET' && url.includes('/api/wallets')) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });

    renderSettings();
    await waitFor(() => {
      expect(screen.getByTestId('setting-bankroll-management-toggle')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('wallets-list-section')).toBeNull();
  });

  it('toggle off mantem bankroll-amount-input e bankroll-rule-select visiveis (banca legada)', async () => {
    apiRequestMock.mockImplementation((method: string, url: string) => {
      if (method === 'GET' && url.includes('/api/user-settings')) {
        return Promise.resolve({ bankrollManagementEnabled: false });
      }
      if (method === 'GET' && url.includes('/api/wallets')) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });

    renderSettings();
    await waitFor(() => {
      // Banca legada existing — esses ja existem em prod, nao sao novos.
      expect(screen.getByTestId('bankroll-amount-input')).toBeInTheDocument();
      expect(screen.getByTestId('bankroll-rule-select')).toBeInTheDocument();
    });
  });
});
