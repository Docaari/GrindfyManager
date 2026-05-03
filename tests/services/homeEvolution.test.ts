/**
 * Test — Sprint home-reform-4 item 10.
 *
 * Cobre orchestrator getHomeEvolution:
 *   - parseMonthIso valida YYYY-MM.
 *   - Mes vazio -> serie continua com profit=0/cumulative=0 dia a dia.
 *   - Mes com volume multi-site multi-currency -> FX→USD + cumulative
 *     correto.
 *   - endDate clampa em hoje quando mes corrente; mes passado cobre
 *     completo.
 *   - Storage falha -> graceful (count=0 days totalProfit=0, mas serie
 *     ainda cobre dias do mes).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getDashboardDailyAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({ storage: storageMock }));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getHomeEvolution, parseMonthIso } from '../../server/services/homeEvolution';

describe('parseMonthIso', () => {
  it('aceita YYYY-MM valido', () => {
    const out = parseMonthIso('2026-05');
    expect(out).not.toBeNull();
    expect(out!.monthStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(out!.monthEnd.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rejeita format invalido', () => {
    expect(parseMonthIso('2026/05')).toBeNull();
    expect(parseMonthIso('05-2026')).toBeNull();
    expect(parseMonthIso('2026-13')).toBeNull();
    expect(parseMonthIso('')).toBeNull();
    expect(parseMonthIso(null)).toBeNull();
  });
});

describe('getHomeEvolution', () => {
  beforeEach(() => {
    storageMock.getDashboardDailyAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
    vi.useFakeTimers();
    // Freeze "now" em 2026-05-15 (mes corrente cenario padrao).
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
  });

  it('mes corrente sem volume -> serie continua dia 1 ate hoje, profit=0', async () => {
    storageMock.getDashboardDailyAggregate.mockResolvedValue([]);
    const out = await getHomeEvolution('USER-0001', '2026-05');
    expect(out.monthStart).toBe('2026-05-01');
    expect(out.endDate).toBe('2026-05-15');
    expect(out.days).toHaveLength(15);
    expect(out.days[0].date).toBe('2026-05-01');
    expect(out.days[14].date).toBe('2026-05-15');
    expect(out.totalProfitUsd).toBe(0);
    expect(out.days.every((d) => d.profitUsd === 0 && d.cumulativeProfitUsd === 0)).toBe(true);
  });

  it('mes com volume multi-site -> FX→USD + cumulative crescente', async () => {
    // Dia 02: PokerStars +60 USD, Suprema +250 BRL = +50 USD => +110 USD.
    // Dia 05: PokerStars -20 USD => cumulative 90.
    // Dia 10: Suprema +1000 BRL = +200 USD => cumulative 290.
    storageMock.getDashboardDailyAggregate.mockResolvedValue([
      { date: '2026-05-02', site: 'PokerStars', count: 3, investedNative: '300', profitNative: '60' },
      { date: '2026-05-02', site: 'Suprema', count: 2, investedNative: '500', profitNative: '250' },
      { date: '2026-05-05', site: 'PokerStars', count: 1, investedNative: '100', profitNative: '-20' },
      { date: '2026-05-10', site: 'Suprema', count: 4, investedNative: '2000', profitNative: '1000' },
    ]);
    const out = await getHomeEvolution('USER-0001', '2026-05');
    expect(out.days).toHaveLength(15);

    const day02 = out.days.find((d) => d.date === '2026-05-02')!;
    expect(day02.profitUsd).toBeCloseTo(110, 2);
    expect(day02.cumulativeProfitUsd).toBeCloseTo(110, 2);
    expect(day02.count).toBe(5);

    const day05 = out.days.find((d) => d.date === '2026-05-05')!;
    expect(day05.profitUsd).toBeCloseTo(-20, 2);
    expect(day05.cumulativeProfitUsd).toBeCloseTo(90, 2);

    const day10 = out.days.find((d) => d.date === '2026-05-10')!;
    expect(day10.profitUsd).toBeCloseTo(200, 2);
    expect(day10.cumulativeProfitUsd).toBeCloseTo(290, 2);

    // Dia sem volume herda cumulativo do dia anterior.
    const day06 = out.days.find((d) => d.date === '2026-05-06')!;
    expect(day06.profitUsd).toBe(0);
    expect(day06.cumulativeProfitUsd).toBeCloseTo(90, 2);

    expect(out.totalProfitUsd).toBeCloseTo(290, 2);
  });

  it('mes passado cobre mes inteiro mesmo com hoje no mes seguinte', async () => {
    storageMock.getDashboardDailyAggregate.mockResolvedValue([]);
    const out = await getHomeEvolution('USER-0001', '2026-04');
    expect(out.monthStart).toBe('2026-04-01');
    expect(out.endDate).toBe('2026-04-30');
    expect(out.days).toHaveLength(30);
  });

  it('mes futuro -> serie vazia', async () => {
    storageMock.getDashboardDailyAggregate.mockResolvedValue([]);
    const out = await getHomeEvolution('USER-0001', '2026-06');
    expect(out.days).toHaveLength(0);
    expect(out.totalProfitUsd).toBe(0);
  });

  it('storage falha -> serie continua zerada sem throw', async () => {
    storageMock.getDashboardDailyAggregate.mockRejectedValue(new Error('db down'));
    const out = await getHomeEvolution('USER-0001', '2026-05');
    expect(out.days).toHaveLength(15);
    expect(out.totalProfitUsd).toBe(0);
  });

  it('default = mes corrente quando monthIso null', async () => {
    storageMock.getDashboardDailyAggregate.mockResolvedValue([]);
    const out = await getHomeEvolution('USER-0001', null);
    expect(out.monthStart).toBe('2026-05-01');
    expect(out.endDate).toBe('2026-05-15');
  });
});
