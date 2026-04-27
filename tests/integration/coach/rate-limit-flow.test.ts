import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-04 — Rate limit tiered + coach gate (flow integrado)
//
// Cenarios:
//   - Free + mental: OK, apos 10 msgs em 24h -> 429 com headers e body tiered
//   - Free + technical: 403 com upgradeTo=premium
//   - Pro + technical: 403 com upgradeTo=premium
//   - Admin bypass: 300 msgs passam
//   - Rolling 24h: msg em t=0; em t=23h59 ainda conta; em t>24h sai da janela
//
// Handler: handleCoachChat em server/routes/coach.ts
// Helpers: resolveUserTier em server/coachAccess.ts (NAO EXISTE)
// =============================================================================

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), gte: vi.fn(), ne: vi.fn(), sql: vi.fn(),
}));
vi.mock('@shared/schema', () => ({
  users: {}, chatSessions: {}, chatMessages: {}, userAiProfile: {}, monthlyCoachSummaries: {},
  chatMessageRequestSchema: { parse: vi.fn() }, tournaments: {},
}));
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'id-mock') }));

function makeStream() {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'message_start',
        message: { usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } },
      };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } };
      yield { type: 'message_delta', usage: { output_tokens: 5 } };
    },
  };
}
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: vi.fn(() => makeStream()) },
  })),
}));

// =============================================================================
// Helpers
// =============================================================================

function makeReq(userOverride: any = {}, bodyOverride: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001',
      id: 'u-1',
      email: 'p@t.com',
      subscriptionPlan: 'trial',
      role: 'user',
      ...userOverride,
    },
    body: { coachType: 'mental', message: 'oi', ...bodyOverride },
    params: {}, query: {}, headers: {},
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {}, chunks: [] };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; return res; });
  res.write = vi.fn((c: string) => { res.chunks.push(c); return true; });
  res.end = vi.fn();
  res.flush = vi.fn();
  return res;
}

function makeStorage(overrides: any = {}) {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue({ id: 's1', userId: 'USER-0001', coachType: 'mental', status: 'active' }),
    archiveActiveSession: vi.fn().mockResolvedValue(undefined),
    saveMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
    updateSessionTokenCount: vi.fn(),
    updateSessionTitle: vi.fn(),
    getSessionMessages: vi.fn().mockResolvedValue([]),
    countUserMessagesInLastHour: vi.fn().mockResolvedValue(0),
    countUserMessagesInLastDay: vi.fn().mockResolvedValue(0),
    getUserProfile: vi.fn().mockResolvedValue(null),
    getUserStats: vi.fn().mockResolvedValue(null),
    getLastArchivedSessionSummary: vi.fn().mockResolvedValue(null),
    getAiProfileContent: vi.fn().mockResolvedValue(null),
    getActiveGrind: vi.fn().mockResolvedValue(null),
    getRecentBreakFeedbacks: vi.fn().mockResolvedValue([]),
    getDetectedLeaks: vi.fn().mockResolvedValue([]),
    getWeeklyPlan: vi.fn().mockResolvedValue(null),
    getStudyProgress: vi.fn().mockResolvedValue([]),
    resolveUserTier: vi.fn().mockResolvedValue('free'),
    getOldestUserMessageInWindow: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

// =============================================================================
// Rate limit por tier
// =============================================================================

describe('Rate limit tiered', () => {
  it('free: 10a msg OK, 11a retorna 429 com headers e body corretos', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(10), // ja atingiu limite
      getOldestUserMessageInWindow: vi.fn().mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h atras
      }),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: '11a' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      upgradeTo: 'pro',
      currentPlan: 'free',
    });
    expect(res.headers['X-RateLimit-Limit']).toBe('10');
    expect(res.headers['X-RateLimit-Remaining']).toBe('0');
    expect(res.headers['X-RateLimit-Reset']).toBeTruthy();
  });

  it('free: 9 msgs anteriores permite msg 10 (ainda OK)', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(9),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: '10a' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).not.toBe(429);
  });

  it('pro: 50a msg 429', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('pro'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(50),
      getOldestUserMessageInWindow: vi.fn().mockResolvedValue({ createdAt: new Date(Date.now() - 3600 * 1000).toISOString() }),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' }, { coachType: 'mental', message: '51a' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(429);
    expect(res.headers['X-RateLimit-Limit']).toBe('50');
  });

  it('premium: 200a msg 429', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('premium'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(200),
      getOldestUserMessageInWindow: vi.fn().mockResolvedValue({ createdAt: new Date(Date.now() - 3600 * 1000).toISOString() }),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' }, { coachType: 'technical', message: '201a' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(429);
    expect(res.headers['X-RateLimit-Limit']).toBe('200');
  });

  it('admin: 300 msgs, todas passam (bypass)', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('admin'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(300),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ role: 'admin', subscriptionPlan: 'admin' }, { coachType: 'technical', message: 'msg admin' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).not.toBe(429);
  });
});

// =============================================================================
// Gate de coach por plano
// =============================================================================

describe('Coach gate por plano', () => {
  it('free + technical -> 403 com upgradeTo premium', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
    });
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'technical', message: 'oi' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      upgradeTo: 'premium',
      currentPlan: 'free',
    });
    expect(res.body.accessibleCoaches).toContain('mental');
  });

  it('free + tournament -> 403 com upgradeTo pro', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
    });
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'tournament', message: 'oi' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ upgradeTo: 'pro', currentPlan: 'free' });
  });

  it('pro + technical -> 403 com upgradeTo premium', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('pro'),
    });
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' }, { coachType: 'technical', message: 'oi' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ upgradeTo: 'premium', currentPlan: 'pro' });
  });

  it('premium + technical -> 200', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('premium'),
    });
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' }, { coachType: 'technical', message: 'oi' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(429);
  });
});

// =============================================================================
// Rolling window 24h
// =============================================================================

describe('Rolling window 24h', () => {
  it('msg feita ha 23h59m AINDA conta na janela (deveria bloquear)', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(10), // 10 msgs incluindo 23h59m
      getOldestUserMessageInWindow: vi.fn().mockResolvedValue({
        createdAt: new Date(Date.now() - (23 * 60 * 60 * 1000 + 59 * 60 * 1000)).toISOString(),
      }),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: 'nova' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).toBe(429);
  });

  it('msg feita ha 24h01m saiu da janela — countUserMessagesInLastDay retorna 9 (abaixo limite)', async () => {
    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
      // Simula que a 1a msg saiu da janela — contagem caiu para 9
      countUserMessagesInLastDay: vi.fn().mockResolvedValue(9),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: 'nova' });
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    expect(res.statusCode).not.toBe(429);
  });
});

// =============================================================================
// Concorrencia — TOCTOU (Issue HIGH #4)
// Duas requests disparadas em paralelo, ambas lendo count=9 (antes do insert
// da user message). Apenas uma deve ser aceita — a outra deve receber 429.
// Solucao: reserve-slot atomico via storage (count + insert na mesma chamada).
// =============================================================================

describe('Concorrencia de rate limit (TOCTOU)', () => {
  it('2 requests simultaneas no limite: apenas 1 passa, outra recebe 429', async () => {
    // Fake "banco" compartilhado — contagem atomica
    let currentCount = 9;

    const storage = makeStorage({
      resolveUserTier: vi.fn().mockResolvedValue('free'),
      countUserMessagesInLastDay: vi.fn(async () => currentCount),
      // Helper atomico: conta + insere se abaixo do limite, lanca se acima
      reserveMessageSlotAndSaveUserMessage: vi.fn(async (_opts: any) => {
        if (currentCount >= 10) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 'RATE_LIMIT';
          throw err;
        }
        currentCount += 1;
        return { id: 'm-' + currentCount, role: 'user' };
      }),
      saveMessage: vi.fn(async (payload: any) => {
        // Assistant message save (apos stream). Nao incrementa counter.
        if (payload.role === 'user') {
          if (currentCount >= 10) {
            const err: any = new Error('Rate limit exceeded');
            err.code = 'RATE_LIMIT';
            throw err;
          }
          currentCount += 1;
        }
        return { id: 'm-' + Math.random() };
      }),
    });

    const { handleCoachChat } = await import('../../../server/routes/coach');

    const req1 = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: 'msg-A' });
    const res1 = makeRes();
    const req2 = makeReq({ subscriptionPlan: 'trial' }, { coachType: 'mental', message: 'msg-B' });
    const res2 = makeRes();

    // Promise.all simula corrida
    await Promise.all([
      handleCoachChat(req1, res1, storage),
      handleCoachChat(req2, res2, storage),
    ]);

    // Apenas 1 passou (status != 429), o outro recebeu 429
    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toContain(429);
    // O outro deve ter concluido normal (nao 429, nao 403)
    const passed = statuses.filter(s => s !== 429);
    expect(passed.length).toBe(1);
    expect(passed[0]).not.toBe(403);

    // currentCount ficou em 10 (nao 11) — so 1 passou
    expect(currentCount).toBe(10);
  });
});
