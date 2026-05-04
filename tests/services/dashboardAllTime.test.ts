/**
 * Test — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md item 7 (Dashboard All Time).
 *
 * Cobre orchestrator getDashboardAllTimeSummary:
 *   - 6 KPIs no shape do SessionsRegisteredSummary mas fonte = tournaments
 *     historico (uploads/manual/sharkscope; CLAUDE.md §6.1).
 *   - FX cascade (USD/BRL/EUR).
 *   - Empty -> shape vazio + roi null.
 *   - Storage falha -> graceful (sem throw).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getDashboardAllTimeAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({ storage: storageMock }));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getDashboardAllTimeSummary } from '../../server/services/dashboardAllTime';

describe('getDashboardAllTimeSummary', () => {
  beforeEach(() => {
    storageMock.getDashboardAllTimeAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
  });

  it('rows vazias -> shape zero + roi null', async () => {
    storageMock.getDashboardAllTimeAggregate.mockResolvedValue([]);
    const out = await getDashboardAllTimeSummary('USER-0001');
    expect(out).toEqual({
      tournaments: 0,
      profit: 0,
      invested: 0,
      roi: null,
      itm: 0,
      finalTables: 0,
      wins: 0,
    });
  });

  it('agrega multi-site multi-currency com FX (USD + BRL)', async () => {
    storageMock.getDashboardAllTimeAggregate.mockResolvedValue([
      {
        site: 'PokerStars', // USD
        count: 80,
        investedNative: '1500',
        profitNative: '320',
        itmCount: 22,
        finalTablesCount: 6,
        winsCount: 1,
      },
      {
        site: 'Suprema', // BRL
        count: 44,
        investedNative: '1000', // 200 USD
        profitNative: '250', // 50 USD
        itmCount: 12,
        finalTablesCount: 2,
        winsCount: 0,
      },
    ]);
    const out = await getDashboardAllTimeSummary('USER-0001');
    expect(out.tournaments).toBe(124);
    expect(out.invested).toBeCloseTo(1700, 2);
    expect(out.profit).toBeCloseTo(370, 2);
    expect(out.roi).toBeCloseTo((370 / 1700) * 100, 1);
    expect(out.itm).toBe(34);
    expect(out.finalTables).toBe(8);
    expect(out.wins).toBe(1);
  });

  it('roi null quando invested = 0', async () => {
    storageMock.getDashboardAllTimeAggregate.mockResolvedValue([
      {
        site: 'PokerStars',
        count: 2,
        investedNative: '0',
        profitNative: '0',
        itmCount: 0,
        finalTablesCount: 0,
        winsCount: 0,
      },
    ]);
    const out = await getDashboardAllTimeSummary('USER-0001');
    expect(out.tournaments).toBe(2);
    expect(out.invested).toBe(0);
    expect(out.roi).toBeNull();
  });

  it('storage falha -> shape vazio sem throw', async () => {
    storageMock.getDashboardAllTimeAggregate.mockRejectedValue(new Error('db down'));
    const out = await getDashboardAllTimeSummary('USER-0001');
    expect(out.tournaments).toBe(0);
    expect(out.profit).toBe(0);
    expect(out.roi).toBeNull();
  });
});
