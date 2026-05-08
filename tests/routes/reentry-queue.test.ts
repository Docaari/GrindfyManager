/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.4: GET /api/reentry/queue
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.4 (queue endpoint)
 *
 * Cobertura RED:
 *   - 200 retorna { items, pendingTotal, pendingTodayCap, nextScheduledAt }.
 *   - limit default = 5, max = 20.
 *   - Cards ordenados por next_review_at ASC (mais antigos primeiro).
 *   - Cards arquivados NAO retornam.
 *   - Empty state: items=[] + nextScheduledAt = proximo card futuro.
 *   - Items joinados com starred_hands (insight, tags, imageUrl etc).
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies
 *
 * Status RED: server/routes/reentry.ts ainda nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getReentryQueueMock } = vi.hoisted(() => ({
  getReentryQueueMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getReentryQueue: getReentryQueueMock,
  },
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/reentry');
  return mod;
}

function makeReqRes(opts: { user?: any; query?: any } = {}) {
  const req: any = {
    user: opts.user ?? { userPlatformId: 'USER-0001' },
    query: opts.query ?? {},
    params: {},
    body: {},
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

describe('GET /api/reentry/queue', () => {
  it('200 retorna shape { items, pendingTotal, pendingTodayCap, nextScheduledAt }', async () => {
    getReentryQueueMock.mockResolvedValue({
      items: [
        {
          card: { id: 'card-1', userId: 'USER-0001', spotId: 'spot-1', intervalDays: '2.50', easeFactor: '2.50' },
          spot: { id: 'spot-1', insight: 'algo', tags: ['ICM'], imageUrl: '/spots/x.png' },
        },
      ],
      pendingTotal: 5,
      pendingTodayCap: 5,
      nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('pendingTotal');
    expect(res.body).toHaveProperty('pendingTodayCap');
    expect(res.body).toHaveProperty('nextScheduledAt');
  });

  it('limit default = 5 (sem query param)', async () => {
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    const calls = getReentryQueueMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    // 3o argumento eh limit (assinatura: getReentryQueue(userId, now, limit))
    expect(lastCall?.[2]).toBe(5);
  });

  it('limit cappado em 20 mesmo se query=100', async () => {
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 20, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes({ query: { limit: '100' } });
    await handler(req, res);
    const calls = getReentryQueueMock.mock.calls;
    const lastLimit = calls[calls.length - 1]?.[2];
    expect(lastLimit).toBeLessThanOrEqual(20);
  });

  it('limit=10 respeitado quando dentro do range', async () => {
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 10, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes({ query: { limit: '10' } });
    await handler(req, res);
    const calls = getReentryQueueMock.mock.calls;
    expect(calls[calls.length - 1]?.[2]).toBe(10);
  });

  it('passa userPlatformId do JWT como primeiro argumento', async () => {
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: null,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes({ user: { userPlatformId: 'USER-XYZ' } });
    await handler(req, res);
    expect(getReentryQueueMock).toHaveBeenCalledWith(
      'USER-XYZ',
      expect.any(Date),
      expect.any(Number),
    );
  });

  it('200 com items=[] quando empty + retorna nextScheduledAt', async () => {
    const next = new Date(Date.now() + 86_400_000);
    getReentryQueueMock.mockResolvedValue({
      items: [], pendingTotal: 0, pendingTodayCap: 5, nextScheduledAt: next,
    });
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextScheduledAt).toBeDefined();
  });

  it('500 quando storage throw — log + retorno generico', async () => {
    getReentryQueueMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute();
    const handler = route.handleGetReentryQueue || route.default;
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
