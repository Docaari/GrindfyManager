/**
 * Test — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md item 7 (Grafico evolucao all-time).
 *
 * Cobre orchestrator getHomeEvolutionAllTime:
 *   - Agrupa dados de tournaments (CLAUDE.md §6.1) por mes UTC + site,
 *     aplica FX por site -> USD por mes, gera serie continua mensal
 *     (preenche meses sem volume) entre primeiro mes com dados e mes
 *     corrente.
 *   - cumulativeProfitUsd cresce mes a mes.
 *   - Vazio -> serie vazia.
 *   - Storage falha -> serie vazia sem throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getDashboardAllTimeMonthlyAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({ storage: storageMock }));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getHomeEvolutionAllTime } from '../../server/services/dashboardAllTime';

describe('getHomeEvolutionAllTime', () => {
  beforeEach(() => {
    storageMock.getDashboardAllTimeMonthlyAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
  });

  it('rows vazias -> months vazio + total 0', async () => {
    storageMock.getDashboardAllTimeMonthlyAggregate.mockResolvedValue([]);
    const out = await getHomeEvolutionAllTime('USER-0001');
    expect(out.months).toEqual([]);
    expect(out.totalProfitUsd).toBe(0);
  });

  it('serie continua entre primeiro mes e mes corrente, FX agregado', async () => {
    // Jan/2026: PokerStars +60 USD + Suprema +250 BRL (=50 USD) = +110 USD.
    // Mar/2026: PokerStars -20 USD = -20 USD (cumulative 90).
    // Mai/2026: Suprema +1000 BRL = +200 USD (cumulative 290).
    // Fev/2026 e Abr/2026 sem volume: profit=0, cumulative herda anterior.
    storageMock.getDashboardAllTimeMonthlyAggregate.mockResolvedValue([
      { month: '2026-01', site: 'PokerStars', count: 3, investedNative: '300', profitNative: '60' },
      { month: '2026-01', site: 'Suprema', count: 2, investedNative: '500', profitNative: '250' },
      { month: '2026-03', site: 'PokerStars', count: 1, investedNative: '100', profitNative: '-20' },
      { month: '2026-05', site: 'Suprema', count: 4, investedNative: '2000', profitNative: '1000' },
    ]);
    const out = await getHomeEvolutionAllTime('USER-0001');
    expect(out.months).toHaveLength(5);
    expect(out.months.map((m) => m.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
    ]);

    const jan = out.months.find((m) => m.month === '2026-01')!;
    expect(jan.profitUsd).toBeCloseTo(110, 2);
    expect(jan.cumulativeProfitUsd).toBeCloseTo(110, 2);
    expect(jan.count).toBe(5);

    const fev = out.months.find((m) => m.month === '2026-02')!;
    expect(fev.profitUsd).toBe(0);
    expect(fev.cumulativeProfitUsd).toBeCloseTo(110, 2);
    expect(fev.count).toBe(0);

    const mar = out.months.find((m) => m.month === '2026-03')!;
    expect(mar.profitUsd).toBeCloseTo(-20, 2);
    expect(mar.cumulativeProfitUsd).toBeCloseTo(90, 2);

    const mai = out.months.find((m) => m.month === '2026-05')!;
    expect(mai.profitUsd).toBeCloseTo(200, 2);
    expect(mai.cumulativeProfitUsd).toBeCloseTo(290, 2);

    expect(out.totalProfitUsd).toBeCloseTo(290, 2);
  });

  it('storage falha -> serie vazia sem throw', async () => {
    storageMock.getDashboardAllTimeMonthlyAggregate.mockRejectedValue(new Error('db down'));
    const out = await getHomeEvolutionAllTime('USER-0001');
    expect(out.months).toEqual([]);
    expect(out.totalProfitUsd).toBe(0);
  });
});
