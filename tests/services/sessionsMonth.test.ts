/**
 * Test — Sprint home-reform-4 item 1.
 *
 * Spec: Docs/specs/home-reform-4.md item 1 (Card Sessoes mes atual).
 *
 * Cobre orchestrator getSessionsMonthSummary:
 *   - Soma count, profit, invested em USD agregando sites multi-currency.
 *   - FX via fxResolver mockado.
 *   - ROI null quando invested=0.
 *   - Empty rows -> count=0, totals=0, roiPct=null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage primeiro com vi.hoisted (lesson #14) pra evitar TDZ.
const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getSessionsMonthAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getSessionsMonthSummary } from '../../server/services/sessionsMonth';

describe('getSessionsMonthSummary', () => {
  beforeEach(() => {
    storageMock.getSessionsMonthAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
  });

  it('rows vazias -> totals zero + roiPct null', async () => {
    storageMock.getSessionsMonthAggregate.mockResolvedValue([]);
    const out = await getSessionsMonthSummary('USER-0001');
    expect(out.count).toBe(0);
    expect(out.profitUsd).toBe(0);
    expect(out.investedUsd).toBe(0);
    expect(out.roiPct).toBeNull();
    expect(out.monthStart).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('agrega multi-site com FX (USD + BRL)', async () => {
    // Site PokerStars=USD, Suprema=BRL. 5+3 torneios.
    // PokerStars: invested 100 USD, returns 130 USD -> profit 30 USD
    // Suprema: invested 500 BRL = 100 USD (rate 5), returns 750 BRL = 150 USD -> profit 50 USD
    storageMock.getSessionsMonthAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 5, investedNative: '100', returnsNative: '130' },
      { site: 'Suprema', count: 3, investedNative: '500', returnsNative: '750' },
    ]);
    const out = await getSessionsMonthSummary('USER-0001');
    expect(out.count).toBe(8);
    expect(out.investedUsd).toBeCloseTo(200, 2);
    expect(out.profitUsd).toBeCloseTo(80, 2);
    expect(out.roiPct).toBeCloseTo(40, 1);
  });

  it('roiPct null quando invested = 0 mesmo com count > 0', async () => {
    storageMock.getSessionsMonthAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 2, investedNative: '0', returnsNative: '0' },
    ]);
    const out = await getSessionsMonthSummary('USER-0001');
    expect(out.count).toBe(2);
    expect(out.investedUsd).toBe(0);
    expect(out.roiPct).toBeNull();
  });

  it('storage falha -> retorna shape vazio sem throw', async () => {
    storageMock.getSessionsMonthAggregate.mockRejectedValue(new Error('db down'));
    const out = await getSessionsMonthSummary('USER-0001');
    expect(out.count).toBe(0);
    expect(out.profitUsd).toBe(0);
    expect(out.roiPct).toBeNull();
  });
});
