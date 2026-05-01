/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-7: GET /api/dashboard/roi-by-platform
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRoiByPlatformMock = vi.fn();
vi.mock('../../../server/services/dashboardService', () => ({
  dashboardService: {
    getRoiByPlatform: (...args: any[]) => getRoiByPlatformMock(...args),
  },
}));

import { handleGetDashboardRoiByPlatform } from '../../../server/routes/dashboard';

beforeEach(() => {
  vi.clearAllMocks();
  getRoiByPlatformMock.mockResolvedValue({
    period: '30d',
    generatedAt: new Date().toISOString(),
    platforms: [],
  });
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

describe('GET /api/dashboard/roi-by-platform — RF-7', () => {
  it('happy path: 200 com payload {period, platforms, generatedAt}', async () => {
    getRoiByPlatformMock.mockResolvedValue({
      period: '30d',
      generatedAt: '2026-05-01T10:00:00Z',
      platforms: [
        { site: 'GGNetwork', sessionsCount: 5, tournamentsCount: 20, investedUSD: 500, profitUSD: 50, roiPct: 10 },
      ],
    });
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.platforms).toBeDefined();
    expect(res.body.period).toBe('30d');
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('aceita period=7d', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq({ query: { period: '7d' } }) as any, res);
    expect(res.statusCode).toBe(200);
    const opts = getRoiByPlatformMock.mock.calls[0][1] ?? {};
    expect(opts.period).toBe('7d');
  });

  it('aceita period=all', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq({ query: { period: 'all' } }) as any, res);
    expect(res.statusCode).toBe(200);
  });

  it('period invalido -> 400', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq({ query: { period: '1y' } }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('limit > 50 -> 400', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq({ query: { limit: '999' } }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('default period=30d, limit=10', async () => {
    const res = makeRes();
    await handleGetDashboardRoiByPlatform(makeReq() as any, res);
    const opts = getRoiByPlatformMock.mock.calls[0][1] ?? {};
    expect(opts.period ?? '30d').toBe('30d');
    expect(opts.limit ?? 10).toBe(10);
  });
});
