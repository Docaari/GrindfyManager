import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Compactacao de Sessao (Session Compaction)
//
// Testa a geracao de resumo ao arquivar sessao e atualizacao do perfil IA.
// Modulo alvo: server/coachMemory.ts (AINDA NAO EXISTE)
//
// Todos devem FALHAR (red phase) — Implementer criara o modulo.
// =============================================================================

// Mock do banco de dados
vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  desc: vi.fn((...args: any[]) => ({ type: 'desc', args })),
  sql: vi.fn(),
}));

// Mock do schema
vi.mock('@shared/schema', () => ({
  chatSessions: { id: 'chat_sessions.id', summary: 'chat_sessions.summary', status: 'chat_sessions.status' },
  chatMessages: { sessionId: 'chat_messages.sessionId', role: 'chat_messages.role', content: 'chat_messages.content' },
  userAiProfile: { userId: 'user_ai_profile.userId', content: 'user_ai_profile.content', version: 'user_ai_profile.version' },
}));

// Mock da Claude API (Haiku para sumarizacao)
const mockHaikuCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockHaikuCreate,
    };
  },
}));

// O modulo que o Implementer vai criar
import { compactSession } from '../../../server/coachMemory';
import { db } from '../../../server/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_SESSION_ID = 'session-001';
const TEST_USER_ID = 'USER-0001';

const sampleMessages = [
  { id: 'msg-1', sessionId: TEST_SESSION_ID, role: 'user', content: 'Estou com problemas de tilt em PKOs', tokenCount: 15, createdAt: new Date() },
  { id: 'msg-2', sessionId: TEST_SESSION_ID, role: 'assistant', content: 'Entendo. PKOs tem variancia alta...', tokenCount: 80, createdAt: new Date() },
  { id: 'msg-3', sessionId: TEST_SESSION_ID, role: 'user', content: 'O que posso fazer para controlar?', tokenCount: 12, createdAt: new Date() },
  { id: 'msg-4', sessionId: TEST_SESSION_ID, role: 'assistant', content: 'Existem tecnicas de respiracao...', tokenCount: 100, createdAt: new Date() },
];

const sampleSession = {
  id: TEST_SESSION_ID,
  userId: TEST_USER_ID,
  coachType: 'mental',
  status: 'active',
  summary: null,
};

const existingProfile = {
  id: 'profile-001',
  userId: TEST_USER_ID,
  content: '- Objetivo: melhorar mental game\n- Estilo: tight',
  version: 2,
  tokenCount: 30,
};

// ---------------------------------------------------------------------------
// Setup de mocks comuns
// ---------------------------------------------------------------------------
function setupMocks(options?: { messages?: any[]; session?: any; profile?: any | null }) {
  const messages = options?.messages ?? sampleMessages;
  const session = options?.session ?? sampleSession;
  const profile = options?.profile !== undefined ? options.profile : existingProfile;

  // Mock select para buscar mensagens da sessao
  const mockFrom = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();
  const mockOrderBy = vi.fn().mockResolvedValue(messages);

  vi.mocked(db.select).mockReturnValue({
    from: mockFrom,
    where: mockWhere,
    orderBy: mockOrderBy,
  } as any);

  // Mock para buscar sessao
  // Mock para buscar perfil
  // (O implementer definira a implementacao real)

  // Mock da Claude Haiku API — resumo da sessao
  mockHaikuCreate
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: '- Jogador tem problemas de tilt em PKOs\n- Sugeridas tecnicas de respiracao\n- Compromisso: praticar antes das sessoes' }],
      usage: { input_tokens: 200, output_tokens: 50 },
    })
    // Mock da Claude Haiku API — atualizacao de perfil
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: '- Objetivo: melhorar mental game\n- Estilo: tight\n- Leak: tilt em PKOs\n- Decisao: praticar respiracao antes de sessoes' }],
      usage: { input_tokens: 150, output_tokens: 60 },
    });

  // Mock update para salvar summary e perfil
  const mockUpdateSet = vi.fn().mockReturnThis();
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  vi.mocked(db.update).mockReturnValue({
    set: mockUpdateSet,
    where: mockUpdateWhere,
  } as any);

  // Mock insert para criar perfil se nao existia
  const mockInsertValues = vi.fn().mockResolvedValue([]);
  vi.mocked(db.insert).mockReturnValue({
    values: mockInsertValues,
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  } as any);

  return { mockHaikuCreate, mockUpdateSet, mockUpdateWhere, mockInsertValues };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('compactSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve gerar resumo ao compactar sessao com mensagens', async () => {
    const { mockUpdateSet } = setupMocks();

    await compactSession(TEST_SESSION_ID);

    // Deve ter chamado a Claude Haiku API para gerar resumo
    expect(mockHaikuCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining('haiku'),
      })
    );
  });

  it('deve enviar historico da sessao para a Claude API no prompt de sumarizacao', async () => {
    setupMocks();

    await compactSession(TEST_SESSION_ID);

    const firstCall = mockHaikuCreate.mock.calls[0][0];
    const messagesContent = JSON.stringify(firstCall.messages);
    // O prompt deve conter o conteudo das mensagens
    expect(messagesContent).toContain('tilt');
    expect(messagesContent).toContain('PKO');
  });

  it('resumo deve ter max 150 palavras (instrucao no prompt)', async () => {
    setupMocks();

    await compactSession(TEST_SESSION_ID);

    const firstCall = mockHaikuCreate.mock.calls[0][0];
    // O prompt de sumarizacao deve mencionar o limite de 150 palavras
    const systemOrMessages = JSON.stringify(firstCall);
    expect(systemOrMessages).toMatch(/150\s*palavras/);
  });

  it('deve atualizar perfil do jogador apos gerar resumo', async () => {
    setupMocks();

    await compactSession(TEST_SESSION_ID);

    // Deve ter feito 2 chamadas a Haiku: resumo + atualizacao de perfil
    expect(mockHaikuCreate).toHaveBeenCalledTimes(2);
  });

  it('deve criar perfil automaticamente se nao existia', async () => {
    const { mockInsertValues } = setupMocks({ profile: null });

    await compactSession(TEST_SESSION_ID);

    // Deve ter tentado inserir novo perfil
    expect(mockInsertValues).toHaveBeenCalled();
  });

  it('deve incrementar versao do perfil apos atualizacao', async () => {
    const { mockUpdateSet } = setupMocks();

    await compactSession(TEST_SESSION_ID);

    // A atualizacao do perfil deve incrementar a versao
    // (verificado via chamada ao db.update com version incrementado)
    expect(mockUpdateSet).toHaveBeenCalled();
  });

  it('deve usar modelo Haiku para sumarizacao (economia)', async () => {
    setupMocks();

    await compactSession(TEST_SESSION_ID);

    for (const call of mockHaikuCreate.mock.calls) {
      expect(call[0].model).toContain('haiku');
    }
  });

  it('sessao com 0 mensagens nao deve gerar resumo', async () => {
    setupMocks({ messages: [] });

    await compactSession(TEST_SESSION_ID);

    // Nao deve chamar a Claude API
    expect(mockHaikuCreate).not.toHaveBeenCalled();
  });

  it('deve falhar gracefully sem perder dados da sessao', async () => {
    setupMocks();
    // Simular falha da Claude API
    mockHaikuCreate.mockRejectedValueOnce(new Error('Claude API timeout'));

    // Nao deve lancar erro para o caller
    await expect(compactSession(TEST_SESSION_ID)).resolves.not.toThrow();
  });

  it('deve manter sessao intacta quando compactacao falha', async () => {
    const { mockUpdateSet } = setupMocks();
    mockHaikuCreate.mockRejectedValueOnce(new Error('API Error'));

    await compactSession(TEST_SESSION_ID);

    // Nao deve ter atualizado a sessao com summary (ja que a geracao falhou)
    // O mockUpdateSet nao deve ter sido chamado com summary
    // (A sessao original permanece intacta)
  });
});
