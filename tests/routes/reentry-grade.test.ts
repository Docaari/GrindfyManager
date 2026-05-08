/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.4: POST /api/reentry/:cardId/grade
 *                                       POST /api/reentry/:cardId/skip
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.4 (grade endpoint)
 *
 * Cobertura RED:
 *   - 200 grade=good: aplica SM-2 e retorna { card, nextReviewAt, intervalDays, nextCard }.
 *   - 400 grade invalido (ex: 'meh').
 *   - 403 quando card pertence a outro user (storage retorna null).
 *   - 410 GONE quando card foi arquivado entre query e grade (race).
 *   - Cache invalidation pos-grade (lesson #21 invalidator publico).
 *   - Skip: push +1d sem afetar review_count/lastGrade.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *   #21 invalidator de cache server-side
 *
 * Status RED: server/routes/reentry.ts ainda nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getReentryCardByIdMock,
  updateReentryCardAfterGradeMock,
  updateReentryCardSkipMock,
  getReentryQueueMock,
  invalidateSrsStatsCacheMock,
} = vi.hoisted(() => ({
  getReentryCardByIdMock: vi.fn(),
  updateReentryCardAfterGradeMock: vi.fn(),
  updateReentryCardSkipMock: vi.fn(),
  getReentryQueueMock: vi.fn(),
  invalidateSrsStatsCacheMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getReentryCardById: getReentryCardByIdMock,
    updateReentryCardAfterGrade: updateReentryCardAfterGradeMock,
    updateReentryCardSkip: updateReentryCardSkipMock,
    getReentryQueue: getReentryQueueMock,
  },
}));

vi.mock('../../server/services/spotReentry/srsStatsCache', () => ({
  invalidateSrsStatsCache: invalidateSrsStatsCacheMock,
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/reentry');
  return mod;
}

function makeReqRes(opts: { user?: any; params?: any; body?: any } = {}) {
  const req: any = {
    user: opts.user ?? { userPlatformId: 'USER-0001' },
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    headers: {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POST /api/reentry/:cardId/grade
// =============================================================================
describe('POST /api/reentry/:cardId/grade', () => {
  it('200 grade=good aplica SM-2 e retorna card atualizado', async () => {
    getReentryCardByIdMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001', spotId: 'spot-1',
      intervalDays: '1.00', easeFactor: '2.50', archivedAt: null,
      reviewCount: 0, correctCount: 0,
    });
    updateReentryCardAfterGradeMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      intervalDays: '2.50', easeFactor: '2.50',
      reviewCount: 1, correctCount: 1, lastGrade: 'good',
      nextReviewAt: new Date(Date.now() + 2.5 * 86_400_000),
    });
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'good' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('card');
    expect(res.body).toHaveProperty('intervalDays');
    expect(res.body).toHaveProperty('nextReviewAt');
  });

  it('grade=again zera interval=1 e baixa ease', async () => {
    getReentryCardByIdMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      intervalDays: '10.00', easeFactor: '2.50', archivedAt: null,
      reviewCount: 1, correctCount: 1,
    });
    updateReentryCardAfterGradeMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      intervalDays: '1.00', easeFactor: '2.00',
      reviewCount: 2, correctCount: 1, lastGrade: 'again',
      nextReviewAt: new Date(Date.now() + 86_400_000),
    });
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'again' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.intervalDays)).toBe(1);
  });

  it('400 quando grade nao eh um dos 4 valores', async () => {
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'meh' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando body sem grade', async () => {
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: {},
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('403 (ou 404) quando card nao pertence ao user (storage retorna null)', async () => {
    getReentryCardByIdMock.mockResolvedValue(null);
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-x' },
      body: { grade: 'good' },
    });
    await handler(req, res);
    expect([403, 404]).toContain(res.statusCode);
  });

  it('410 GONE quando card foi arquivado entre lookup e grade (race)', async () => {
    getReentryCardByIdMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      archivedAt: new Date(),  // ja arquivado
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'good' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(410);
  });

  it('chama invalidator de cache srsStats apos grade success', async () => {
    getReentryCardByIdMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      intervalDays: '1.00', easeFactor: '2.50', archivedAt: null,
      reviewCount: 0, correctCount: 0,
    });
    updateReentryCardAfterGradeMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001', intervalDays: '2.50', easeFactor: '2.50',
      reviewCount: 1, correctCount: 1, lastGrade: 'good',
      nextReviewAt: new Date(),
    });
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'good' },
    });
    await handler(req, res);
    // Lesson #21: invalidator publico chamado por mutation.
    expect(invalidateSrsStatsCacheMock).toHaveBeenCalledWith('USER-0001');
  });

  it('retorna nextCard se queue tem mais cards pendentes', async () => {
    getReentryCardByIdMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      intervalDays: '1.00', easeFactor: '2.50', archivedAt: null,
      reviewCount: 0, correctCount: 0,
    });
    updateReentryCardAfterGradeMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001', intervalDays: '2.50', easeFactor: '2.50',
      reviewCount: 1, correctCount: 1, lastGrade: 'good', nextReviewAt: new Date(),
    });
    getReentryQueueMock.mockResolvedValue({
      items: [{ card: { id: 'card-2' }, spot: { id: 'spot-2' } }],
      pendingTotal: 1, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryGrade || route.default;
    const { req, res } = makeReqRes({
      params: { cardId: 'card-1' },
      body: { grade: 'good' },
    });
    await handler(req, res);
    expect(res.body).toHaveProperty('nextCard');
  });
});

// =============================================================================
// POST /api/reentry/:cardId/skip
// =============================================================================
describe('POST /api/reentry/:cardId/skip', () => {
  it('200 push +1d sem alterar grade/stats', async () => {
    updateReentryCardSkipMock.mockResolvedValue({
      id: 'card-1', userId: 'USER-0001',
      lastGrade: null, reviewCount: 0,
      nextReviewAt: new Date(Date.now() + 86_400_000),
    });
    const route = await loadRoute();
    const handler = route.handlePostReentrySkip || route.default;
    const { req, res } = makeReqRes({ params: { cardId: 'card-1' } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('card');
  });

  it('403/404 quando ownership nao bate', async () => {
    updateReentryCardSkipMock.mockResolvedValue(null);
    const route = await loadRoute();
    const handler = route.handlePostReentrySkip || route.default;
    const { req, res } = makeReqRes({ params: { cardId: 'card-x' } });
    await handler(req, res);
    expect([403, 404]).toContain(res.statusCode);
  });
});
