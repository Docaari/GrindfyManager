/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.4 + RF-4: POST /api/reentry/bulk-from-session
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.4 (bulk-from-session) + §RF-4
 *
 * Cobertura RED:
 *   - 201 cria multiplos cards em uma chamada.
 *   - 400 quando spotIds.length > 20 (cap).
 *   - 400 quando spotIds invalido (nao-array, vazio).
 *   - 400 quando sessionId nao fornecido.
 *   - 403 quando sessionId nao pertence ao user.
 *   - 403 quando algum spotId nao pertence ao user.
 *   - skipped++ quando spot ja tem reentry ativa (idempotency).
 *   - Initial state computado por (decision_correct, confidence_level) ADR-139.
 *
 * Status RED: server/routes/reentry.ts ainda nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getGrindSessionByIdMock,
  getStarredHandsByIdsMock,
  bulkCreateReentryCardsMock,
} = vi.hoisted(() => ({
  getGrindSessionByIdMock: vi.fn(),
  getStarredHandsByIdsMock: vi.fn(),
  bulkCreateReentryCardsMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getGrindSession: getGrindSessionByIdMock,
    getGrindSessionById: getGrindSessionByIdMock,
    getStarredHandsByIds: getStarredHandsByIdsMock,
    bulkCreateReentryCards: bulkCreateReentryCardsMock,
  },
}));

async function loadRoute() {
  const mod: any = await import('../../server/routes/reentry');
  return mod;
}

function makeReqRes(opts: { user?: any; body?: any } = {}) {
  const req: any = {
    user: opts.user ?? { userPlatformId: 'USER-0001' },
    body: opts.body ?? {},
    params: {}, query: {},
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

describe('POST /api/reentry/bulk-from-session', () => {
  it('201 cria N cards via bulk', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-0001' });
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', decisionCorrect: false, confidenceLevel: null },
      { id: 'spot-2', userId: 'USER-0001', decisionCorrect: null, confidenceLevel: 1 },
    ]);
    bulkCreateReentryCardsMock.mockResolvedValue({
      created: 2,
      skipped: 0,
      cards: [
        { id: 'card-1', spotId: 'spot-1', userId: 'USER-0001' },
        { id: 'card-2', spotId: 'spot-2', userId: 'USER-0001' },
      ],
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: ['spot-1', 'spot-2'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(0);
    expect(Array.isArray(res.body.cards)).toBe(true);
  });

  it('400 quando spotIds.length > 20', async () => {
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const tooMany = Array.from({ length: 25 }, (_, i) => `spot-${i}`);
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: tooMany },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando spotIds = []', async () => {
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: [] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando sessionId ausente', async () => {
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { spotIds: ['spot-1'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('403 quando sessionId pertence a outro user', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-OUTRO' });
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      user: { userPlatformId: 'USER-0001' },
      body: { sessionId: 'gs-1', spotIds: ['spot-1'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('403 quando algum spotId nao pertence ao user', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-0001' });
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', decisionCorrect: false, confidenceLevel: null },
      { id: 'spot-2', userId: 'USER-OUTRO' /* outro user! */ },
    ]);
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: ['spot-1', 'spot-2'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('5 spots, 2 ja com reentry ativa → created=3, skipped=2', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-0001' });
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', decisionCorrect: false },
      { id: 'spot-2', userId: 'USER-0001', decisionCorrect: false },
      { id: 'spot-3', userId: 'USER-0001', decisionCorrect: false },
      { id: 'spot-4', userId: 'USER-0001', confidenceLevel: 2 },
      { id: 'spot-5', userId: 'USER-0001', confidenceLevel: 2 },
    ]);
    bulkCreateReentryCardsMock.mockResolvedValue({
      created: 3,
      skipped: 2,
      cards: [
        { id: 'c1', spotId: 'spot-1' },
        { id: 'c2', spotId: 'spot-2' },
        { id: 'c3', spotId: 'spot-3' },
      ],
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: ['spot-1', 'spot-2', 'spot-3', 'spot-4', 'spot-5'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.created).toBe(3);
    expect(res.body.skipped).toBe(2);
  });

  it('passa source=coach_session_insight para storage', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-0001' });
    getStarredHandsByIdsMock.mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', decisionCorrect: false },
    ]);
    bulkCreateReentryCardsMock.mockResolvedValue({
      created: 1, skipped: 0, cards: [{ id: 'c1', spotId: 'spot-1' }],
    });
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: ['spot-1'] },
    });
    await handler(req, res);
    expect(bulkCreateReentryCardsMock).toHaveBeenCalled();
    const callArg = bulkCreateReentryCardsMock.mock.calls[0]?.[1];
    expect(Array.isArray(callArg)).toBe(true);
    expect(callArg[0]).toMatchObject({
      spotId: 'spot-1',
      source: 'coach_session_insight',
    });
  });

  it('500 quando storage throw', async () => {
    getGrindSessionByIdMock.mockResolvedValue({ id: 'gs-1', userId: 'USER-0001' });
    getStarredHandsByIdsMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = await loadRoute();
    const handler = route.handlePostReentryBulkFromSession || route.default;
    const { req, res } = makeReqRes({
      body: { sessionId: 'gs-1', spotIds: ['spot-1'] },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(500);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
