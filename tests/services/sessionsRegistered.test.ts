/**
 * Test — Sprint home-reform-5 item 6.
 *
 * Spec: Docs/specs/home-reform-5.md Item 6 (Sessoes Registradas).
 *
 * Cobre orchestrator getSessionsRegisteredSummary:
 *   - Soma tournaments, profit, invested, itm, finalTables, wins em USD agregando sites multi-currency.
 *   - FX via fxResolver mockado.
 *   - ROI null quando invested=0.
 *   - Empty rows -> count=0 + roi null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fxMock } = vi.hoisted(() => ({
  storageMock: { getSessionsRegisteredAggregate: vi.fn() },
  fxMock: { resolveExchangeRates: vi.fn() },
}));

vi.mock('../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../server/services/fxResolver', () => ({
  fxResolver: fxMock,
  resolveExchangeRates: fxMock.resolveExchangeRates,
}));

import { getSessionsRegisteredSummary } from '../../server/services/sessionsRegistered';

describe('getSessionsRegisteredSummary', () => {
  beforeEach(() => {
    storageMock.getSessionsRegisteredAggregate.mockReset();
    fxMock.resolveExchangeRates.mockReset();
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
  });

  it('rows vazias -> totals zero + roi null', async () => {
    storageMock.getSessionsRegisteredAggregate.mockResolvedValue([]);
    const out = await getSessionsRegisteredSummary('USER-0001');
    expect(out.tournaments).toBe(0);
    expect(out.profit).toBe(0);
    expect(out.invested).toBe(0);
    expect(out.roi).toBeNull();
    expect(out.itm).toBe(0);
    expect(out.finalTables).toBe(0);
    expect(out.wins).toBe(0);
  });

  it('agrega multi-site com FX (USD + BRL)', async () => {
    // PokerStars USD: 5 torneios, invested 100, returns 130 -> profit 30 USD
    // Suprema BRL (rate 5): 3 torneios, invested 500 BRL = 100 USD, returns 750 BRL = 150 USD
    storageMock.getSessionsRegisteredAggregate.mockResolvedValue([
      {
        site: 'PokerStars',
        count: 5,
        investedNative: '100',
        returnsNative: '130',
        itmCount: 2,
        finalTablesCount: 1,
        winsCount: 0,
      },
      {
        site: 'Suprema',
        count: 3,
        investedNative: '500',
        returnsNative: '750',
        itmCount: 2,
        finalTablesCount: 1,
        winsCount: 1,
      },
    ]);
    const out = await getSessionsRegisteredSummary('USER-0001');
    expect(out.tournaments).toBe(8);
    expect(out.invested).toBeCloseTo(200, 2);
    expect(out.profit).toBeCloseTo(80, 2);
    expect(out.roi).toBeCloseTo(40, 1);
    expect(out.itm).toBe(4);
    expect(out.finalTables).toBe(2);
    expect(out.wins).toBe(1);
  });

  it('valida cenario real founder: 124 torneios, profit -255.24 USD, ROI -17.4%', async () => {
    // Cenario PokerStars puro USD para isolar formula. invested 1467.24, returns 1212.00 -> profit -255.24, roi -17.4%.
    storageMock.getSessionsRegisteredAggregate.mockResolvedValue([
      {
        site: 'PokerStars',
        count: 124,
        investedNative: '1467.24',
        returnsNative: '1212.00',
        itmCount: 22,
        finalTablesCount: 5,
        winsCount: 1,
      },
    ]);
    const out = await getSessionsRegisteredSummary('USER-0005');
    expect(out.tournaments).toBe(124);
    expect(out.profit).toBeCloseTo(-255.24, 2);
    expect(out.roi).toBeCloseTo(-17.4, 1);
    expect(out.itm).toBe(22);
    expect(out.finalTables).toBe(5);
    expect(out.wins).toBe(1);
  });

  it('roi null quando invested=0 mesmo com count > 0', async () => {
    storageMock.getSessionsRegisteredAggregate.mockResolvedValue([
      {
        site: 'PokerStars',
        count: 2,
        investedNative: '0',
        returnsNative: '0',
        itmCount: 0,
        finalTablesCount: 0,
        winsCount: 0,
      },
    ]);
    const out = await getSessionsRegisteredSummary('USER-0001');
    expect(out.tournaments).toBe(2);
    expect(out.invested).toBe(0);
    expect(out.roi).toBeNull();
  });

  it('storage falha -> retorna shape vazio sem throw', async () => {
    storageMock.getSessionsRegisteredAggregate.mockRejectedValue(new Error('db down'));
    const out = await getSessionsRegisteredSummary('USER-0001');
    expect(out.tournaments).toBe(0);
    expect(out.profit).toBe(0);
    expect(out.roi).toBeNull();
    expect(out.itm).toBe(0);
    expect(out.finalTables).toBe(0);
    expect(out.wins).toBe(0);
  });

  it('rate ausente -> usa 1 e nao quebra', async () => {
    fxMock.resolveExchangeRates.mockResolvedValue({
      rates: { USD: 1 },
      source: 'fallback',
      resolvedAt: new Date(),
    });
    storageMock.getSessionsRegisteredAggregate.mockResolvedValue([
      {
        site: 'UnknownSite',
        count: 1,
        investedNative: '50',
        returnsNative: '60',
        itmCount: 1,
        finalTablesCount: 0,
        winsCount: 0,
      },
    ]);
    const out = await getSessionsRegisteredSummary('USER-0001');
    expect(out.tournaments).toBe(1);
    expect(out.invested).toBeCloseTo(50, 2);
    expect(out.profit).toBeCloseTo(10, 2);
  });
});
