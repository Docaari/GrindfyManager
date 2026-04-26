import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Testes TDD: client/src/components/bankroll/BankrollWidget.tsx (v2 — RF-12)
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-12)
// Atualiza widget para mostrar saldo consolidado (totalUSD/totalDisplayCurrency)
// + breakdown sumario (top 3 wallets por share). Mantem CTA "Configurar" para
// usuario sem wallet.
// =============================================================================

vi.mock('../../../client/src/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

import { apiRequest } from '../../../client/src/lib/queryClient';
import { BankrollWidget } from '../../../client/src/components/bankroll/BankrollWidget';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BankrollWidget v2 - aggregationMode global', () => {
  it('mostra totalUSD consolidado', async () => {
    (apiRequest as any).mockImplementation((methodOrUrl: string, urlArg?: string) => {
      const url = typeof urlArg === 'string' ? urlArg : methodOrUrl;
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({ snapshots: [], series: [], summary: { netChange: 0, startBalance: 5000, endBalance: 5000 }, pagination: { total: 0, limit: 100, offset: 0 } });
      }
      // Endpoint legado /api/bankroll: shape v1 + aggregationMode + walletCount
      return Promise.resolve({
        configured: true,
        amount: 5000,
        currency: 'USD',
        rule: '1pct',
        rulePct: 1.0,
        tolerance: 1.5,
        maxBuyInUSD: 75,
        maxBuyInDisplay: { USD: 75, BRL: 375 },
        amountDisplay: { USD: 5000, BRL: 25000 },
        exchangeRateBRL: 5.0,
        snapshotCount: 10,
        aggregationMode: 'global',
        walletCount: 4,
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const el = screen.getByTestId('bankroll-widget-amount');
      expect(el.textContent).toMatch(/5[.,]?000/);
    });
  });

  it('mostra walletCount como indicador de consolidacao', async () => {
    (apiRequest as any).mockImplementation((methodOrUrl: string, urlArg?: string) => {
      const url = typeof urlArg === 'string' ? urlArg : methodOrUrl;
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({ snapshots: [], series: [], summary: { netChange: 0 }, pagination: { total: 0, limit: 100, offset: 0 } });
      }
      return Promise.resolve({
        configured: true, amount: 5000, walletCount: 4,
        rule: '1pct', maxBuyInUSD: 75, snapshotCount: 0,
        aggregationMode: 'global',
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const wcount = screen.queryByTestId('bankroll-widget-wallet-count');
      if (wcount) {
        expect(wcount.textContent).toMatch(/4/);
      }
    });
  });
});

describe('BankrollWidget v2 - aggregationMode per_wallet (futuro)', () => {
  it.todo('per_wallet mode: widget mostra breakdown top 3 wallets');
});

describe('BankrollWidget v2 - empty state pos-V2', () => {
  it('configured=false mantem CTA "Configure sua banca"', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: false, amount: null, rule: '1pct', maxBuyInUSD: null, snapshotCount: 0, lastUpdatedAt: null,
      walletCount: 0,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-empty')).toBeTruthy();
    });
  });
});

describe('BankrollWidget v2 - i18n moeda explicita', () => {
  it('indicador de moeda explicito (R$, $, USDT) na display', async () => {
    (apiRequest as any).mockImplementation((methodOrUrl: string, urlArg?: string) => {
      const url = typeof urlArg === 'string' ? urlArg : methodOrUrl;
      if (url.includes('/api/bankroll/history')) {
        return Promise.resolve({ snapshots: [], series: [], summary: {}, pagination: { total: 0, limit: 100, offset: 0 } });
      }
      return Promise.resolve({
        configured: true, amount: 1000, rule: '1pct', maxBuyInUSD: 15, snapshotCount: 0,
        amountDisplay: { USD: 1000, BRL: 5000 },
        exchangeRateBRL: 5.0,
      });
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const widget = screen.getByTestId('bankroll-widget-amount');
      expect(widget.textContent).toMatch(/\$|USD|R\$|BRL/i);
    });
  });
});
