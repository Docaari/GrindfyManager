import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// BankrollWidget — Bankroll-Reform 2026-05-05
//
// Card "Banca atual" minimal:
//   - Total USD em destaque
//   - Breakdown USD/BRL/EUR menor
//   - Quantidade de carteiras
//   - Lateral direita: ABI count + ABI configurado clickavel pra editar
// Removido: sparkline, projecao mensal (founder pediu card limpo).
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

describe('BankrollWidget — empty state', () => {
  it('banca nao configurada -> CTA "Configure sua banca"', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: false,
      amount: null,
      rule: '1pct',
      maxBuyInUSD: null,
      snapshotCount: 0,
      lastUpdatedAt: null,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('bankroll-widget-cta')).toBeTruthy();
  });

  it('CTA aponta para /settings', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: false, amount: null, rule: '1pct', maxBuyInUSD: null, snapshotCount: 0, lastUpdatedAt: null,
    });
    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const cta = screen.getByTestId('bankroll-widget-cta');
      expect(cta.getAttribute('href') ?? cta.getAttribute('data-to')).toContain('/settings');
    });
  });
});

describe('BankrollWidget — banca configurada (novo layout)', () => {
  it('mostra total USD em destaque', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 10,
      maxBuyInDisplay: { USD: 10, BRL: 52, EUR: 9.3 },
      amountDisplay: { USD: 1000, BRL: 5200, EUR: 930 },
      exchangeRateBRL: 5.2,
      exchangeRateEUR: 0.93,
      walletCount: 2,
      snapshotCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const el = screen.getByTestId('bankroll-widget-amount');
      expect(el.textContent).toMatch(/1[.,]?000/);
    });
  });

  it('breakdown renderiza USD + BRL + EUR', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      maxBuyInUSD: 10,
      maxBuyInDisplay: { USD: 10, BRL: 52, EUR: 9.3 },
      amountDisplay: { USD: 1000, BRL: 5200, EUR: 930 },
      exchangeRateBRL: 5.2,
      exchangeRateEUR: 0.93,
      walletCount: 2,
      snapshotCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-breakdown-usd')).toBeTruthy();
      expect(screen.getByTestId('bankroll-widget-breakdown-brl')).toBeTruthy();
      expect(screen.getByTestId('bankroll-widget-breakdown-eur')).toBeTruthy();
    });
  });

  it('breakdown EUR ausente quando exchangeRateEUR=null', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      maxBuyInUSD: 10,
      maxBuyInDisplay: { USD: 10, BRL: 52 },
      amountDisplay: { USD: 1000, BRL: 5200 },
      exchangeRateBRL: 5.2,
      exchangeRateEUR: null,
      walletCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-breakdown-usd')).toBeTruthy();
    });
    expect(screen.queryByTestId('bankroll-widget-breakdown-eur')).toBeNull();
  });

  it('quantidade de carteiras visivel quando walletCount>0', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      maxBuyInUSD: 10,
      walletCount: 3,
      amountDisplay: { USD: 1000 },
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const el = screen.getByTestId('bankroll-widget-wallet-count');
      expect(el.textContent).toMatch(/3.*carteira/i);
    });
  });

  it('ABI count = floor(amount / softLimitUSD)', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1435,
      rule: 'custom:0.5',
      rulePct: 0.5,
      softLimitUSD: 7.175,
      hardLimitUSD: 10.7625,
      maxBuyInUSD: 10.7625,
      amountDisplay: { USD: 1435 },
      walletCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const el = screen.getByTestId('bankroll-widget-abi-count');
      // 1435 / 7.175 = 200
      expect(el.textContent).toMatch(/200/);
    });
  });

  it('botao ABI editavel mostra soft limit (ABI configurado), nao hard', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1435,
      rule: 'custom:0.5',
      rulePct: 0.5,
      softLimitUSD: 7.175,
      hardLimitUSD: 10.7625,
      maxBuyInUSD: 10.7625,
      amountDisplay: { USD: 1435 },
      walletCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      const btn = screen.getByTestId('bankroll-widget-abi-edit');
      expect(btn.textContent).toMatch(/ABI.*\$.*7/);
    });
  });

  it('elementos REMOVIDOS no card minimal: sparkline, projection, amount-brl', async () => {
    (apiRequest as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      rule: '1pct',
      maxBuyInUSD: 10,
      amountDisplay: { USD: 1000, BRL: 5200 },
      walletCount: 1,
    });

    render(withClient(<BankrollWidget />));

    await waitFor(() => {
      expect(screen.getByTestId('bankroll-widget-amount')).toBeTruthy();
    });

    expect(screen.queryByTestId('bankroll-widget-sparkline')).toBeNull();
    expect(screen.queryByTestId('bankroll-widget-sparkline-note')).toBeNull();
    expect(screen.queryByTestId('bankroll-widget-projection')).toBeNull();
    expect(screen.queryByTestId('bankroll-widget-amount-brl')).toBeNull();
  });
});
