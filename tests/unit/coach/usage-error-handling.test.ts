import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-01 — Usage error handling (issue HIGH #3)
//
// Quando o stream aborta sem emitir evento de usage (message_start com
// usage OU message_delta com usage), a mensagem persistida NAO DEVE ter
// 0 em input/output/cache_* — deve ter NULL (mascarar erros com 0 distorce
// metricas de custo agregado).
//
// Alem disso, recordMessageUsage nao deve executar UPDATE quando TODOS os
// campos sao null/undefined (evita gravar linhas "fantasma").
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

// Stream que LANCA erro antes de emitir message_start / message_delta.
function makeErrorStream() {
  return {
    async *[Symbol.asyncIterator]() {
      // Sem emitir usage antes — simula erro imediato
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'parc' } };
      throw new Error('Stream aborted');
    },
  };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: vi.fn(() => makeErrorStream()) },
  })),
}));

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001', id: 'u-1', email: 'p@t.com',
      subscriptionPlan: 'active', role: 'user',
    },
    body: { coachType: 'mental', message: 'oi' },
    params: {}, query: {}, headers: {},
    ...overrides,
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
    countUserMessagesInLastDay: vi.fn().mockResolvedValue(0),
    countUserMessagesInLastHour: vi.fn().mockResolvedValue(0),
    getUserProfile: vi.fn().mockResolvedValue(null),
    getUserStats: vi.fn().mockResolvedValue(null),
    getLastArchivedSessionSummary: vi.fn().mockResolvedValue(null),
    getAiProfileContent: vi.fn().mockResolvedValue(null),
    getActiveGrind: vi.fn().mockResolvedValue(null),
    getRecentBreakFeedbacks: vi.fn().mockResolvedValue([]),
    getDetectedLeaks: vi.fn().mockResolvedValue([]),
    getWeeklyPlan: vi.fn().mockResolvedValue(null),
    getStudyProgress: vi.fn().mockResolvedValue([]),
    resolveUserTier: vi.fn().mockResolvedValue('pro'),
    getOldestUserMessageInWindow: vi.fn().mockResolvedValue(null),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// =============================================================================
// handleCoachChat — stream error sem emitir usage
// =============================================================================

describe('handleCoachChat — stream error sem emitir usage', () => {
  it('saveMessage do assistant NAO carrega usage fields (MEDIUM-8: write em UPDATE separado)', async () => {
    const storage = makeStorage();
    const { handleCoachChat } = await import('../../../server/routes/coach');

    const req = makeReq();
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    // Dois saveMessage: user e assistant
    const assistantCall = storage.saveMessage.mock.calls.find((c: any[]) => c[0].role === 'assistant');
    expect(assistantCall).toBeDefined();
    const payload = assistantCall[0];

    // MEDIUM-8: saveMessage nao recebe mais usage. Sao undefined no payload.
    // Os campos so existem no UPDATE feito por recordUsage — que NAO e chamado
    // quando usage e null (issue HIGH #3 ainda valido).
    expect(payload.inputTokens).toBeUndefined();
    expect(payload.outputTokens).toBeUndefined();
    expect(payload.cacheCreationInputTokens).toBeUndefined();
    expect(payload.cacheReadInputTokens).toBeUndefined();
  });

  it('nao chama recordUsage do storage quando usage nao foi capturado', async () => {
    const storage = makeStorage();
    const { handleCoachChat } = await import('../../../server/routes/coach');

    const req = makeReq();
    const res = makeRes();
    await handleCoachChat(req, res, storage);

    // Quando nao ha usage (null), nao deve chamar recordUsage
    expect(storage.recordUsage).not.toHaveBeenCalled();
  });
});

// =============================================================================
// recordMessageUsage — null skip
// =============================================================================

describe('recordMessageUsage — skip UPDATE quando todos nulls', () => {
  it('nao chama db.update quando input/output/cache_* sao todos null/undefined', async () => {
    const { db } = await import('../../../server/db');
    const updateSpy = db.update as any;
    updateSpy.mockClear?.();

    const { recordMessageUsage } = await import('../../../server/coachUsage');
    await recordMessageUsage('msg-1', {
      input_tokens: null,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    }, 'claude-sonnet-4-6', 100);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('nao chama db.update quando todos campos sao undefined', async () => {
    const { db } = await import('../../../server/db');
    const updateSpy = db.update as any;
    updateSpy.mockClear?.();

    const { recordMessageUsage } = await import('../../../server/coachUsage');
    await recordMessageUsage('msg-1', {}, 'claude-sonnet-4-6', 100);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('CHAMA db.update quando ao menos um campo esta presente', async () => {
    const { db } = await import('../../../server/db');
    const updateSpy = db.update as any;
    updateSpy.mockClear?.();
    const setSpy = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    updateSpy.mockReturnValue({ set: setSpy });

    const { recordMessageUsage } = await import('../../../server/coachUsage');
    await recordMessageUsage('msg-1', {
      input_tokens: 100,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    }, 'claude-sonnet-4-6', 100);

    expect(updateSpy).toHaveBeenCalled();
    expect(setSpy).toHaveBeenCalled();
    const setPayload = setSpy.mock.calls[0][0];
    // null para ausentes — NAO 0
    expect(setPayload.outputTokens).toBeNull();
    expect(setPayload.cacheCreationInputTokens).toBeNull();
    expect(setPayload.cacheReadInputTokens).toBeNull();
    expect(setPayload.inputTokens).toBe(100);
  });
});
