/**
 * Test — Sprint home-reform-4 item 2+6.
 *
 * Spec: Docs/specs/home-reform-4.md item 2 (Card Dashboard mes atual) +
 * item 6 (Performance abaixo Sessoes, mesmo padrao).
 *
 * Cobre orchestrator getDashboardMonthSummary:
 *   - Soma count, profit, invested em USD agregando sites multi-currency.
 *   - FX via fxResolver mockado.
 *   - ROI null quando invested=0.
 *   - Empty rows -> count=0, totals=0, roiPct=null.
 *   - Storage falha -> shape vazio sem throw (graceful degradation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lesson #14: vi.hoisted evita TDZ no top-level const.
const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getDashboardMonthAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getDashboardMonthSummary } from '../../server/services/dashboardMonth';

describe('getDashboardMonthSummary', () => {
  beforeEach(() => {
    storageMock.getDashboardMonthAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
  });

  it('rows vazias -> totals zero + roiPct null', async () => {
    storageMock.getDashboardMonthAggregate.mockResolvedValue([]);
    const out = await getDashboardMonthSummary('USER-0001');
    expect(out.count).toBe(0);
    expect(out.profitUsd).toBe(0);
    expect(out.investedUsd).toBe(0);
    expect(out.roiPct).toBeNull();
    expect(out.monthStart).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('agrega multi-site com FX (USD + BRL); profitNative = net profit', async () => {
    // PokerStars=USD: invested 200 USD, profit 60 USD.
    // Suprema=BRL: invested 1000 BRL = 200 USD (rate 5), profit 250 BRL = 50 USD.
    storageMock.getDashboardMonthAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 7, investedNative: '200', profitNative: '60' },
      { site: 'Suprema', count: 4, investedNative: '1000', profitNative: '250' },
    ]);
    const out = await getDashboardMonthSummary('USER-0001');
    expect(out.count).toBe(11);
    expect(out.investedUsd).toBeCloseTo(400, 2);
    expect(out.profitUsd).toBeCloseTo(110, 2);
    expect(out.roiPct).toBeCloseTo(27.5, 1);
  });

  it('roiPct null quando invested = 0 mesmo com count > 0', async () => {
    storageMock.getDashboardMonthAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 2, investedNative: '0', profitNative: '0' },
    ]);
    const out = await getDashboardMonthSummary('USER-0001');
    expect(out.count).toBe(2);
    expect(out.investedUsd).toBe(0);
    expect(out.roiPct).toBeNull();
  });

  it('storage falha -> retorna shape vazio sem throw', async () => {
    storageMock.getDashboardMonthAggregate.mockRejectedValue(new Error('db down'));
    const out = await getDashboardMonthSummary('USER-0001');
    expect(out.count).toBe(0);
    expect(out.profitUsd).toBe(0);
    expect(out.roiPct).toBeNull();
  });
});
