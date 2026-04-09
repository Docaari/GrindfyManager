import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Compactacao Mensal
//
// Testa a compactacao lazy de sessoes do mes anterior em resumo mensal.
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
    delete: vi.fn(),
    query: vi.fn(),
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  lt: vi.fn((...args: any[]) => ({ type: 'lt', args })),
  between: vi.fn((...args: any[]) => ({ type: 'between', args })),
  desc: vi.fn((...args: any[]) => ({ type: 'desc', args })),
  inArray: vi.fn((...args: any[]) => ({ type: 'inArray', args })),
  isNotNull: vi.fn((...args: any[]) => ({ type: 'isNotNull', args })),
  sql: vi.fn(),
}));

// Mock do schema
vi.mock('@shared/schema', () => ({
  chatSessions: { id: 'chat_sessions.id', userId: 'chat_sessions.userId', coachType: 'chat_sessions.coachType', status: 'chat_sessions.status', summary: 'chat_sessions.summary', createdAt: 'chat_sessions.createdAt' },
  chatMessages: { sessionId: 'chat_messages.sessionId', createdAt: 'chat_messages.createdAt' },
  monthlyCoachSummaries: { userId: 'monthly_coach_summaries.userId', coachType: 'monthly_coach_summaries.coachType', month: 'monthly_coach_summaries.month' },
}));

// Mock da Claude API (Haiku)
const mockHaikuCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockHaikuCreate,
    };
  },
}));

// O modulo que o Implementer vai criar
import { checkMonthlyCompaction } from '../../../server/coachMemory';
import { db } from '../../../server/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEST_USER_ID = 'USER-0001';
const COACH_TYPE = 'mental';

const archivedSessions = [
  { id: 'session-001', summary: 'Jogador trabalhou tilt control. Comprometeu-se com respiracao.' },
  { id: 'session-002', summary: 'Discutido fadiga apos 4h de sessao. Sugerido breaks a cada 90min.' },
  { id: 'session-003', summary: 'Jogador relatou melhora no foco. Praticou meditacao antes de jogar.' },
];

// ---------------------------------------------------------------------------
// Setup de mocks
// ---------------------------------------------------------------------------
function setupMonthlyMocks(options?: {
  existingSummary?: boolean;
  archivedSessions?: any[];
}) {
  const hasSummary = options?.existingSummary ?? false;
  const sessions = options?.archivedSessions ?? archivedSessions;

  // Mock para verificar se resumo mensal ja existe
  const mockSelectFrom = vi.fn().mockReturnThis();
  const mockSelectWhere = vi.fn().mockReturnThis();

  // Primeira chamada: verificar se monthly_summary ja existe
  // Segunda chamada: buscar sessoes arquivadas do mes anterior
  let callCount = 0;
  const mockOrderBy = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return hasSummary ? [{ id: 'existing-summary' }] : [];
    }
    return sessions;
  });

  vi.mocked(db.select).mockReturnValue({
    from: mockSelectFrom,
    where: mockSelectWhere,
    orderBy: mockOrderBy,
  } as any);

  // Mock da Claude Haiku — resumo mensal
  mockHaikuCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Jogador evoluiu no controle emocional. Implementou rotina de respiracao e meditacao. Fadiga reduziu com breaks regulares. Foco melhorou nas ultimas sessoes.' }],
    usage: { input_tokens: 300, output_tokens: 80 },
  });

  // Mock insert (salvar resumo mensal)
  const mockInsertValues = vi.fn().mockResolvedValue([]);
  vi.mocked(db.insert).mockReturnValue({
    values: mockInsertValues,
  } as any);

  // Mock delete (limpar mensagens antigas)
  const mockDeleteWhere = vi.fn().mockResolvedValue([]);
  vi.mocked(db.delete).mockReturnValue({
    where: mockDeleteWhere,
  } as any);

  return { mockInsertValues, mockDeleteWhere };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('checkMonthlyCompaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve rodar compactacao na 1a mensagem do mes (lazy trigger)', async () => {
    const { mockInsertValues } = setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    // Deve ter gerado e salvo resumo mensal
    expect(mockInsertValues).toHaveBeenCalled();
  });

  it('deve ser idempotente — nao roda 2x para mesmo mes', async () => {
    setupMonthlyMocks({ existingSummary: true });

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    // Se ja existe resumo, nao deve chamar a Claude API
    expect(mockHaikuCreate).not.toHaveBeenCalled();
  });

  it('deve agregar resumos de todas sessoes do mes anterior', async () => {
    setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    // O prompt deve conter os summaries concatenados
    const call = mockHaikuCreate.mock.calls[0][0];
    const content = JSON.stringify(call);
    expect(content).toContain('tilt control');
    expect(content).toContain('fadiga');
    expect(content).toContain('meditacao');
  });

  it('resumo mensal deve ter max 300 palavras (instrucao no prompt)', async () => {
    setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    const call = mockHaikuCreate.mock.calls[0][0];
    const content = JSON.stringify(call);
    expect(content).toMatch(/300\s*palavras/);
  });

  it('deve usar modelo Haiku para compactacao (economia)', async () => {
    setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    expect(mockHaikuCreate.mock.calls[0][0].model).toContain('haiku');
  });

  it('deve limpar mensagens com mais de 60 dias apos compactacao', async () => {
    const { mockDeleteWhere } = setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    // Deve ter chamado delete para mensagens antigas
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it('deve salvar resumo mensal com campos corretos', async () => {
    const { mockInsertValues } = setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        coachType: COACH_TYPE,
        sessionsCompacted: 3,
      })
    );
  });

  it('deve funcionar no 1o mes (sem sessoes anteriores)', async () => {
    setupMonthlyMocks({ archivedSessions: [] });

    await checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE);

    // Sem sessoes no mes anterior, nao deve chamar a Claude API
    expect(mockHaikuCreate).not.toHaveBeenCalled();
  });

  it('deve falhar gracefully sem perder dados', async () => {
    setupMonthlyMocks();
    mockHaikuCreate.mockRejectedValueOnce(new Error('Claude API timeout'));

    // Nao deve lancar erro
    await expect(
      checkMonthlyCompaction(TEST_USER_ID, COACH_TYPE)
    ).resolves.not.toThrow();
  });

  it('compactacao para cada coachType e independente', async () => {
    const { mockInsertValues } = setupMonthlyMocks();

    await checkMonthlyCompaction(TEST_USER_ID, 'mental');
    await checkMonthlyCompaction(TEST_USER_ID, 'tournament');
    await checkMonthlyCompaction(TEST_USER_ID, 'technical');

    // Deve ter sido chamado 3 vezes (uma para cada coach)
    // O mes pode ja ter sido compactado para um coach mas nao para outro
    expect(mockInsertValues).toHaveBeenCalledTimes(3);
  });
});
