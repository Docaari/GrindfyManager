/**
 * Test — Sprint home-reform-4 item 5.
 *
 * Spec: Docs/specs/home-reform-4.md item 5 (Grade do dia chips A|B|C).
 *
 * Cobre orchestrator getGradeTodaySummary:
 *   - Filtra por dayOfWeek + profile.
 *   - Soma count + buy-in nativo convertido para USD multi-site.
 *   - ABI = totalUsd / count, null quando count=0.
 *   - Storage falha -> shape vazio sem throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getGradeTodayAggregate: vi.fn(), getDayPlanBoundaries: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getGradeTodaySummary } from '../../server/services/gradeToday';

describe('getGradeTodaySummary', () => {
  beforeEach(() => {
    storageMock.getGradeTodayAggregate.mockReset();
    storageMock.getDayPlanBoundaries.mockReset();
    storageMock.getDayPlanBoundaries.mockResolvedValue(null);
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
  });

  it('rows vazias -> count 0, totals 0, abi null', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([]);
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.count).toBe(0);
    expect(out.totalInvestmentUsd).toBe(0);
    expect(out.abi).toBeNull();
    expect(out.profile).toBe('A');
    expect(out.date).toBe('2026-05-03');
  });

  it('agrega multi-site com FX (USD + BRL) e calcula ABI', async () => {
    // PokerStars=USD: 4 torneios, buy-in total 200 USD -> 200 USD
    // Suprema=BRL: 2 torneios, buy-in total 500 BRL = 100 USD (rate 5)
    // total: 6 torneios, 300 USD investido, ABI = 50 USD
    storageMock.getGradeTodayAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 4, investedNative: '200' },
      { site: 'Suprema', count: 2, investedNative: '500' },
    ]);
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'B' });
    expect(out.count).toBe(6);
    expect(out.totalInvestmentUsd).toBeCloseTo(300, 2);
    expect(out.abi).toBeCloseTo(50, 2);
    expect(out.profile).toBe('B');
  });

  it('storage chamado com dayOfWeek + profile', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([]);
    await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 3, profile: 'C' });
    expect(storageMock.getGradeTodayAggregate).toHaveBeenCalledWith('USER-0001', { dayOfWeek: 3, profile: 'C' });
  });

  it('storage falha -> shape vazio sem throw', async () => {
    storageMock.getGradeTodayAggregate.mockRejectedValue(new Error('db down'));
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.count).toBe(0);
    expect(out.totalInvestmentUsd).toBe(0);
    expect(out.abi).toBeNull();
  });

  it('count > 0 com invested 0 -> abi 0 (nao null)', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 2, investedNative: '0' },
    ]);
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.count).toBe(2);
    expect(out.totalInvestmentUsd).toBe(0);
    expect(out.abi).toBe(0);
  });

  // ===========================================================================
  // Sprint home-reform-5 item 5 — firstEntry / lastEntry
  // ===========================================================================
  it('boundaries: storage retorna { first, last } -> service expoe firstEntry + lastEntry', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 3, investedNative: '90' },
    ]);
    storageMock.getDayPlanBoundaries.mockResolvedValue({
      first: { time: '14:00', name: 'Mystery Mini' },
      last: { time: '20:30', name: 'Sunday Storm' },
    });
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.firstEntry).toEqual({ time: '14:00', name: 'Mystery Mini' });
    expect(out.lastEntry).toEqual({ time: '20:30', name: 'Sunday Storm' });
  });

  it('boundaries: storage retorna null -> firstEntry e lastEntry null', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([]);
    storageMock.getDayPlanBoundaries.mockResolvedValue(null);
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.firstEntry).toBeNull();
    expect(out.lastEntry).toBeNull();
  });

  it('boundaries: storage falha -> firstEntry/lastEntry null sem throw', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([
      { site: 'PokerStars', count: 1, investedNative: '10' },
    ]);
    storageMock.getDayPlanBoundaries.mockRejectedValue(new Error('db down'));
    const out = await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 0, profile: 'A' });
    expect(out.count).toBe(1);
    expect(out.firstEntry).toBeNull();
    expect(out.lastEntry).toBeNull();
  });

  it('boundaries: storage chamado com [profile] como profileIds', async () => {
    storageMock.getGradeTodayAggregate.mockResolvedValue([]);
    storageMock.getDayPlanBoundaries.mockResolvedValue(null);
    await getGradeTodaySummary('USER-0001', { date: '2026-05-03', dayOfWeek: 4, profile: 'C' });
    expect(storageMock.getDayPlanBoundaries).toHaveBeenCalledWith('USER-0001', 4, ['C']);
  });
});
