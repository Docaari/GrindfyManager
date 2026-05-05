import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Bankroll-Reform 2026-05-05: founder removeu botao do header.
// Apenas trigger em WalletDetailPanel permanece (source='wallet_menu').
// =============================================================================

import BankrollPage from '../Bankroll';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async (method: string, url: string) => {
    const r = await (global.fetch as any)(url, { method, credentials: 'include' });
    if (!r?.ok) throw new Error('mock_fetch_not_ok');
    return r.json();
  }),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
    fetchQuery: vi.fn(),
  },
  getCsrfToken: () => null,
}));

vi.mock('@/components/bankroll/BankrollWidget', () => ({
  BankrollWidget: () => null,
}));
vi.mock('@/components/bankroll/BankrollHistoryTable', () => ({
  BankrollHistoryTable: () => null,
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

describe('Bankroll page — botao "Reportar rakeback" header REMOVIDO (reform)', () => {
  it('header NAO renderiza mais bankroll-rakeback-trigger-header', async () => {
    setupFetchMocks();
    render(wrap(<BankrollPage />));

    await waitFor(() => {
      // wait for page render via wallet-detail trigger appearance
      expect(screen.getByTestId('wallet-detail-rakeback-trigger')).toBeTruthy();
    });
    expect(screen.queryByTestId('bankroll-rakeback-trigger-header')).toBeNull();
  });
});

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
        expect(lastView![2]?.walletId).toBeDefined();
      });
    } finally {
      spy.mockRestore();
    }
  });
});
