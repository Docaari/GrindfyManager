/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Routes Study Weekly Plan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.7 (endpoints)
 *        - GET   /api/study-weekly-plan?week=YYYY-MM-DD
 *        - POST  /api/study-weekly-plan/regenerate
 *        - PATCH /api/study-weekly-plan/items/:itemId/toggle
 * ADRs : 132 (schema), 134 (service orquestrador)
 *
 * Cobertura:
 *   - 401 auth, 403 NO_COACH_ACCESS, 429 quota / rate limit
 *   - GET retorna plano corrente quando ?week ausente
 *   - GET retorna plano da semana especifica com completedItemsJsonb
 *   - GET retorna 404 quando ?week valido mas sem plano
 *   - POST regenerate happy + body.resetCompleted=true reseta completed_items
 *   - POST regenerate 429 quando 1/dia rate limit excedido
 *   - PATCH toggle adiciona/remove itemId race-safe
 *   - PATCH 404 quando itemId nao existe no plano corrente
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *   #5  vi.fn ok
 *
 * Status RED: server/routes/study-weekly-plan.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getStudyWeeklyPlanMock,
  upsertStudyWeeklyPlanMock,
  markPlanItemCompletedMock,
  generateWeeklyStudyPlanMock,
  hasCoachAccessMock,
  isRegenerateRateLimitedMock,
  recordRegenerateMock,
} = vi.hoisted(() => ({
  getStudyWeeklyPlanMock: vi.fn(),
  upsertStudyWeeklyPlanMock: vi.fn(),
  markPlanItemCompletedMock: vi.fn(),
  generateWeeklyStudyPlanMock: vi.fn(),
  hasCoachAccessMock: vi.fn(),
  isRegenerateRateLimitedMock: vi.fn(),
  recordRegenerateMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getStudyWeeklyPlan: getStudyWeeklyPlanMock,
    upsertStudyWeeklyPlan: upsertStudyWeeklyPlanMock,
    markPlanItemCompleted: markPlanItemCompletedMock,
  },
}));

vi.mock('../../server/services/studyWeeklyPlanService', () => ({
  generateWeeklyStudyPlan: generateWeeklyStudyPlanMock,
  hasCoachAccess: hasCoachAccessMock,
  isRegenerateRateLimited: isRegenerateRateLimitedMock,
  recordRegenerate: recordRegenerateMock,
}));

function makeReqRes(opts: { userId?: string | null; body?: any; query?: any; params?: any }) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
    query: opts.query ?? {},
    params: opts.params ?? {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

async function loadRoute() {
  return await import('../../server/routes/study-weekly-plan');
}

beforeEach(() => {
  vi.clearAllMocks();
  hasCoachAccessMock.mockResolvedValue(true);
  isRegenerateRateLimitedMock.mockResolvedValue(false);
});

// =============================================================================
// GET /api/study-weekly-plan
// =============================================================================
describe('GET /api/study-weekly-plan — Auth + happy', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handleGetStudyWeeklyPlan;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('200 retorna plano da semana corrente quando ?week ausente', async () => {
    getStudyWeeklyPlanMock.mockResolvedValue({
      id: 'swp-1',
      userId: 'USER-0001',
      weekStartDate: new Date('2026-05-04'),
      planJsonb: { days: [] },
      completedItemsJsonb: [],
      source: 'coach_auto',
      dailyTargetMinutes: 45,
      generatedAt: new Date('2026-05-04T09:00:00Z'),
    });

    const route: any = await loadRoute();
    const handler = route.handleGetStudyWeeklyPlan;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ source: 'coach_auto', dailyTargetMinutes: 45 });
  });

  it('200 retorna plano da semana especifica via ?week=YYYY-MM-DD', async () => {
    getStudyWeeklyPlanMock.mockResolvedValue({
      id: 'swp-old',
      userId: 'USER-0001',
      weekStartDate: new Date('2026-04-27'),
      planJsonb: { days: [] },
      completedItemsJsonb: ['x'],
    });

    const route: any = await loadRoute();
    const handler = route.handleGetStudyWeeklyPlan;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      query: { week: '2026-04-27' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it('404 quando plano nao existe para semana', async () => {
    getStudyWeeklyPlanMock.mockResolvedValue(null);

    const route: any = await loadRoute();
    const handler = route.handleGetStudyWeeklyPlan;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('400 quando ?week eh invalido (nao YYYY-MM-DD)', async () => {
    const route: any = await loadRoute();
    const handler = route.handleGetStudyWeeklyPlan;
    const { req, res } = makeReqRes({ userId: 'USER-0001', query: { week: 'abc' } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// POST /api/study-weekly-plan/regenerate
// =============================================================================
describe('POST /api/study-weekly-plan/regenerate — RF-3.4', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 NO_COACH_ACCESS quando user nao tem coach access', async () => {
    hasCoachAccessMock.mockResolvedValue(false);

    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({ userId: 'USER-FREE' });
    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('429 quando rate limit 1/dia excedido', async () => {
    isRegenerateRateLimitedMock.mockResolvedValue(true);

    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);

    expect(res.statusCode).toBe(429);
  });

  it('200 happy path retorna novo plano', async () => {
    generateWeeklyStudyPlanMock.mockResolvedValue({
      id: 'swp-1',
      userId: 'USER-0001',
      weekStartDate: new Date('2026-05-04'),
      planJsonb: { days: [{ dayLabel: 'mon', date: '2026-05-04', activities: [] }] },
      completedItemsJsonb: [],
      source: 'coach_manual',
      dailyTargetMinutes: 45,
    });

    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({ userId: 'USER-0001', body: {} });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ source: 'coach_manual' });
    expect(generateWeeklyStudyPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'USER-0001', source: 'coach_manual' }),
    );
  });

  it('passa resetCompleted=true ao service quando body solicita', async () => {
    generateWeeklyStudyPlanMock.mockResolvedValue({
      id: 'swp-1',
      planJsonb: { days: [] },
      completedItemsJsonb: [],
      source: 'coach_manual',
      dailyTargetMinutes: 45,
    });

    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { resetCompleted: true },
    });
    await handler(req, res);

    expect(generateWeeklyStudyPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ resetCompleted: true }),
    );
  });

  it('400 quando body.resetCompleted nao eh boolean', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePostStudyWeeklyPlanRegenerate;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { resetCompleted: 'sim' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// PATCH /api/study-weekly-plan/items/:itemId/toggle
// =============================================================================
describe('PATCH /api/study-weekly-plan/items/:itemId/toggle — RF-3.5', () => {
  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePatchStudyWeeklyPlanItemToggle;
    const { req, res } = makeReqRes({ userId: null, params: { itemId: 'x' } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('200 marca completed=true e retorna plano atualizado', async () => {
    markPlanItemCompletedMock.mockResolvedValue({
      id: 'swp-1',
      userId: 'USER-0001',
      planJsonb: { days: [] },
      completedItemsJsonb: ['item-mon-1'],
    });

    const route: any = await loadRoute();
    const handler = route.handlePatchStudyWeeklyPlanItemToggle;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { itemId: 'item-mon-1' },
      body: { completed: true },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.completedItemsJsonb).toContain('item-mon-1');
  });

  it('200 marca completed=false e remove de completed_items_jsonb', async () => {
    markPlanItemCompletedMock.mockResolvedValue({
      id: 'swp-1',
      userId: 'USER-0001',
      completedItemsJsonb: [],
    });

    const route: any = await loadRoute();
    const handler = route.handlePatchStudyWeeklyPlanItemToggle;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { itemId: 'item-mon-1' },
      body: { completed: false },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.completedItemsJsonb).not.toContain('item-mon-1');
  });

  it('404 quando itemId nao existe no plano corrente', async () => {
    markPlanItemCompletedMock.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'ITEM_NOT_FOUND' }),
    );

    const route: any = await loadRoute();
    const handler = route.handlePatchStudyWeeklyPlanItemToggle;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { itemId: 'item-bogus' },
      body: { completed: true },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('400 quando body.completed nao eh boolean', async () => {
    const route: any = await loadRoute();
    const handler = route.handlePatchStudyWeeklyPlanItemToggle;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { itemId: 'x' },
      body: { completed: 'yes' },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});
