import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint Bankroll-3 — Disparadores do RakebackDialog em /bankroll (RF-04).
//
// Spec: Docs/specs/rakeback-reporting.md (RF-04).
//
// Trigger 1 (page_header): botao no header da pagina abre dialog SEM wallet
// pre-selecionada e telemetria com source='page_header'.
//
// Trigger 2 (wallet_menu): botao em WalletDetailPanel abre dialog COM wallet
// pre-selecionada e telemetria com source='wallet_menu'.
//
// data-testids estaveis no codigo real:
//   bankroll-rakeback-trigger-header
//   wallet-detail-rakeback-trigger
//   rakeback-dialog
//   rakeback-wallet-select
//   rakeback-wallet-pinned
// =============================================================================

import BankrollPage from '../Bankroll';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

// Stubs leves para componentes pesados nao relacionados a rakeback.
vi.mock('@/components/bankroll/BankrollWidget', () => ({
  BankrollWidget: () => null,
}));
vi.mock('@/components/bankroll/BankrollHistoryTable', () => ({
  BankrollHistoryTable: () => null,
}));
vi.mock('@/components/bankroll/BankrollMovementDialog', () => ({
  BankrollMovementDialog: () => null,
}));
vi.mock('@/components/bankroll/WalletCreateDialog', () => ({
  WalletCreateDialog: () => null,
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

const wallets = [
  {
    id: 'wlt_brl',
    name: 'Suprema Main',
    platform: 'Suprema',
    nativeCurrency: 'BRL',
    balance: '1180.00',
    status: 'active',
  },
  {
    id: 'wlt_usd',
    name: 'PokerStars Global',
    platform: 'PokerStars',
    nativeCurrency: 'USD',
    balance: '500.00',
    status: 'active',
  },
];

function setupFetchMocks() {
  fetchMock.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/wallets')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ wallets }),
        text: async () => '',
      } as any;
    }
    if (typeof url === 'string' && url.startsWith('/api/bankroll/consolidated')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totalUSD: '1736.00',
          walletCount: 2,
          aggregationMode: 'global',
          byWallet: wallets.map((w) => ({
            walletId: w.id,
            name: w.name,
            platform: w.platform,
            nativeCurrency: w.nativeCurrency,
            balanceNative: w.balance,
            balanceUSD: '500.00',
            fxRateUSDPerNative: w.nativeCurrency === 'BRL' ? '5.0' : '1.0',
          })),
        }),
        text: async () => '',
      } as any;
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as any;
  });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// =============================================================================
// 1. Trigger no header
// =============================================================================

describe('Bankroll page — botao "Reportar rakeback" no header (RF-04)', () => {
  it('renderiza data-testid="bankroll-rakeback-trigger-header"', async () => {
    setupFetchMocks();
    render(wrap(<BankrollPage />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-rakeback-trigger-header')).toBeTruthy();
    });
  });

  it('click no header abre RakebackDialog COM select (sem wallet pre-selecionada)', async () => {
    setupFetchMocks();
    const user = userEvent.setup();
    render(wrap(<BankrollPage />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-rakeback-trigger-header')).toBeTruthy();
    });
    await user.click(screen.getByTestId('bankroll-rakeback-trigger-header'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-dialog')).toBeTruthy();
    });
    expect(screen.getByTestId('rakeback-wallet-select')).toBeTruthy();
    expect(screen.queryByTestId('rakeback-wallet-pinned')).toBeFalsy();
  });

  it('telemetria rakeback_dialog_view inclui source="page_header"', async () => {
    setupFetchMocks();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(wrap(<BankrollPage />));

      await waitFor(() => {
        expect(screen.getByTestId('bankroll-rakeback-trigger-header')).toBeTruthy();
      });
      await user.click(screen.getByTestId('bankroll-rakeback-trigger-header'));

      await waitFor(() => {
        const events = spy.mock.calls.filter(
          (c) => String(c[0] ?? '').includes('[telemetry][rakeback]') && c[1] === 'rakeback_dialog_view',
        );
        expect(events.length).toBeGreaterThan(0);
        const lastView = events[events.length - 1];
        expect(lastView[2]?.source).toBe('page_header');
      });
    } finally {
      spy.mockRestore();
    }
  });
});

// =============================================================================
// 2. Trigger em WalletDetailPanel
// =============================================================================

describe('Bankroll page — botao "Reportar rakeback" no WalletDetailPanel (RF-04)', () => {
  it('renderiza data-testid="wallet-detail-rakeback-trigger" apos selecionar wallet', async () => {
    setupFetchMocks();
    render(wrap(<BankrollPage />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-detail-rakeback-trigger')).toBeTruthy();
    });
  });

  it('click no detail trigger abre RakebackDialog COM wallet pinned (source=wallet_menu)', async () => {
    setupFetchMocks();
    const user = userEvent.setup();
    render(wrap(<BankrollPage />));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-detail-rakeback-trigger')).toBeTruthy();
    });
    await user.click(screen.getByTestId('wallet-detail-rakeback-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('rakeback-dialog')).toBeTruthy();
    });
    expect(screen.getByTestId('rakeback-wallet-pinned')).toBeTruthy();
    expect(screen.queryByTestId('rakeback-wallet-select')).toBeFalsy();
  });

  it('telemetria rakeback_dialog_view inclui source="wallet_menu" e walletId', async () => {
    setupFetchMocks();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(wrap(<BankrollPage />));

      await waitFor(() => {
        expect(screen.getByTestId('wallet-detail-rakeback-trigger')).toBeTruthy();
      });
      await user.click(screen.getByTestId('wallet-detail-rakeback-trigger'));

      await waitFor(() => {
        const lastView = spy.mock.calls
          .filter(
            (c) => String(c[0] ?? '').includes('[telemetry][rakeback]') && c[1] === 'rakeback_dialog_view',
          )
          .pop();
        expect(lastView).toBeTruthy();
        expect(lastView![2]?.source).toBe('wallet_menu');
        // walletId pre-selecionado da wallet ativa selecionada por default
        expect(lastView![2]?.walletId).toBeDefined();
      });
    } finally {
      spy.mockRestore();
    }
  });
});
