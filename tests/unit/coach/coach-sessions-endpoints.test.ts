import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Endpoints de Gestao de Sessoes do AI Coach
//
// Testa: GET /sessions, GET /sessions/:id/messages, POST /sessions/:id/archive,
// DELETE /sessions/:id
//
// Os handlers AINDA NAO EXISTEM (server/routes/coach.ts).
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
  asc: vi.fn((...args: any[]) => ({ type: 'asc', args })),
  ne: vi.fn((...args: any[]) => ({ type: 'ne', args })),
  sql: vi.fn(),
}));

// Mock @shared/schema
vi.mock('@shared/schema', () => ({
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
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-nanoid-id'),
}));

// Import dos handlers que serao criados pelo Implementer
import {
  handleListSessions,
  handleGetSessionMessages,
  handleArchiveSession,
  handleDeleteSession,
} from '../../../server/routes/coach';

// =============================================================================
// Helpers
// =============================================================================

function createMockReq(overrides: any = {}) {
  return {
    headers: { authorization: 'Bearer valid-token' },
    query: {},
    params: {},
    user: {
      id: 'user-id-1',
      userPlatformId: 'USER-0001',
    },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

// Mock storage
const mockCoachStorage = {
  listSessions: vi.fn(),
  getSession: vi.fn(),
  getSessionMessages: vi.fn(),
  countSessionMessages: vi.fn(),
  archiveSession: vi.fn(),
  deleteSession: vi.fn(),
};

// =============================================================================
// GET /api/coach/sessions
// =============================================================================

describe('GET /api/coach/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar sessoes filtradas por coachType', async () => {
    const sessions = [
      {
        id: 'session-1',
        coachType: 'mental',
        title: 'Sessao sobre tilt',
        status: 'active',
        messageCount: 12,
        tokenCount: 4500,
        createdAt: '2026-04-08T14:30:00.000Z',
        updatedAt: '2026-04-08T15:45:00.000Z',
      },
      {
        id: 'session-2',
        coachType: 'mental',
        title: 'Preparacao mental',
        status: 'archived',
        messageCount: 8,
        tokenCount: 3200,
        createdAt: '2026-04-05T10:00:00.000Z',
        updatedAt: '2026-04-05T11:20:00.000Z',
      },
    ];
    mockCoachStorage.listSessions.mockResolvedValue(sessions);

    const req = createMockReq({ query: { coachType: 'mental' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    expect(res.json).toHaveBeenCalledWith(sessions);
    expect(mockCoachStorage.listSessions).toHaveBeenCalledWith('USER-0001', 'mental');
  });

  it('deve retornar sessoes ordenadas por updatedAt DESC', async () => {
    const sessions = [
      { id: 'session-newer', updatedAt: '2026-04-08T15:45:00.000Z' },
      { id: 'session-older', updatedAt: '2026-04-05T11:20:00.000Z' },
    ];
    mockCoachStorage.listSessions.mockResolvedValue(sessions);

    const req = createMockReq({ query: { coachType: 'tournament' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    const result = res.body;
    expect(result[0].id).toBe('session-newer');
    expect(result[1].id).toBe('session-older');
  });

  it('nao deve retornar sessoes com status "deleted"', async () => {
    mockCoachStorage.listSessions.mockResolvedValue([
      { id: 'session-active', status: 'active' },
      { id: 'session-archived', status: 'archived' },
      // Nenhuma com status 'deleted' — o storage filtra
    ]);

    const req = createMockReq({ query: { coachType: 'mental' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    const result = res.body;
    const deletedSessions = result.filter((s: any) => s.status === 'deleted');
    expect(deletedSessions).toHaveLength(0);
  });

  it('nao deve incluir campo summary no response (economia de payload)', async () => {
    mockCoachStorage.listSessions.mockResolvedValue([
      {
        id: 'session-1',
        coachType: 'mental',
        title: 'Sessao',
        status: 'active',
        messageCount: 5,
        tokenCount: 1000,
        // sem campo summary
      },
    ]);

    const req = createMockReq({ query: { coachType: 'mental' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    const result = res.body;
    expect(result[0]).not.toHaveProperty('summary');
  });

  it('deve retornar 400 para coachType invalido', async () => {
    const req = createMockReq({ query: { coachType: 'invalid' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('deve retornar 400 quando coachType nao fornecido', async () => {
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('deve retornar 401 quando usuario nao autenticado', async () => {
    const req = createMockReq({ user: undefined, query: { coachType: 'mental' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('deve retornar array vazio quando nao ha sessoes', async () => {
    mockCoachStorage.listSessions.mockResolvedValue([]);

    const req = createMockReq({ query: { coachType: 'technical' } });
    const res = createMockRes();

    await handleListSessions(req, res, mockCoachStorage);

    expect(res.json).toHaveBeenCalledWith([]);
  });
});

// =============================================================================
// GET /api/coach/sessions/:id/messages
// =============================================================================

describe('GET /api/coach/sessions/:id/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-123',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'active',
    });
    mockCoachStorage.getSessionMessages.mockResolvedValue([]);
    mockCoachStorage.countSessionMessages.mockResolvedValue(0);
  });

  it('deve retornar mensagens paginadas com total, limit e offset', async () => {
    const messages = [
      { id: 'msg-1', role: 'user', content: 'Pergunta', tokenCount: 10, createdAt: '2026-04-08T14:30:00.000Z' },
      { id: 'msg-2', role: 'assistant', content: 'Resposta', tokenCount: 50, createdAt: '2026-04-08T14:30:05.000Z' },
    ];
    mockCoachStorage.getSessionMessages.mockResolvedValue(messages);
    mockCoachStorage.countSessionMessages.mockResolvedValue(12);

    const req = createMockReq({
      params: { id: 'session-123' },
      query: { limit: '50', offset: '0' },
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(res.json).toHaveBeenCalledWith({
      messages,
      total: 12,
      limit: 50,
      offset: 0,
    });
  });

  it('deve usar limit padrao de 50 quando nao fornecido', async () => {
    mockCoachStorage.getSessionMessages.mockResolvedValue([]);
    mockCoachStorage.countSessionMessages.mockResolvedValue(0);

    const req = createMockReq({
      params: { id: 'session-123' },
      query: {},
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(mockCoachStorage.getSessionMessages).toHaveBeenCalledWith(
      'session-123',
      50, // default limit
      0,  // default offset
    );
  });

  it('deve respeitar limit maximo de 100', async () => {
    mockCoachStorage.getSessionMessages.mockResolvedValue([]);
    mockCoachStorage.countSessionMessages.mockResolvedValue(0);

    const req = createMockReq({
      params: { id: 'session-123' },
      query: { limit: '200' }, // Acima do maximo
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(mockCoachStorage.getSessionMessages).toHaveBeenCalledWith(
      'session-123',
      100, // capped at max
      0,
    );
  });

  it('deve retornar mensagens ordenadas por createdAt ASC', async () => {
    const messages = [
      { id: 'msg-older', createdAt: '2026-04-08T14:30:00.000Z' },
      { id: 'msg-newer', createdAt: '2026-04-08T14:35:00.000Z' },
    ];
    mockCoachStorage.getSessionMessages.mockResolvedValue(messages);
    mockCoachStorage.countSessionMessages.mockResolvedValue(2);

    const req = createMockReq({
      params: { id: 'session-123' },
      query: {},
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    const result = res.body;
    expect(result.messages[0].id).toBe('msg-older');
    expect(result.messages[1].id).toBe('msg-newer');
  });

  it('deve retornar 403 quando sessao pertence a outro usuario', async () => {
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-other',
      userId: 'USER-9999', // Outro usuario
      coachType: 'mental',
      status: 'active',
    });

    const req = createMockReq({
      params: { id: 'session-other' },
      query: {},
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deve retornar 404 quando sessao nao encontrada', async () => {
    mockCoachStorage.getSession.mockResolvedValue(null);

    const req = createMockReq({
      params: { id: 'session-nao-existe' },
      query: {},
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deve retornar 401 quando usuario nao autenticado', async () => {
    const req = createMockReq({
      user: undefined,
      params: { id: 'session-123' },
      query: {},
    });
    const res = createMockRes();

    await handleGetSessionMessages(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// =============================================================================
// POST /api/coach/sessions/:id/archive
// =============================================================================

describe('POST /api/coach/sessions/:id/archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-123',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'active',
    });
    mockCoachStorage.archiveSession.mockResolvedValue(undefined);
  });

  it('deve arquivar sessao e retornar 200 com confirmacao', async () => {
    const req = createMockReq({ params: { id: 'session-123' } });
    const res = createMockRes();

    await handleArchiveSession(req, res, mockCoachStorage);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('arquivada'),
        id: 'session-123',
      })
    );
    expect(mockCoachStorage.archiveSession).toHaveBeenCalledWith('session-123');
  });

  it('deve retornar 403 quando sessao pertence a outro usuario', async () => {
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-other',
      userId: 'USER-9999',
      coachType: 'mental',
      status: 'active',
    });

    const req = createMockReq({ params: { id: 'session-other' } });
    const res = createMockRes();

    await handleArchiveSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deve retornar 404 quando sessao nao encontrada', async () => {
    mockCoachStorage.getSession.mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'session-inexistente' } });
    const res = createMockRes();

    await handleArchiveSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deve retornar 409 quando sessao ja esta arquivada', async () => {
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-123',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'archived', // Ja arquivada
    });

    const req = createMockReq({ params: { id: 'session-123' } });
    const res = createMockRes();

    await handleArchiveSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('deve retornar 401 quando usuario nao autenticado', async () => {
    const req = createMockReq({ user: undefined, params: { id: 'session-123' } });
    const res = createMockRes();

    await handleArchiveSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// =============================================================================
// DELETE /api/coach/sessions/:id
// =============================================================================

describe('DELETE /api/coach/sessions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-123',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'active',
    });
    mockCoachStorage.deleteSession.mockResolvedValue(undefined);
  });

  it('deve fazer soft delete e retornar 200 com confirmacao', async () => {
    const req = createMockReq({ params: { id: 'session-123' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('removida'),
        id: 'session-123',
      })
    );
    expect(mockCoachStorage.deleteSession).toHaveBeenCalledWith('session-123');
  });

  it('deve mudar status para "deleted" (soft delete, nao apaga do banco)', async () => {
    const req = createMockReq({ params: { id: 'session-123' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    // O storage.deleteSession deve mudar status para 'deleted', nao remover a row
    expect(mockCoachStorage.deleteSession).toHaveBeenCalledWith('session-123');
  });

  it('deve retornar 403 quando sessao pertence a outro usuario', async () => {
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-other',
      userId: 'USER-9999',
      coachType: 'mental',
      status: 'active',
    });

    const req = createMockReq({ params: { id: 'session-other' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deve retornar 404 quando sessao nao encontrada', async () => {
    mockCoachStorage.getSession.mockResolvedValue(null);

    const req = createMockReq({ params: { id: 'session-inexistente' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deve retornar 401 quando usuario nao autenticado', async () => {
    const req = createMockReq({ user: undefined, params: { id: 'session-123' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('deve permitir deletar sessao ja arquivada', async () => {
    mockCoachStorage.getSession.mockResolvedValue({
      id: 'session-archived',
      userId: 'USER-0001',
      coachType: 'mental',
      status: 'archived',
    });

    const req = createMockReq({ params: { id: 'session-archived' } });
    const res = createMockRes();

    await handleDeleteSession(req, res, mockCoachStorage);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockCoachStorage.deleteSession).toHaveBeenCalledWith('session-archived');
  });
});
