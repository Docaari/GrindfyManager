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
  storageMock: { getGradeTodayAggregate: vi.fn() },
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
});
