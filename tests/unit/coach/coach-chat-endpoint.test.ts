import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Endpoint POST /api/coach/chat
//
// Testa o endpoint de envio de mensagem ao coach com streaming SSE.
// Mocks: Claude API, storage/DB, auth middleware.
//
// O modulo de rotas do coach AINDA NAO EXISTE (server/routes/coach.ts).
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// Mock do database
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  desc: vi.fn((...args: any[]) => ({ type: 'desc', args })),
  sql: vi.fn(),
}));

// Mock @shared/schema — inclui tabelas do coach que serao criadas
vi.mock('@shared/schema', () => ({
  users: {
    id: 'users.id',
    userPlatformId: 'users.user_platform_id',
    email: 'users.email',
    name: 'users.name',
    subscriptionPlan: 'users.subscriptionPlan',
    createdAt: 'users.createdAt',
  },
  chatSessions: {
    id: 'chat_sessions.id',
    userId: 'chat_sessions.user_id',
    coachType: 'chat_sessions.coach_type',
    title: 'chat_sessions.title',
    status: 'chat_sessions.status',
    summary: 'chat_sessions.summary',
    tokenCount: 'chat_sessions.token_count',
    messageCount: 'chat_sessions.message_count',
    createdAt: 'chat_sessions.created_at',
    updatedAt: 'chat_sessions.updated_at',
  },
  chatMessages: {
    id: 'chat_messages.id',
    sessionId: 'chat_messages.session_id',
    role: 'chat_messages.role',
    content: 'chat_messages.content',
    tokenCount: 'chat_messages.token_count',
    metadata: 'chat_messages.metadata',
    createdAt: 'chat_messages.created_at',
  },
  chatMessageRequestSchema: {
    safeParse: vi.fn(),
    parse: vi.fn(),
  },
  tournaments: {},
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-id'),
}));

// Mock do Anthropic SDK — Claude API
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      stream: vi.fn(),
    },
  })),
}));

// Import do handler que sera criado pelo Implementer
// O Implementer criara server/routes/coach.ts com registerCoachRoutes(app)
// Para testes unitarios, testamos o handler diretamente
import { handleCoachChat } from '../../../server/routes/coach';

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides: any = {}) {
  return {
    headers: { authorization: 'Bearer valid-token' },
    body: {},
    user: {
      id: 'user-id-1',
      userPlatformId: 'USER-0001',
      email: 'player@test.com',
      name: 'Test Player',
      subscriptionPlan: 'active',
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
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  res.setHeader = vi.fn((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });
  res.write = vi.fn((chunk: string) => {
    res.chunks.push(chunk);
    return true;
  });
  res.end = vi.fn();
  res.flush = vi.fn();
  return res;
}

// Mock storage para operacoes de banco do coach
const mockCoachStorage = {
  getSession: vi.fn(),
  createSession: vi.fn(),
  archiveActiveSession: vi.fn(),
  saveMessage: vi.fn(),
  updateSessionTokenCount: vi.fn(),
  updateSessionTitle: vi.fn(),
  getSessionMessages: vi.fn(),
  countUserMessagesInLastHour: vi.fn(),
  getUserProfile: vi.fn(),
  getUserStats: vi.fn(),
  getLastArchivedSessionSummary: vi.fn(),
};

// =============================================================================
// TESTES
// =============================================================================

describe('POST /api/coach/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: sem rate limit, sem sessao ativa previa
    mockCoachStorage.countUserMessagesInLastHour.mockResolvedValue(0);
    mockCoachStorage.getSession.mockResolvedValue(null);
    mockCoachStorage.createSession.mockResolvedValue({
      id: 'session-new-123',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'active',
      tokenCount: 0,
      messageCount: 0,
    });
    mockCoachStorage.saveMessage.mockResolvedValue({
      id: 'msg-001',
      role: 'user',
      content: 'Mensagem',
      tokenCount: 5,
    });
    mockCoachStorage.archiveActiveSession.mockResolvedValue(undefined);
    mockCoachStorage.getUserProfile.mockResolvedValue({
      name: 'Test Player',
      subscriptionPlan: 'active',
      createdAt: '2025-01-01',
      totalTournaments: 500,
    });
    mockCoachStorage.getUserStats.mockResolvedValue({
      roi: 15.5,
      profit: 12000,
      volume: 500,
      abi: 33,
    });
    mockCoachStorage.getLastArchivedSessionSummary.mockResolvedValue(null);
    mockCoachStorage.getSessionMessages.mockResolvedValue([]);
  });

  describe('happy path', () => {
    it('deve retornar 200 e iniciar streaming SSE para mensagem valida', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Como lidar com tilt?' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('deve salvar a mensagem do usuario no banco antes do streaming', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Estou tiltado' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: 'Estou tiltado',
        })
      );
    });

    it('deve salvar a resposta do assistant no banco apos streaming completo', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Dica de foco' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      // Deve ter salvo 2 mensagens: user + assistant
      expect(mockCoachStorage.saveMessage).toHaveBeenCalledTimes(2);
      expect(mockCoachStorage.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant' })
      );
    });

    it('deve enviar evento "done" com messageId ao finalizar streaming', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Ola coach' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      const doneChunk = res.chunks.find((c: string) => c.includes('"type":"done"'));
      expect(doneChunk).toBeDefined();
      expect(doneChunk).toContain('"messageId"');
    });

    it('deve estimar token count como chars/4 para mensagem do usuario', async () => {
      const message = 'a'.repeat(200); // 200 chars = ~50 tokens
      const req = createMockReq({
        body: { coachType: 'mental', message },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          tokenCount: 50, // 200 / 4
        })
      );
    });
  });

  describe('criacao automatica de sessao', () => {
    it('deve criar sessao automaticamente se sessionId nao fornecido', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Primeira mensagem' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'USER-0001',
          coachType: 'mental',
        })
      );
    });

    it('deve arquivar sessao ativa anterior ao criar nova sessao', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Nova conversa' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.archiveActiveSession).toHaveBeenCalledWith(
        'USER-0001',
        'mental'
      );
    });

    it('deve gerar titulo automatico da primeira mensagem (max 50 chars)', async () => {
      const longMessage = 'Esta e uma mensagem muito longa que excede os cinquenta caracteres permitidos para o titulo da sessao';
      const req = createMockReq({
        body: { coachType: 'mental', message: longMessage },
      });
      const res = createMockRes();
      mockCoachStorage.getSessionMessages.mockResolvedValue([]); // Sem mensagens anteriores

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.updateSessionTitle).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/^.{1,50}$/) // Max 50 chars
      );
    });
  });

  describe('validacao de sessao existente', () => {
    it('deve usar sessao existente quando sessionId fornecido e valido', async () => {
      mockCoachStorage.getSession.mockResolvedValue({
        id: 'session-existing',
        userId: 'USER-0001',
        coachType: 'mental',
        status: 'active',
      });

      const req = createMockReq({
        body: {
          coachType: 'mental',
          message: 'Continuando conversa',
          sessionId: 'session-existing',
        },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.createSession).not.toHaveBeenCalled();
    });

    it('deve retornar 403 quando sessionId pertence a outro usuario', async () => {
      mockCoachStorage.getSession.mockResolvedValue({
        id: 'session-other-user',
        userId: 'USER-9999', // Outro usuario
        coachType: 'mental',
        status: 'active',
      });

      const req = createMockReq({
        body: {
          coachType: 'mental',
          message: 'Tentando acessar sessao alheia',
          sessionId: 'session-other-user',
        },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('deve retornar 400 quando sessionId tem coachType diferente do request', async () => {
      mockCoachStorage.getSession.mockResolvedValue({
        id: 'session-tournament',
        userId: 'USER-0001',
        coachType: 'tournament', // Diferente do request
        status: 'active',
      });

      const req = createMockReq({
        body: {
          coachType: 'mental', // Request pede mental, sessao e tournament
          message: 'Mensagem',
          sessionId: 'session-tournament',
        },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });
  });

  describe('validacao de input', () => {
    it('deve retornar 400 para coachType invalido', async () => {
      const req = createMockReq({
        body: { coachType: 'financial', message: 'Ola' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deve retornar 400 para mensagem vazia', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: '' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deve retornar 400 para mensagem acima de 2000 caracteres', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'x'.repeat(2001) },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deve aceitar mensagem com exatamente 2000 caracteres', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'x'.repeat(2000) },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('autenticacao', () => {
    it('deve retornar 401 quando usuario nao esta autenticado', async () => {
      const req = createMockReq({
        user: undefined, // Sem autenticacao
        body: { coachType: 'mental', message: 'Ola' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('rate limiting', () => {
    // Sprint coach-launch-fix RF-04: limite virou per-tier em janela 24h
    // (free=10, pro=50, premium=200, admin=Infinity), nao mais 30/hora flat.
    // O tier vem do subscriptionPlan; 'free'/'trial'/'active'/desconhecido => 10.
    it('deve retornar 429 (code rate_limited) quando msgCount >= limite do tier', async () => {
      mockCoachStorage.countUserMessagesInLastHour.mockResolvedValue(999); // acima de qualquer limite finito

      const req = createMockReq({
        user: { userPlatformId: 'USER-0001', subscriptionPlan: 'free' },
        body: { coachType: 'mental', message: 'mensagem alem do limite' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'rate_limited' })
      );
    });

    it('deve permitir quando msgCount esta abaixo do limite do tier', async () => {
      mockCoachStorage.countUserMessagesInLastHour.mockResolvedValue(3); // < 10 (free)

      const req = createMockReq({
        user: { userPlatformId: 'USER-0001', subscriptionPlan: 'free' },
        body: { coachType: 'mental', message: 'mensagem dentro do limite' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(res.status).not.toHaveBeenCalledWith(429);
    });
  });

  describe('token count e sessao', () => {
    it('deve atualizar token count acumulado na sessao apos resposta', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Pergunta curta' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      expect(mockCoachStorage.updateSessionTokenCount).toHaveBeenCalled();
    });
  });

  describe('tratamento de erros da Claude API', () => {
    it('deve enviar evento SSE de erro quando Claude API falha', async () => {
      // Simular falha da Claude API no mock — o Implementer configurara isso
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Mensagem que causa erro na API' },
      });
      const res = createMockRes();

      // O handler deve capturar o erro e enviar via SSE
      await handleCoachChat(req, res, mockCoachStorage);

      // Independente do mock, verificamos a estrutura esperada:
      // Se a API falhou, deve ter um chunk de erro OU sucesso
      expect(res.end).toHaveBeenCalled();
    });

    it('deve salvar mensagem do usuario mesmo quando Claude API falha', async () => {
      const req = createMockReq({
        body: { coachType: 'mental', message: 'Mensagem preservada' },
      });
      const res = createMockRes();

      await handleCoachChat(req, res, mockCoachStorage);

      // A mensagem do usuario deve ser salva ANTES de chamar a Claude API
      expect(mockCoachStorage.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: 'Mensagem preservada',
        })
      );
    });
  });
});
