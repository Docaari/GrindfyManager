import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 Frontend UX / RF-14 — GET /api/admin/coach/cost-metrics
//
// Handler: handleGetCostMetrics em server/routes/coach.ts
//
// Response shape:
//   {
//     period: { from: string; to: string; days: number },
//     totalMessages: number,
//     totalCost: number,
//     avgCostPerMessage: number,
//     cacheHitRate: number,           // 0..1
//     byCoachType: {
//       mental: { messages, cost, cacheHitRate },
//       tournament: { ... },
//       technical: { ... }
//     },
//     byModel: Record<string, { messages, cost }>,
//     byDay: Array<{ date, messages, cost, cacheHitRate }>
//   }
//
// Spec: Docs/specs/coach-sprint-1-frontend-ux.md (RF-14)
// =============================================================================

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  desc: vi.fn((...a: any[]) => ({ type: 'desc', a })),
  asc: vi.fn((...a: any[]) => ({ type: 'asc', a })),
  gte: vi.fn((...a: any[]) => ({ type: 'gte', a })),
  ne: vi.fn((...a: any[]) => ({ type: 'ne', a })),
  sql: Object.assign(vi.fn((...a: any[]) => ({ type: 'sql', a })), {
    raw: vi.fn(),
  }),
}));

vi.mock('@shared/schema', () => ({
  users: {}, chatSessions: {}, chatMessages: {}, messageFeedback: {},
  userAiProfile: {}, monthlyCoachSummaries: {},
}));

function makeReq(overrides: any = {}) {
  return {
    user: {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      email: 'admin@grindfyapp.com',
      role: 'admin',
      subscriptionPlan: 'admin',
    },
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

const storage: any = {
  getCostMetrics: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================

describe('GET /api/admin/coach/cost-metrics', () => {
  it('403 quando usuario nao e admin', async () => {
    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = makeReq({
      user: { id: 'u-2', userPlatformId: 'USER-0002', role: 'user', subscriptionPlan: 'pro' },
    });
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(403);
  });

  it('401 quando nao autenticado', async () => {
    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = { user: null, query: {}, params: {}, body: {} } as any;
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(401);
  });

  it('200 retorna shape correto para admin com dias default=7', async () => {
    storage.getCostMetrics.mockResolvedValue({
      totalMessages: 10,
      totalCost: 0.5,
      cacheHitRate: 0.6,
      byCoachType: {
        mental: { messages: 5, cost: 0.2, cacheHitRate: 0.7 },
        tournament: { messages: 3, cost: 0.2, cacheHitRate: 0.5 },
        technical: { messages: 2, cost: 0.1, cacheHitRate: 0.6 },
      },
      byModel: {
        'claude-sonnet-4-6': { messages: 8, cost: 0.4 },
        'claude-haiku-4-5-20251001': { messages: 2, cost: 0.1 },
      },
      byDay: [
        { date: '2026-04-18', messages: 5, cost: 0.25, cacheHitRate: 0.6 },
        { date: '2026-04-19', messages: 5, cost: 0.25, cacheHitRate: 0.6 },
      ],
    });

    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = makeReq();
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.totalMessages).toBe(10);
    expect(res.body.totalCost).toBeCloseTo(0.5, 2);
    expect(res.body.avgCostPerMessage).toBeCloseTo(0.05, 4);
    expect(res.body.cacheHitRate).toBeCloseTo(0.6, 2);
    expect(res.body.byCoachType).toBeDefined();
    expect(res.body.byCoachType.mental).toBeDefined();
    expect(res.body.byCoachType.mental.messages).toBe(5);
    expect(res.body.byCoachType.tournament).toBeDefined();
    expect(res.body.byCoachType.technical).toBeDefined();
    expect(res.body.byDay).toHaveLength(2);
    expect(res.body.byModel).toBeDefined();
    expect(res.body.period).toBeDefined();
    expect(res.body.period.days).toBe(7);

    // Storage chamado com days=7 (default)
    expect(storage.getCostMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ days: 7 }),
    );
  });

  it('400 quando days fora de [1, 90]', async () => {
    const { handleGetCostMetrics } = await import('../../../server/routes/coach');

    // days=0
    let req = makeReq({ query: { days: '0' } });
    let res = makeRes();
    await handleGetCostMetrics(req, res, storage);
    expect(res.statusCode).toBe(400);

    // days=100 (acima do max)
    req = makeReq({ query: { days: '100' } });
    res = makeRes();
    await handleGetCostMetrics(req, res, storage);
    expect(res.statusCode).toBe(400);

    // days=-5
    req = makeReq({ query: { days: '-5' } });
    res = makeRes();
    await handleGetCostMetrics(req, res, storage);
    expect(res.statusCode).toBe(400);
  });

  it('aceita days customizado dentro do range [1, 90]', async () => {
    storage.getCostMetrics.mockResolvedValue({
      totalMessages: 0,
      totalCost: 0,
      cacheHitRate: 0,
      byCoachType: {
        mental: { messages: 0, cost: 0, cacheHitRate: 0 },
        tournament: { messages: 0, cost: 0, cacheHitRate: 0 },
        technical: { messages: 0, cost: 0, cacheHitRate: 0 },
      },
      byModel: {},
      byDay: [],
    });

    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = makeReq({ query: { days: '30' } });
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.getCostMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ days: 30 }),
    );
    expect(res.body.period.days).toBe(30);
  });

  it('periodo sem mensagens retorna zeros (nao 500, nao NaN)', async () => {
    storage.getCostMetrics.mockResolvedValue({
      totalMessages: 0,
      totalCost: 0,
      cacheHitRate: 0,
      byCoachType: {
        mental: { messages: 0, cost: 0, cacheHitRate: 0 },
        tournament: { messages: 0, cost: 0, cacheHitRate: 0 },
        technical: { messages: 0, cost: 0, cacheHitRate: 0 },
      },
      byModel: {},
      byDay: [],
    });

    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = makeReq({ query: { days: '7' } });
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.totalMessages).toBe(0);
    expect(res.body.totalCost).toBe(0);
    expect(res.body.avgCostPerMessage).toBe(0);
    expect(res.body.cacheHitRate).toBe(0);
    // NaN check
    expect(Number.isNaN(res.body.avgCostPerMessage)).toBe(false);
  });

  it('admin via subscriptionPlan tambem passa', async () => {
    storage.getCostMetrics.mockResolvedValue({
      totalMessages: 0, totalCost: 0, cacheHitRate: 0,
      byCoachType: {
        mental: { messages: 0, cost: 0, cacheHitRate: 0 },
        tournament: { messages: 0, cost: 0, cacheHitRate: 0 },
        technical: { messages: 0, cost: 0, cacheHitRate: 0 },
      },
      byModel: {}, byDay: [],
    });

    const { handleGetCostMetrics } = await import('../../../server/routes/coach');
    const req = makeReq({
      user: { id: 'u', userPlatformId: 'USER-0001', role: 'user', subscriptionPlan: 'admin' },
    });
    const res = makeRes();
    await handleGetCostMetrics(req, res, storage);

    expect(res.statusCode).toBe(200);
  });
});
