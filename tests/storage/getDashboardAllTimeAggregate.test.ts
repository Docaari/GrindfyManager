/**
 * Test — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md item 7 (Dashboard All Time + KPIs estendidos).
 *
 * Cobre storage:
 *   - getDashboardAllTimeAggregate(userId)
 *     filter: tournaments WHERE grind_session_id IS NULL (CLAUDE.md §6.1)
 *     sem range de data (all-time).
 *     Retorna por site: count, investedNative, profitNative, itmCount,
 *     finalTablesCount, winsCount.
 *   - getDashboardAllTimeMonthlyAggregate(userId)
 *     mesma fonte, agrupa por mes UTC (YYYY-MM) + site.
 *
 * Pattern db chain mock = tests/storage/getDayPlanBoundaries.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.groupBy = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storage.getDashboardAllTimeAggregate(userId)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getDashboardAllTimeAggregate).toBe('function');
  });

  it('rows vazias -> []', async () => {
    (db as any).groupBy = vi.fn().mockResolvedValue([]);
    const out = await (storage as any).getDashboardAllTimeAggregate('USER-0001');
    expect(out).toEqual([]);
  });

  it('agrega multi-site mantendo shape esperado', async () => {
    (db as any).groupBy = vi.fn().mockResolvedValue([
      {
        site: 'PokerStars',
        count: 80,
        investedNative: '1500',
        profitNative: '320',
        itmCount: 22,
        finalTablesCount: 6,
        winsCount: 1,
      },
      {
        site: 'Suprema',
        count: 44,
        investedNative: '900',
        profitNative: '120',
        itmCount: 12,
        finalTablesCount: 2,
        winsCount: 0,
      },
    ]);
    const out = await (storage as any).getDashboardAllTimeAggregate('USER-0001');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      site: 'PokerStars',
      count: 80,
      investedNative: '1500',
      profitNative: '320',
      itmCount: 22,
      finalTablesCount: 6,
      winsCount: 1,
    });
    expect(out[1].site).toBe('Suprema');
    expect(out[1].count).toBe(44);
  });

  it('coerce campos null -> defaults', async () => {
    (db as any).groupBy = vi.fn().mockResolvedValue([
      {
        site: null,
        count: null,
        investedNative: null,
        profitNative: null,
        itmCount: null,
        finalTablesCount: null,
        winsCount: null,
      },
    ]);
    const out = await (storage as any).getDashboardAllTimeAggregate('USER-0001');
    expect(out[0]).toEqual({
      site: '',
      count: 0,
      investedNative: '0',
      profitNative: '0',
      itmCount: 0,
      finalTablesCount: 0,
      winsCount: 0,
    });
  });
});

describe('storage.getDashboardAllTimeMonthlyAggregate(userId)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getDashboardAllTimeMonthlyAggregate).toBe('function');
  });

  it('rows vazias -> []', async () => {
    (db as any).groupBy = vi.fn().mockResolvedValue([]);
    const out = await (storage as any).getDashboardAllTimeMonthlyAggregate('USER-0001');
    expect(out).toEqual([]);
  });

  it('rows multi-mes multi-site mantem shape { month, site, count, invested, profit }', async () => {
    (db as any).groupBy = vi.fn().mockResolvedValue([
      { month: '2024-01', site: 'PokerStars', count: 12, investedNative: '300', profitNative: '40' },
      { month: '2024-01', site: 'Suprema', count: 8, investedNative: '200', profitNative: '-30' },
      { month: '2024-02', site: 'PokerStars', count: 5, investedNative: '120', profitNative: '60' },
    ]);
    const out = await (storage as any).getDashboardAllTimeMonthlyAggregate('USER-0001');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      month: '2024-01',
      site: 'PokerStars',
      count: 12,
      investedNative: '300',
      profitNative: '40',
    });
    expect(out[2].month).toBe('2024-02');
  });
});
