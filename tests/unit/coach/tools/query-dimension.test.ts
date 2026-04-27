import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Coach-2A / RF-03 Tool 1 — query_dimension
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/queryDimension.ts
//
// Exporta `queryDimensionTool: CoachTool<I, O>` com:
//   - inputSchema Zod (dimension/groupBy/filters/period)
//   - handler que roteia para storage.getAnalyticsBy{Site|Category|Speed|...}
//   - output: { dimension, groupBy, rows, totalCount, period, note? }
//
// Spec RF-03 Tool 1.
// =============================================================================

const storageMock: any = {
  getAnalyticsBySite: vi.fn(),
  getAnalyticsByCategory: vi.fn(),
  getAnalyticsBySpeed: vi.fn(),
  getAnalyticsByBuyinRange: vi.fn(),
  getAnalyticsByDayOfWeek: vi.fn(),
  getAnalyticsByMonth: vi.fn(),
  getAnalyticsByField: vi.fn(),
  getDashboardStats: vi.fn(),
};

vi.mock('../../../../server/storage', () => ({
  storage: storageMock,
}));

import { queryDimensionTool } from '../../../../server/coachTools/handlers/queryDimension';

const ctx = { userId: 'USER-0001', chatSessionId: 'sess', messageId: 'm1' } as any;

beforeEach(() => {
  Object.values(storageMock).forEach((fn: any) => fn.mockReset?.());
});

describe('queryDimensionTool — input schema', () => {
  it('valida dimension enum', () => {
    const r = queryDimensionTool.inputSchema.safeParse({ dimension: 'unknown' });
    expect(r.success).toBe(false);
  });

  it('aceita period com default "all" quando ausente', () => {
    const r = queryDimensionTool.inputSchema.safeParse({ dimension: 'roi' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).period).toBe('all');
    }
  });
});

describe('queryDimensionTool — handler routing', () => {
  it('groupBy="site" -> chama storage.getAnalyticsBySite', async () => {
    storageMock.getAnalyticsBySite.mockResolvedValue([
      { site: 'PokerStars', roi: 8.2, count: 142 },
    ]);
    const out: any = await queryDimensionTool.handler(
      { dimension: 'roi', groupBy: 'site', period: '30d' } as any,
      ctx,
    );
    expect(storageMock.getAnalyticsBySite).toHaveBeenCalledWith(
      'USER-0001',
      expect.any(String),
      expect.anything(),
    );
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('groupBy ausente -> agrega via storage.getDashboardStats', async () => {
    storageMock.getDashboardStats.mockResolvedValue({
      roi: 5.4,
      profit: '120',
      totalTournaments: 200,
    });
    const out: any = await queryDimensionTool.handler(
      { dimension: 'roi', period: 'all' } as any,
      ctx,
    );
    expect(storageMock.getDashboardStats).toHaveBeenCalled();
    expect(out.dimension).toBe('roi');
  });
});

describe('queryDimensionTool — output shape', () => {
  it('retorna rows + totalCount + period', async () => {
    storageMock.getAnalyticsBySite.mockResolvedValue([
      { site: 'PokerStars', roi: 8.2, count: 142 },
      { site: 'GGPoker', roi: 3.1, count: 89 },
    ]);
    const out: any = await queryDimensionTool.handler(
      { dimension: 'roi', groupBy: 'site', period: '30d' } as any,
      ctx,
    );
    expect(out.dimension).toBe('roi');
    expect(out.groupBy).toBe('site');
    expect(out.period).toBe('30d');
    expect(out.totalCount).toBeGreaterThan(0);
    expect(Array.isArray(out.rows)).toBe(true);
    // cada row tem key + value + count
    expect(out.rows[0]).toHaveProperty('key');
    expect(out.rows[0]).toHaveProperty('value');
    expect(out.rows[0]).toHaveProperty('count');
  });
});

describe('queryDimensionTool — edge cases', () => {
  it('zero data -> rows: [] + totalCount: 0 + note "sem dados suficientes"', async () => {
    storageMock.getAnalyticsBySite.mockResolvedValue([]);
    const out: any = await queryDimensionTool.handler(
      { dimension: 'roi', groupBy: 'site', period: '30d' } as any,
      ctx,
    );
    expect(out.rows).toEqual([]);
    expect(out.totalCount).toBe(0);
    expect(out.note).toMatch(/sem dados suficientes/i);
  });
});
