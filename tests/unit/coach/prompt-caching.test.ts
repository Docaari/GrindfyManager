import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-01 — Prompt Caching + Model Upgrade
//
// Testa o novo modulo server/coachSystemBuilder.ts (AINDA NAO EXISTE) e
// integracao com handleCoachChat usando system como array com cache_control.
//
// Fontes: docs/specs/coach-sprint-1-fundacao-economica.md (RF-01),
//         Docs/architecture/decisions/019-coach-prompt-cache-strategy.md
//
// Estado esperado: todos em RED (modulos coachSystemBuilder, recordMessageUsage
// ainda nao existem). Handler atual usa `system: string` — teste deve falhar.
// =============================================================================

// Mock do database
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  desc: vi.fn((...args: any[]) => ({ type: 'desc', args })),
  asc: vi.fn((...args: any[]) => ({ type: 'asc', args })),
  gte: vi.fn((...args: any[]) => ({ type: 'gte', args })),
  ne: vi.fn((...args: any[]) => ({ type: 'ne', args })),
  sql: vi.fn(),
}));

vi.mock('@shared/schema', () => ({
  users: {},
  chatSessions: {},
  chatMessages: {},
  userAiProfile: {},
  monthlyCoachSummaries: {},
  chatMessageRequestSchema: { parse: vi.fn(), safeParse: vi.fn() },
  tournaments: {},
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-id') }));

// Mock Anthropic SDK para capturar os argumentos passados ao stream
const mockStreamInvocations: Array<any> = [];
function makeMockStream(eventsToEmit: Array<any>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const ev of eventsToEmit) yield ev;
    },
  };
}

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn((args: any) => {
          mockStreamInvocations.push(args);
          return makeMockStream([
            {
              type: 'message_start',
              message: {
                usage: {
                  input_tokens: 120,
                  cache_creation_input_tokens: 800,
                  cache_read_input_tokens: 0,
                  output_tokens: 0,
                },
              },
            },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
            {
              type: 'message_delta',
              usage: {
                output_tokens: 42,
              },
            },
          ]);
        }),
      },
    })),
  };
});

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides: any = {}) {
  return {
    headers: { authorization: 'Bearer valid' },
    body: {},
    user: {
      id: 'user-id-1',
      userPlatformId: 'USER-0001',
      email: 'player@test.com',
      subscriptionPlan: 'active',
      role: 'user',
    },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {},
    chunks: [] as string[],
    ended: false,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  res.setHeader = vi.fn((k: string, v: string) => {
    res.headers[k] = v;
    return res;
  });
  res.write = vi.fn((chunk: string) => {
    res.chunks.push(chunk);
    return true;
  });
  res.end = vi.fn(() => {
    res.ended = true;
  });
  res.flush = vi.fn();
  return res;
}

const mockCoachStorage = {
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
  mockStreamInvocations.length = 0;

  mockCoachStorage.countUserMessagesInLastHour.mockResolvedValue(0);
  mockCoachStorage.countUserMessagesInLastDay.mockResolvedValue(0);
  mockCoachStorage.getSession.mockResolvedValue(null);
  mockCoachStorage.createSession.mockResolvedValue({
    id: 'session-new-123',
    userId: 'USER-0001',
    coachType: 'mental',
    status: 'active',
  });
  mockCoachStorage.saveMessage.mockResolvedValue({
    id: 'msg-assistant-1',
    role: 'assistant',
    content: 'Hello world',
  });
  mockCoachStorage.archiveActiveSession.mockResolvedValue(undefined);
  mockCoachStorage.getUserProfile.mockResolvedValue({
    name: 'Test', subscriptionPlan: 'active', createdAt: '2025-01-01', totalTournaments: 500,
  });
  mockCoachStorage.getUserStats.mockResolvedValue({ roi: 10, profit: 500, volume: 100, abi: 20 });
  mockCoachStorage.getLastArchivedSessionSummary.mockResolvedValue(null);
  mockCoachStorage.getSessionMessages.mockResolvedValue([]);
  mockCoachStorage.getAiProfileContent.mockResolvedValue('Perfil compactado');
  mockCoachStorage.getActiveGrind.mockResolvedValue(null);
  mockCoachStorage.getRecentBreakFeedbacks.mockResolvedValue([]);
  mockCoachStorage.getDetectedLeaks.mockResolvedValue([]);
  mockCoachStorage.getWeeklyPlan.mockResolvedValue(null);
  mockCoachStorage.getStudyProgress.mockResolvedValue([]);
});

afterEach(() => {
  // Limpar envs que testes setam
  delete process.env.COACH_CHAT_MODEL;
  delete process.env.COACH_MEMORY_MODEL;
  delete process.env.COACH_MAX_TOKENS;
  delete process.env.COACH_PROMPT_CACHE_ENABLED;
});

// =============================================================================
// 1) buildStaticSystemBlock / buildDynamicSystemBlock (coachSystemBuilder)
// =============================================================================

describe('coachSystemBuilder — buildStaticSystemBlock', () => {
  it('deve retornar bloco com cache_control ephemeral', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');

    const block = mod.buildStaticSystemBlock('mental', {
      aiProfile: 'Perfil compactado do usuario',
      statsSnapshot: { roi: 15, profit: 8000 },
      lastSummary: 'Sessao anterior: discutimos tilt em turbos',
    });

    expect(block).toMatchObject({
      type: 'text',
      text: expect.any(String),
      cache_control: { type: 'ephemeral' },
    });
  });

  it('bloco estatico contem base prompt + SAFETY_RULES + ai_profile + stats + last summary', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const block = mod.buildStaticSystemBlock('mental', {
      aiProfile: 'MARKER_AI_PROFILE',
      statsSnapshot: { roi: 15.5, profit: 12000, volume: 500, abi: 33 },
      lastSummary: 'MARKER_LAST_SUMMARY',
    });

    // Deve mencionar base prompt (identidade do coach)
    expect(block.text).toMatch(/Coach Mental|coach.*mental/i);
    // Deve conter SAFETY_RULES
    expect(block.text).toMatch(/seguran[cç]a|Regras de seguranca/i);
    // ai_profile
    expect(block.text).toContain('MARKER_AI_PROFILE');
    // stats snapshot
    expect(block.text).toMatch(/15\.?5|ROI/);
    // last archived summary
    expect(block.text).toContain('MARKER_LAST_SUMMARY');
  });

  it('deve ser funcao pura — mesma entrada produz mesma saida', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const inputs = {
      aiProfile: 'X',
      statsSnapshot: { roi: 1 },
      lastSummary: 'Y',
    };
    const a = mod.buildStaticSystemBlock('tournament', inputs);
    const b = mod.buildStaticSystemBlock('tournament', inputs);
    expect(a).toEqual(b);
  });
});

describe('coachSystemBuilder — buildDynamicSystemBlock', () => {
  it('deve retornar bloco SEM cache_control', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const block = mod.buildDynamicSystemBlock('mental', {
      activeGrind: null,
      breakFeedbacks: [],
      leaks: [],
      weeklyPlan: null,
      studyProgress: [],
    });
    expect(block).toBeDefined();
    expect(block.type).toBe('text');
    expect(block.cache_control).toBeUndefined();
  });

  it('contem active grind + break feedbacks recentes + leaks detectados', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const block = mod.buildDynamicSystemBlock('mental', {
      activeGrind: { status: 'active', profitLoss: '-200', focoMedio: 4 },
      breakFeedbacks: [{ foco: 3, energia: 5, confianca: 4, inteligenciaEmocional: 6 }],
      leaks: [{ severity: 'HIGH', description: 'DESC_LEAK_MARKER' }],
      weeklyPlan: null,
      studyProgress: [],
    });
    expect(block.text).toMatch(/active|ativa|-200/i);
    expect(block.text).toMatch(/foco|feedback/i);
    expect(block.text).toContain('DESC_LEAK_MARKER');
  });

  it('inclui weekly plan para coach tournament', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const block = mod.buildDynamicSystemBlock('tournament', {
      activeGrind: null,
      breakFeedbacks: [],
      leaks: [],
      weeklyPlan: { targetBuyins: 400, targetProfit: 500, targetVolume: 150 },
      studyProgress: [],
    });
    expect(block.text).toMatch(/400|plano|semanal|target/i);
  });

  it('inclui study progress para coach technical', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    const block = mod.buildDynamicSystemBlock('technical', {
      activeGrind: null,
      breakFeedbacks: [],
      leaks: [],
      weeklyPlan: null,
      studyProgress: [{ category: 'ICM', knowledgeScore: 70, status: 'em_andamento' }],
    });
    expect(block.text).toMatch(/ICM|estudo|knowledge/i);
  });
});

// =============================================================================
// 2) assembleContext retorna system como array (2 blocos) ou (1 bloco)
// =============================================================================

describe('assembleContext — system array with cache_control', () => {
  it('deve retornar system como array com 2 blocos quando ha dados dinamicos', async () => {
    const { assembleContext } = await import('../../../server/coachContext');

    const result = await assembleContext(
      { coachType: 'mental', userId: 'USER-0001', message: 'oi', sessionId: 'S1' },
      {
        getUserProfile: vi.fn().mockResolvedValue({ name: 'X', subscriptionPlan: 'active', createdAt: 'd', totalTournaments: 10 }),
        getStatsSnapshot: vi.fn().mockResolvedValue({ roi: 10, profit: 100, volume: 10, abi: 10 }),
        getLastArchivedSessionSummary: vi.fn().mockResolvedValue('Resumo'),
        getSessionHistory: vi.fn().mockResolvedValue([]),
        getSystemPrompt: vi.fn().mockReturnValue('BASE PROMPT'),
        // Novos loaders exigidos pelo RF-01 (nao presentes ainda)
        getAiProfile: vi.fn().mockResolvedValue('AI PROFILE'),
        getActiveGrind: vi.fn().mockResolvedValue({ status: 'active', profitLoss: '-100' }),
        getRecentBreakFeedbacks: vi.fn().mockResolvedValue([{ foco: 3 }]),
        getDetectedLeaks: vi.fn().mockResolvedValue([{ severity: 'HIGH', description: 'L1' }]),
        getWeeklyPlan: vi.fn().mockResolvedValue(null),
        getStudyProgress: vi.fn().mockResolvedValue([]),
      } as any,
    );

    expect(Array.isArray((result as any).system)).toBe(true);
    expect((result as any).system).toHaveLength(2);
    expect((result as any).system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect((result as any).system[1].cache_control).toBeUndefined();
  });

  it('deve retornar system como array com 1 bloco (estatico apenas) quando nao ha dados dinamicos', async () => {
    const { assembleContext } = await import('../../../server/coachContext');
    const result = await assembleContext(
      { coachType: 'mental', userId: 'USER-0001', message: 'oi', sessionId: 'S1' },
      {
        getUserProfile: vi.fn().mockResolvedValue(null),
        getStatsSnapshot: vi.fn().mockResolvedValue(null),
        getLastArchivedSessionSummary: vi.fn().mockResolvedValue(null),
        getSessionHistory: vi.fn().mockResolvedValue([]),
        getSystemPrompt: vi.fn().mockReturnValue('BASE'),
        getAiProfile: vi.fn().mockResolvedValue(null),
        getActiveGrind: vi.fn().mockResolvedValue(null),
        getRecentBreakFeedbacks: vi.fn().mockResolvedValue([]),
        getDetectedLeaks: vi.fn().mockResolvedValue([]),
        getWeeklyPlan: vi.fn().mockResolvedValue(null),
        getStudyProgress: vi.fn().mockResolvedValue([]),
      } as any,
    );
    expect(Array.isArray((result as any).system)).toBe(true);
    expect((result as any).system).toHaveLength(1);
    expect((result as any).system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});

// =============================================================================
// 3) Modelo configuravel via env — COACH_CHAT_MODEL
// =============================================================================

describe('model selection via env (COACH_CHAT_MODEL)', () => {
  it('usa claude-sonnet-4-6 por default', async () => {
    delete process.env.COACH_CHAT_MODEL;
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    expect(mockStreamInvocations.length).toBeGreaterThan(0);
    const args = mockStreamInvocations[0];
    expect(args.model).toBe('claude-sonnet-4-6');
  });

  it('respeita override via process.env.COACH_CHAT_MODEL', async () => {
    process.env.COACH_CHAT_MODEL = 'claude-sonnet-4-5-20250514';
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);
    const args = mockStreamInvocations[0];
    expect(args.model).toBe('claude-sonnet-4-5-20250514');
  });
});

// =============================================================================
// 4) Modelo de memoria (compactSession) via COACH_MEMORY_MODEL
// =============================================================================

describe('memory model selection (COACH_MEMORY_MODEL)', () => {
  it('compactSession usa claude-haiku-4-5-20251001 por default', async () => {
    delete process.env.COACH_MEMORY_MODEL;
    // O teste verifica o comportamento do modulo — o Implementer ira
    // refatorar coachMemory para respeitar COACH_MEMORY_MODEL.
    const memoryModule: any = await import('../../../server/coachMemory');

    // Deve haver um helper exposto que retorna o modelo configurado
    expect(typeof memoryModule.getMemoryModel).toBe('function');
    expect(memoryModule.getMemoryModel()).toBe('claude-haiku-4-5-20251001');
  });

  it('respeita override via COACH_MEMORY_MODEL', async () => {
    process.env.COACH_MEMORY_MODEL = 'claude-3-5-haiku-20241022';
    const memoryModule: any = await import('../../../server/coachMemory');
    expect(memoryModule.getMemoryModel()).toBe('claude-3-5-haiku-20241022');
  });
});

// =============================================================================
// 5) max_tokens = 2048 por default e override via env
// =============================================================================

describe('max_tokens = 2048 default', () => {
  it('usa 2048 por default (em vez de 1024)', async () => {
    delete process.env.COACH_MAX_TOKENS;
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);
    const args = mockStreamInvocations[0];
    expect(args.max_tokens).toBe(2048);
  });

  it('respeita override via COACH_MAX_TOKENS', async () => {
    process.env.COACH_MAX_TOKENS = '4096';
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);
    const args = mockStreamInvocations[0];
    expect(args.max_tokens).toBe(4096);
  });
});

// =============================================================================
// 6) usage tokens extraidos do stream sao persistidos
//
// MEDIUM-8 (polimento backend): usage NAO vai mais via saveMessage (INSERT)
// e sim via recordUsage (UPDATE separado) — elimina double-write. saveMessage
// continua recebendo model/latencyMs pois sao parte da row inicial.
// =============================================================================

describe('usage tokens extraidos do stream sao persistidos', () => {
  it('recordUsage e chamado com cache_read/cache_creation/input/output tokens do stream', async () => {
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    expect(mockCoachStorage.recordUsage).toHaveBeenCalled();
    const usageCall = mockCoachStorage.recordUsage.mock.calls[0];
    // recordUsage(messageId, usage, model, latencyMs)
    expect(usageCall[1]).toMatchObject({
      input_tokens: 120,
      cache_creation_input_tokens: 800,
      cache_read_input_tokens: 0,
      output_tokens: 42,
    });
  });

  it('saveMessage recebe model usado e latencyMs numerico (sem usage)', async () => {
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    const assistantCall = mockCoachStorage.saveMessage.mock.calls.find((c: any[]) => c[0].role === 'assistant');
    const payload = assistantCall[0];
    expect(payload.model).toMatch(/claude-sonnet-4-6|claude-sonnet-4-5-20250514/);
    expect(typeof payload.latencyMs).toBe('number');
    expect(payload.latencyMs).toBeGreaterThanOrEqual(0);
    // MEDIUM-8: saveMessage NAO carrega mais usage fields
    expect(payload.inputTokens).toBeUndefined();
    expect(payload.outputTokens).toBeUndefined();
    expect(payload.cacheCreationInputTokens).toBeUndefined();
    expect(payload.cacheReadInputTokens).toBeUndefined();
  });

  it('recordUsage recebe model e latencyMs como argumentos separados', async () => {
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    const usageCall = mockCoachStorage.recordUsage.mock.calls[0];
    expect(usageCall[2]).toMatch(/claude-sonnet-4-6|claude-sonnet-4-5-20250514/);
    expect(typeof usageCall[3]).toBe('number');
    expect(usageCall[3]).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// 7) Feature flag COACH_PROMPT_CACHE_ENABLED
// =============================================================================

describe('feature flag COACH_PROMPT_CACHE_ENABLED', () => {
  it('quando false, system eh string (modo legacy) e nenhum cache_control eh emitido', async () => {
    process.env.COACH_PROMPT_CACHE_ENABLED = 'false';
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    const args = mockStreamInvocations[0];
    if (Array.isArray(args.system)) {
      // Se for array, nenhum bloco pode ter cache_control
      for (const block of args.system) {
        expect(block.cache_control).toBeUndefined();
      }
    } else {
      expect(typeof args.system).toBe('string');
    }
  });

  it('quando true (default), system eh array com cache_control', async () => {
    delete process.env.COACH_PROMPT_CACHE_ENABLED;
    const { handleCoachChat } = await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachType: 'mental', message: 'oi' } });
    const res = createMockRes();
    await handleCoachChat(req, res, mockCoachStorage as any);

    const args = mockStreamInvocations[0];
    expect(Array.isArray(args.system)).toBe(true);
    const hasCacheControl = args.system.some((b: any) => b.cache_control?.type === 'ephemeral');
    expect(hasCacheControl).toBe(true);
  });
});
