import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-01 — Integration: Caching flow + cost estimation
//
// Testa 2 requests consecutivas para a mesma sessao: a primeira paga cache_write,
// a segunda (em janela <5 min) deve pagar cache_read. Validamos tambem o helper
// `estimateCost(usage, model)`.
//
// Fonte: docs/specs/coach-sprint-1-fundacao-economica.md (RF-01 CA #1, #2, #3, #4)
//        Docs/architecture/decisions/019-coach-prompt-cache-strategy.md
// =============================================================================

// =============================================================================
// Mocks de infra
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

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-id') }));

// Anthropic mock controlavel com usage dinamico por chamada
const usageByCall: Array<any> = [];
function makeStream(emittedUsage: any) {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'message_start',
        message: { usage: emittedUsage },
      };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'OK' } };
      yield { type: 'message_delta', usage: { output_tokens: emittedUsage.output_tokens || 10 } };
    },
  };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      stream: vi.fn((args: any) => {
        const next = usageByCall.shift() || { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
        return makeStream(next);
      }),
    },
  })),
}));

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    body: {},
    user: {
      id: 'u-1', userPlatformId: 'USER-0001', email: 'p@t.com',
      subscriptionPlan: 'active', role: 'user',
    },
    ...overrides,
  };
}
function createMockRes() {
  const res: any = { chunks: [] as string[], headers: {} as any };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; return res; });
  res.write = vi.fn((c: string) => { res.chunks.push(c); return true; });
  res.end = vi.fn();
  res.flush = vi.fn();
  return res;
}

const storage = {
  getSession: vi.fn(),
  createSession: vi.fn(),
  archiveActiveSession: vi.fn(),
  saveMessage: vi.fn(),
  updateSessionTokenCount: vi.fn(),
  updateSessionTitle: vi.fn(),
  getSessionMessages: vi.fn(),
  countUserMessagesInLastHour: vi.fn(),
  countUserMessagesInLastDay: vi.fn(),
  getUserProfile: vi.fn(),
  getUserStats: vi.fn(),
  getLastArchivedSessionSummary: vi.fn(),
  getAiProfileContent: vi.fn(),
  getActiveGrind: vi.fn(),
  getRecentBreakFeedbacks: vi.fn(),
  getDetectedLeaks: vi.fn(),
  getWeeklyPlan: vi.fn(),
  getStudyProgress: vi.fn(),
  // MEDIUM-8: usage e gravado via UPDATE separado (recordUsage), nao em saveMessage.
  recordUsage: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  usageByCall.length = 0;
  storage.countUserMessagesInLastHour.mockResolvedValue(0);
  storage.countUserMessagesInLastDay.mockResolvedValue(0);
  storage.getSession.mockResolvedValue({
    id: 'session-1', userId: 'USER-0001', coachType: 'mental', status: 'active',
  });
  storage.saveMessage.mockImplementation(async (payload: any) => ({ id: 'msg-' + Math.random(), ...payload }));
  storage.getSessionMessages.mockResolvedValue([]);
  storage.getUserProfile.mockResolvedValue(null);
  storage.getUserStats.mockResolvedValue(null);
  storage.getLastArchivedSessionSummary.mockResolvedValue(null);
  storage.getAiProfileContent.mockResolvedValue(null);
  storage.getActiveGrind.mockResolvedValue(null);
  storage.getRecentBreakFeedbacks.mockResolvedValue([]);
  storage.getDetectedLeaks.mockResolvedValue([]);
  storage.getWeeklyPlan.mockResolvedValue(null);
  storage.getStudyProgress.mockResolvedValue([]);
});

// =============================================================================
// Test 1: sequencia cache write -> cache read
// =============================================================================

describe('Caching flow — 2 requests consecutivas na mesma sessao', () => {
  it('1a msg registra cache_creation_input_tokens > 0; 2a msg registra cache_read_input_tokens > 0', async () => {
    // Preparar 2 respostas: primeira cria cache, segunda le cache
    usageByCall.push({ input_tokens: 120, cache_creation_input_tokens: 800, cache_read_input_tokens: 0, output_tokens: 30 });
    usageByCall.push({ input_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 800, output_tokens: 30 });

    const { handleCoachChat } = await import('../../../server/routes/coach');

    // Request 1
    const req1 = createMockReq({ body: { coachType: 'mental', message: 'oi', sessionId: 'session-1' } });
    const res1 = createMockRes();
    await handleCoachChat(req1, res1, storage as any);

    // MEDIUM-8: usage e gravado via recordUsage (UPDATE), nao saveMessage (INSERT).
    expect(storage.recordUsage).toHaveBeenCalled();
    const firstUsageCall = storage.recordUsage.mock.calls[0];
    expect(firstUsageCall[1].cache_creation_input_tokens).toBeGreaterThan(0);
    expect(firstUsageCall[1].cache_read_input_tokens).toBe(0);

    // Request 2 na mesma sessao
    storage.saveMessage.mockClear();
    storage.recordUsage.mockClear();
    const req2 = createMockReq({ body: { coachType: 'mental', message: 'continuando', sessionId: 'session-1' } });
    const res2 = createMockRes();
    await handleCoachChat(req2, res2, storage as any);

    expect(storage.recordUsage).toHaveBeenCalled();
    const secondUsageCall = storage.recordUsage.mock.calls[0];
    expect(secondUsageCall[1].cache_read_input_tokens).toBeGreaterThan(0);
    expect(secondUsageCall[1].cache_creation_input_tokens).toBe(0);
  });
});

// =============================================================================
// Test 2: estimateCost helper
// =============================================================================

describe('estimateCost(usage, model) — helper de custo em USD', () => {
  // Formula (Sonnet 4.6):
  // cost = (input_tokens*3 + cache_creation*3.75 + cache_read*0.30 + output*15) / 1_000_000

  it('calcula custo corretamente para Sonnet 4.6 com cache write', async () => {
    const { estimateCost } = await import('../../../server/coachUsage');
    const usage = {
      input_tokens: 100,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 0,
      output_tokens: 500,
    };
    // (100*3 + 1000*3.75 + 0*0.30 + 500*15) / 1e6 = (300 + 3750 + 0 + 7500)/1e6 = 11550/1e6 = 0.01155
    const cost = estimateCost(usage, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(0.01155, 6);
  });

  it('calcula custo corretamente para Sonnet 4.6 com cache read', async () => {
    const { estimateCost } = await import('../../../server/coachUsage');
    const usage = {
      input_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1000,
      output_tokens: 500,
    };
    // (100*3 + 0 + 1000*0.30 + 500*15) / 1e6 = (300 + 0 + 300 + 7500)/1e6 = 8100/1e6 = 0.0081
    const cost = estimateCost(usage, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(0.0081, 6);
  });

  it('usa 0 quando campos de usage estao undefined/null', async () => {
    const { estimateCost } = await import('../../../server/coachUsage');
    const usage = { input_tokens: 100, output_tokens: 200 } as any;
    // 100*3 + 200*15 = 300 + 3000 = 3300/1e6 = 0.0033
    const cost = estimateCost(usage, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(0.0033, 6);
  });

  it('retorna 0 para usage vazio', async () => {
    const { estimateCost } = await import('../../../server/coachUsage');
    expect(estimateCost({} as any, 'claude-sonnet-4-6')).toBe(0);
  });

  it('lanca ou retorna 0 para modelo desconhecido (comportamento graceful)', async () => {
    const { estimateCost } = await import('../../../server/coachUsage');
    // Politica: modelos nao mapeados devem retornar 0 (grace) OU lancar.
    // Aceitamos ambos — mas nao deve retornar NaN.
    const call = () => estimateCost({ input_tokens: 100, output_tokens: 50 }, 'modelo-que-nao-existe-7');
    try {
      const val = call();
      expect(Number.isFinite(val)).toBe(true);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });
});
