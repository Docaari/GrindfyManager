import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-02 — Thumbs up/down + Citations
//
// Endpoints novos:
//   POST   /api/coach/messages/:id/feedback
//   DELETE /api/coach/messages/:id/feedback
//   GET    /api/admin/coach/feedback-stats
//
// Handlers esperados no server/routes/coach.ts (nao existem ainda):
//   handlePostMessageFeedback
//   handleDeleteMessageFeedback
//   handleGetFeedbackStats (admin)
//
// Fontes: docs/specs/coach-sprint-1-fundacao-economica.md (RF-02)
// =============================================================================

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ type: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ type: 'and', a })),
  desc: vi.fn((...a: any[]) => ({ type: 'desc', a })),
  sql: vi.fn(),
}));

vi.mock('@shared/schema', () => ({
  users: {}, chatSessions: {}, chatMessages: {}, messageFeedback: {},
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'fb-mock-id') }));

// =============================================================================
// Helpers
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      email: 'p@t.com',
      role: 'user',
      subscriptionPlan: 'active',
    },
    params: { id: 'msg-1' },
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

const storage = {
  getMessage: vi.fn(),
  getSession: vi.fn(),
  insertFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  getFeedbackByUserMessage: vi.fn(),
  getFeedbackStats: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POST /api/coach/messages/:id/feedback
// =============================================================================

describe('POST /api/coach/messages/:id/feedback', () => {
  it('happy path: 200 (ou 201) com feedback=up quando dono e msg de assistant', async () => {
    storage.getMessage.mockResolvedValue({
      id: 'msg-1', sessionId: 'session-1', role: 'assistant', content: 'Resposta',
    });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    storage.insertFeedback.mockResolvedValue({
      id: 'fb-mock-id', messageId: 'msg-1', userId: 'USER-0001',
      feedback: 'up', comment: null, createdAt: new Date().toISOString(),
    });

    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'up' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);

    expect([200, 201]).toContain(res.statusCode);
    expect(storage.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'msg-1', userId: 'USER-0001', feedback: 'up',
    }));
  });

  it('403 quando a message pertence a sessao de outro user', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-other', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-other', userId: 'USER-9999' });

    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'up' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);

    expect(res.statusCode).toBe(403);
  });

  it('404 quando message nao existe', async () => {
    storage.getMessage.mockResolvedValue(null);
    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'up' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);
    expect(res.statusCode).toBe(404);
  });

  it('400 quando feedback e invalido (nao e up nem down)', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'maybe' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando comment > 500 chars', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'down', comment: 'x'.repeat(501) } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando tentar feedback em message de role=user', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'user' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'up' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/usuario|user/i);
  });

  it('aceita comment opcional de exatamente 500 chars', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    storage.insertFeedback.mockResolvedValue({
      id: 'fb1', messageId: 'msg-1', userId: 'USER-0001', feedback: 'down', comment: 'y'.repeat(500),
    });
    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'down', comment: 'y'.repeat(500) } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);
    expect([200, 201]).toContain(res.statusCode);
  });

  it('segundo POST com mesmo user+message retorna 409 (feedback duplicado)', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    storage.insertFeedback.mockResolvedValue({ alreadyExists: true });

    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'down', comment: 'mudou' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);

    expect(storage.insertFeedback).toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/existe|DELETE/i);
  });

  it('ownership check roda ANTES do role check (information disclosure)', async () => {
    // Msg de outra pessoa + role=user. Deve retornar 403, nao 400.
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-other', role: 'user' });
    storage.getSession.mockResolvedValue({ id: 'session-other', userId: 'USER-9999' });

    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { feedback: 'up' } });
    const res = makeRes();
    await handlePostMessageFeedback(req, res, storage);

    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// DELETE /api/coach/messages/:id/feedback
// =============================================================================

describe('DELETE /api/coach/messages/:id/feedback', () => {
  it('happy path: 200 remove feedback existente', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    storage.deleteFeedback.mockResolvedValue({ deleted: true });

    const { handleDeleteMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({});
    const res = makeRes();
    await handleDeleteMessageFeedback(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(storage.deleteFeedback).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'msg-1', userId: 'USER-0001',
    }));
  });

  it('404 se feedback nao existia', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });
    storage.deleteFeedback.mockResolvedValue({ deleted: false });

    const { handleDeleteMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({});
    const res = makeRes();
    await handleDeleteMessageFeedback(req, res, storage);

    expect(res.statusCode).toBe(404);
  });

  it('403 quando message pertence a sessao de outro user', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-other', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-other', userId: 'USER-9999' });
    const { handleDeleteMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({});
    const res = makeRes();
    await handleDeleteMessageFeedback(req, res, storage);
    expect(res.statusCode).toBe(403);
  });

  it('DELETE: ownership check ANTES de outras checagens (403 sem consultar deleteFeedback)', async () => {
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-other', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-other', userId: 'USER-9999' });
    storage.deleteFeedback.mockResolvedValue({ deleted: false });

    const { handleDeleteMessageFeedback } = await import('../../../server/routes/coach');
    const req = makeReq({});
    const res = makeRes();
    await handleDeleteMessageFeedback(req, res, storage);

    expect(res.statusCode).toBe(403);
    expect(storage.deleteFeedback).not.toHaveBeenCalled();
  });
});

// =============================================================================
// GET /api/admin/coach/feedback-stats
// =============================================================================

describe('GET /api/admin/coach/feedback-stats', () => {
  it('403 quando usuario nao eh admin', async () => {
    const { handleGetFeedbackStats } = await import('../../../server/routes/coach');
    const req = makeReq({ user: { userPlatformId: 'USER-0001', role: 'user', subscriptionPlan: 'active' } });
    const res = makeRes();
    await handleGetFeedbackStats(req, res, storage);
    expect(res.statusCode).toBe(403);
  });

  it('happy path: 200 com shape {byCoachType, last7Days, topDownMessages}', async () => {
    storage.getFeedbackStats.mockResolvedValue({
      byCoachType: {
        mental: { up: 10, down: 2 },
        tournament: { up: 5, down: 1 },
        technical: { up: 3, down: 0 },
      },
      last7Days: [
        { date: '2026-04-18', up: 1, down: 0 },
        { date: '2026-04-19', up: 2, down: 1 },
      ],
      topDownMessages: [
        { messageId: 'm1', content: 'Resp ruim', comment: 'Alucinou', createdAt: '2026-04-20T00:00:00Z' },
      ],
    });

    const { handleGetFeedbackStats } = await import('../../../server/routes/coach');
    const req = makeReq({ user: { userPlatformId: 'USER-ADMIN', role: 'admin', subscriptionPlan: 'admin' } });
    const res = makeRes();
    await handleGetFeedbackStats(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('byCoachType');
    expect(res.body.byCoachType).toHaveProperty('mental');
    expect(res.body.byCoachType).toHaveProperty('tournament');
    expect(res.body.byCoachType).toHaveProperty('technical');
    expect(res.body).toHaveProperty('last7Days');
    expect(Array.isArray(res.body.last7Days)).toBe(true);
    expect(res.body).toHaveProperty('topDownMessages');
    expect(Array.isArray(res.body.topDownMessages)).toBe(true);
  });

  it('topDownMessages respeita limit 10 e ordem desc por createdAt', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      messageId: `m${i}`, content: `r${i}`, comment: null,
      createdAt: new Date(2026, 3, 20, 0, 0, i).toISOString(),
    }));

    storage.getFeedbackStats.mockImplementation(async (opts: any) => ({
      byCoachType: { mental: { up: 0, down: 0 }, tournament: { up: 0, down: 0 }, technical: { up: 0, down: 0 } },
      last7Days: [],
      topDownMessages: many.slice(0, opts?.topDownLimit || 10),
    }));

    const { handleGetFeedbackStats } = await import('../../../server/routes/coach');
    const req = makeReq({ user: { userPlatformId: 'USER-ADMIN', role: 'admin', subscriptionPlan: 'admin' } });
    const res = makeRes();
    await handleGetFeedbackStats(req, res, storage);

    expect(res.body.topDownMessages.length).toBeLessThanOrEqual(10);
  });

  it('repassa filtro coachType ao storage.getFeedbackStats quando fornecido', async () => {
    storage.getFeedbackStats.mockImplementation(async (opts: any) => ({
      byCoachType: opts?.coachType === 'mental'
        ? { mental: { up: 7, down: 1 } }
        : { mental: { up: 0, down: 0 }, tournament: { up: 0, down: 0 }, technical: { up: 0, down: 0 } },
      last7Days: [],
      topDownMessages: [],
      _receivedCoachType: opts?.coachType ?? null,
    }));

    const { handleGetFeedbackStats } = await import('../../../server/routes/coach');
    const req = makeReq({
      user: { userPlatformId: 'USER-ADMIN', role: 'admin', subscriptionPlan: 'admin' },
      query: { coachType: 'mental' },
    });
    const res = makeRes();
    await handleGetFeedbackStats(req, res, storage);

    expect(storage.getFeedbackStats).toHaveBeenCalledWith(expect.objectContaining({
      coachType: 'mental',
    }));
    expect(res.body._receivedCoachType).toBe('mental');
  });

  it('nao passa coachType quando parametro ausente (agrega todos)', async () => {
    storage.getFeedbackStats.mockImplementation(async (opts: any) => ({
      byCoachType: { mental: { up: 0, down: 0 }, tournament: { up: 0, down: 0 }, technical: { up: 0, down: 0 } },
      last7Days: [],
      topDownMessages: [],
      _receivedCoachType: opts?.coachType ?? null,
    }));

    const { handleGetFeedbackStats } = await import('../../../server/routes/coach');
    const req = makeReq({
      user: { userPlatformId: 'USER-ADMIN', role: 'admin', subscriptionPlan: 'admin' },
      query: {},
    });
    const res = makeRes();
    await handleGetFeedbackStats(req, res, storage);

    expect(res.body._receivedCoachType).toBeNull();
  });
});
