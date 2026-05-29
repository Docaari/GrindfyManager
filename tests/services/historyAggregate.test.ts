// =============================================================================
// VR-CALC-2 — historyAggregate service (import do histórico CSV por período)
//
// Mock db.execute + drizzle-orm sql (lesson #36/#37). Valida mapeamento
// rows -> AggGroup shape, lowSample, empty e error path.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('../../server/db', () => ({ db: { execute: mockExecute } }));
// sql tagged-template: passthrough (db.execute mock ignora o conteúdo).
vi.mock('drizzle-orm', () => ({ sql: (..._args: any[]) => ({}) }));

import { buildHistoryAggregate } from '../../server/services/historyAggregate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildHistoryAggregate (VR-CALC-2)', () => {
  it('mapeia rows do histórico para AggGroup shape', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { tier: 'high', type: 'PKO', count: 48, avg_buy_in: 215, avg_field: 1800.4, roi_adjusted: 0.09 },
        { tier: 'mid', type: 'Vanilla', count: 96, avg_buy_in: 55.2, avg_field: 800, roi_adjusted: 0.13 },
      ],
    });

    const out = await buildHistoryAggregate({
      userId: 'USER-1', from: '2026-02-28', to: '2026-05-29', weeks: 12,
    });

    expect(out.groups).toHaveLength(2);
    const g0 = out.groups[0];
    expect(g0.name).toBe('High PKO');
    expect(g0.buyIn).toBe(215);
    expect(g0.field).toBe(1800); // round
    expect(g0.roi).toBeCloseTo(0.09, 5);
    expect(g0.count).toBe(48);
    expect(g0.isPKO).toBe(true);
    expect(g0.source).toBe('historical');
    expect(g0.lowSample).toBe(false);
    expect(out.meta.from).toBe('2026-02-28');
    expect(out.meta.to).toBe('2026-05-29');
    expect(out.meta.weeks).toBe(12);
  });

  it('marca lowSample quando count < 20', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { tier: 'low', type: 'Vanilla', count: 12, avg_buy_in: 33, avg_field: 500, roi_adjusted: 0.2 },
      ],
    });
    const out = await buildHistoryAggregate({ userId: 'U', from: '2026-05-01', to: '2026-05-29' });
    expect(out.groups[0].lowSample).toBe(true);
  });

  it('field tem floor 2 mesmo com avg_field pequeno', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { tier: 'entry', type: 'Vanilla', count: 5, avg_buy_in: 11, avg_field: 1, roi_adjusted: 0 },
      ],
    });
    const out = await buildHistoryAggregate({ userId: 'U', from: '2026-05-01', to: '2026-05-29' });
    expect(out.groups[0].field).toBe(2);
  });

  it('retorna vazio quando não há rows', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const out = await buildHistoryAggregate({ userId: 'U', from: '2026-05-01', to: '2026-05-29' });
    expect(out.groups).toEqual([]);
    expect(out.meta.tournamentsPerWeek).toBe(0);
  });

  it('retorna vazio (graceful) quando a query falha', async () => {
    mockExecute.mockRejectedValueOnce(new Error('db down'));
    const out = await buildHistoryAggregate({ userId: 'U', from: '2026-05-01', to: '2026-05-29' });
    expect(out.groups).toEqual([]);
  });
});
