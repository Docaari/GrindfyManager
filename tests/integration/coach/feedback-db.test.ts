import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-02 — Integration DB layer
//
// Garante que o segundo POST com mesmo (message_id, user_id) retorna 409
// (feedback ja existe). UNIQUE e respeitado: a row nao e duplicada e nao e
// sobrescrita in-place — o cliente precisa DELETE antes de enviar novo.
//
// Teste integra o handler POST /feedback com uma storage mock que simula
// comportamento do banco (UNIQUE via key ficticia).
// =============================================================================

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), desc: vi.fn(), sql: vi.fn(),
}));

vi.mock('@shared/schema', () => ({
  users: {}, chatSessions: {}, chatMessages: {}, messageFeedback: {},
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-id') }));

// =============================================================================
// Storage "fake" com comportamento de UNIQUE
// =============================================================================

type FbRow = { id: string; messageId: string; userId: string; feedback: 'up' | 'down'; comment: string | null; createdAt: string };

function makeStorageWithInsert() {
  const db: FbRow[] = [];
  return {
    _getAll: () => db,
    getMessage: vi.fn(),
    getSession: vi.fn(),
    insertFeedback: vi.fn(async (payload: any) => {
      const idx = db.findIndex(r => r.messageId === payload.messageId && r.userId === payload.userId);
      if (idx >= 0) {
        // Ja existe — nao faz UPDATE, sinaliza para handler responder 409.
        return { alreadyExists: true };
      }
      const row: FbRow = {
        id: 'fb-' + db.length,
        messageId: payload.messageId,
        userId: payload.userId,
        feedback: payload.feedback,
        comment: payload.comment ?? null,
        createdAt: new Date().toISOString(),
      };
      db.push(row);
      return row;
    }),
    deleteFeedback: vi.fn(async (payload: any) => {
      const idx = db.findIndex(r => r.messageId === payload.messageId && r.userId === payload.userId);
      if (idx < 0) return { deleted: false };
      db.splice(idx, 1);
      return { deleted: true };
    }),
    getFeedbackStats: vi.fn(),
  };
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', role: 'user' },
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UNIQUE(message_id, user_id) — 409 em duplicado via API', () => {
  it('segundo POST do mesmo user+message retorna 409 (row mantida intacta)', async () => {
    const storage = makeStorageWithInsert();
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });

    const { handlePostMessageFeedback } = await import('../../../server/routes/coach');

    // POST 1: up — insert novo
    const req1 = makeReq({ body: { feedback: 'up' } });
    const res1 = makeRes();
    await handlePostMessageFeedback(req1, res1, storage);
    expect([200, 201]).toContain(res1.statusCode);
    expect(storage._getAll()).toHaveLength(1);
    expect(storage._getAll()[0].feedback).toBe('up');

    // POST 2: down (mesmo user+message) — deve retornar 409 e NAO alterar row existente
    const req2 = makeReq({ body: { feedback: 'down', comment: 'na verdade nao curti' } });
    const res2 = makeRes();
    await handlePostMessageFeedback(req2, res2, storage);

    expect(res2.statusCode).toBe(409);
    expect(storage._getAll()).toHaveLength(1);
    // Row original preservada — feedback continua 'up'
    expect(storage._getAll()[0].feedback).toBe('up');
    expect(storage._getAll()[0].comment).toBeNull();
  });

  it('DELETE + novo POST funciona normalmente apos duplicado', async () => {
    const storage = makeStorageWithInsert();
    storage.getMessage.mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'assistant' });
    storage.getSession.mockResolvedValue({ id: 'session-1', userId: 'USER-0001' });

    const { handlePostMessageFeedback, handleDeleteMessageFeedback } = await import('../../../server/routes/coach');

    // POST 1
    await handlePostMessageFeedback(makeReq({ body: { feedback: 'up' } }), makeRes(), storage);
    expect(storage._getAll()).toHaveLength(1);

    // DELETE
    const resDel = makeRes();
    await handleDeleteMessageFeedback(makeReq({}), resDel, storage);
    expect(resDel.statusCode).toBe(200);
    expect(storage._getAll()).toHaveLength(0);

    // POST 2 com novo feedback — agora passa
    const res2 = makeRes();
    await handlePostMessageFeedback(makeReq({ body: { feedback: 'down', comment: 'agora sim' } }), res2, storage);
    expect([200, 201]).toContain(res2.statusCode);
    expect(storage._getAll()).toHaveLength(1);
    expect(storage._getAll()[0].feedback).toBe('down');
  });
});
