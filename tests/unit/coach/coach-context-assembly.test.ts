import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Pipeline de Montagem de Contexto do AI Coach
//
// Testa o modulo server/coachContext.ts que monta o array de messages
// no formato da Claude API para enviar ao LLM.
//
// O modulo AINDA NAO EXISTE — o Implementer ira cria-lo.
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// Mock do database
vi.mock('../../../server/db', () => ({
  db: {},
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

// Mock @shared/schema
vi.mock('@shared/schema', () => ({
  users: {},
  tournaments: {},
  chatSessions: {},
  chatMessages: {},
}));

// Import do modulo de contexto que sera criado pelo Implementer
import { assembleContext } from '../../../server/coachContext';

// =============================================================================
// Tipos esperados — o Implementer definira estes tipos
// =============================================================================

type CoachType = 'mental' | 'tournament' | 'technical';

interface ContextInput {
  coachType: CoachType;
  userId: string;
  message: string;
  sessionId: string;
}

interface UserProfile {
  name: string;
  subscriptionPlan: string;
  createdAt: string;
  totalTournaments: number;
}

interface StatsSnapshot {
  roi: number;
  profit: number;
  volume: number;
  abi: number;
}

// =============================================================================
// Mock dos data loaders que alimentam o contexto
// =============================================================================

const mockDataLoaders = {
  getUserProfile: vi.fn(),
  getStatsSnapshot: vi.fn(),
  getLastArchivedSessionSummary: vi.fn(),
  getSessionHistory: vi.fn(),
  getSystemPrompt: vi.fn(),
};

// =============================================================================
// Dados de teste
// =============================================================================

const defaultUserProfile: UserProfile = {
  name: 'Test Player',
  subscriptionPlan: 'active',
  createdAt: '2025-01-15',
  totalTournaments: 1500,
};

const defaultStats: StatsSnapshot = {
  roi: 18.5,
  profit: 25000,
  volume: 1500,
  abi: 45,
};

const defaultHistory = [
  { role: 'user' as const, content: 'Mensagem anterior do usuario' },
  { role: 'assistant' as const, content: 'Resposta anterior do coach' },
];

// =============================================================================
// TESTES
// =============================================================================

describe('assembleContext — pipeline de montagem de contexto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataLoaders.getSystemPrompt.mockReturnValue(
      'Voce e um coach de poker especializado em mental game.'
    );
    mockDataLoaders.getUserProfile.mockResolvedValue(defaultUserProfile);
    mockDataLoaders.getStatsSnapshot.mockResolvedValue(defaultStats);
    mockDataLoaders.getLastArchivedSessionSummary.mockResolvedValue(null);
    mockDataLoaders.getSessionHistory.mockResolvedValue(defaultHistory);
  });

  describe('formato de saida', () => {
    it('deve retornar um objeto com system prompt e array de messages no formato Claude API', async () => {
      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Como lidar com tilt?',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // Formato Claude API: { system: string, messages: [{role, content}] }
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it('cada elemento do array messages deve ter role e content', async () => {
      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Pergunta',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      for (const msg of result.messages) {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(typeof msg.role).toBe('string');
        expect(typeof msg.content).toBe('string');
      }
    });
  });

  describe('system prompt', () => {
    it('deve incluir system prompt como campo separado (formato Claude API)', async () => {
      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Ola',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(result.system).toBeDefined();
      expect(typeof result.system).toBe('string');
      expect(result.system.length).toBeGreaterThan(0);
    });

    it('deve usar o system prompt do coachType fornecido', async () => {
      mockDataLoaders.getSystemPrompt.mockReturnValue('Prompt para coach tecnico');

      const result = await assembleContext(
        {
          coachType: 'technical',
          userId: 'USER-0001',
          message: 'Pergunta tecnica',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getSystemPrompt).toHaveBeenCalledWith('technical');
      expect(result.system).toContain('Prompt para coach tecnico');
    });
  });

  describe('perfil do usuario', () => {
    it('deve incluir dados do perfil do usuario no system prompt', async () => {
      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Pergunta',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getUserProfile).toHaveBeenCalledWith('USER-0001');
      // O perfil deve estar no system prompt ou como mensagem de contexto
      const fullContext = result.system + result.messages.map((m: any) => m.content).join(' ');
      expect(fullContext).toContain('Test Player');
    });
  });

  describe('stats snapshot', () => {
    it('deve incluir stats do usuario no contexto', async () => {
      const result = await assembleContext(
        {
          coachType: 'tournament',
          userId: 'USER-0001',
          message: 'Quais torneios jogar?',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getStatsSnapshot).toHaveBeenCalledWith('USER-0001');
      const fullContext = result.system + result.messages.map((m: any) => m.content).join(' ');
      // Deve conter pelo menos um dos stats
      expect(fullContext).toMatch(/ROI|roi|18\.5/);
    });

    it('deve funcionar com stats vazias (usuario sem torneios)', async () => {
      mockDataLoaders.getStatsSnapshot.mockResolvedValue({
        roi: 0,
        profit: 0,
        volume: 0,
        abi: 0,
      });

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Ola',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // Deve retornar contexto valido mesmo sem stats
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('messages');
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  describe('resumo da sessao anterior', () => {
    it('deve incluir resumo da sessao anterior quando disponivel', async () => {
      mockDataLoaders.getLastArchivedSessionSummary.mockResolvedValue(
        'Na sessao anterior, discutimos tecnicas de respiracao para controle de tilt.'
      );

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Como estamos na tecnica?',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getLastArchivedSessionSummary).toHaveBeenCalledWith(
        'USER-0001',
        'mental'
      );
      const fullContext = result.system + result.messages.map((m: any) => m.content).join(' ');
      expect(fullContext).toContain('respiracao');
    });

    it('deve funcionar sem resumo de sessao anterior (primeira conversa)', async () => {
      mockDataLoaders.getLastArchivedSessionSummary.mockResolvedValue(null);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Primeira mensagem',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(result).toHaveProperty('messages');
      expect(result.messages.length).toBeGreaterThan(0);
    });
  });

  describe('historico da sessao atual', () => {
    it('deve incluir historico de mensagens da sessao atual', async () => {
      const history = [
        { role: 'user', content: 'Oi, estou tiltado' },
        { role: 'assistant', content: 'Vamos trabalhar isso. Me conta o que aconteceu.' },
      ];
      mockDataLoaders.getSessionHistory.mockResolvedValue(history);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Perdi 3 flips seguidos',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getSessionHistory).toHaveBeenCalledWith('session-123');
      // Historico deve estar nas messages
      const userMessages = result.messages.filter((m: any) => m.role === 'user');
      const assistantMessages = result.messages.filter((m: any) => m.role === 'assistant');
      expect(userMessages.length).toBeGreaterThanOrEqual(2); // historico + mensagem atual
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1); // historico
    });

    it('deve limitar historico a 20 mensagens', async () => {
      // Cria 30 mensagens de historico (15 pares user/assistant)
      const longHistory = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Mensagem ${i + 1}`,
      }));
      mockDataLoaders.getSessionHistory.mockResolvedValue(longHistory);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Nova mensagem',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // O historico no contexto deve conter no maximo 20 mensagens do historico
      // + 1 mensagem atual do usuario = 21 mensagens no array messages
      // (as mais recentes do historico sao mantidas)
      const historyMessages = result.messages.length;
      expect(historyMessages).toBeLessThanOrEqual(21); // 20 historico + 1 atual
    });

    it('deve manter as mensagens mais recentes ao truncar historico', async () => {
      const longHistory = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Mensagem ${i + 1}`,
      }));
      mockDataLoaders.getSessionHistory.mockResolvedValue(longHistory);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Ultima mensagem',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // A ultima mensagem do historico (Mensagem 30) deve estar presente
      const contents = result.messages.map((m: any) => m.content);
      expect(contents).toContain('Mensagem 30');
      // A primeira mensagem (Mensagem 1) pode ter sido removida
    });
  });

  describe('mensagem atual do usuario', () => {
    it('deve incluir a mensagem atual como ultimo elemento do array', async () => {
      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Esta e a pergunta atual',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      const lastMessage = result.messages[result.messages.length - 1];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.content).toBe('Esta e a pergunta atual');
    });
  });

  describe('contexto por coachType', () => {
    it('deve usar system prompt especifico para coach mental', async () => {
      await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Msg',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getSystemPrompt).toHaveBeenCalledWith('mental');
    });

    it('deve usar system prompt especifico para coach tournament', async () => {
      await assembleContext(
        {
          coachType: 'tournament',
          userId: 'USER-0001',
          message: 'Msg',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getSystemPrompt).toHaveBeenCalledWith('tournament');
    });

    it('deve usar system prompt especifico para coach technical', async () => {
      await assembleContext(
        {
          coachType: 'technical',
          userId: 'USER-0001',
          message: 'Msg',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      expect(mockDataLoaders.getSystemPrompt).toHaveBeenCalledWith('technical');
    });
  });

  describe('ordem das camadas do contexto', () => {
    it('deve montar contexto na ordem: system prompt, [perfil+stats no system], historico, mensagem atual', async () => {
      const history = [
        { role: 'user', content: 'Msg historico' },
        { role: 'assistant', content: 'Resposta historico' },
      ];
      mockDataLoaders.getSessionHistory.mockResolvedValue(history);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Mensagem atual',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // System prompt deve estar no campo system (nao no array messages)
      expect(result.system).toBeDefined();
      expect(result.system.length).toBeGreaterThan(0);

      // Messages deve terminar com a mensagem atual do usuario
      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toBe('Mensagem atual');

      // Historico deve vir antes da mensagem atual
      const contents = result.messages.map((m: any) => m.content);
      const historyIdx = contents.indexOf('Msg historico');
      const currentIdx = contents.indexOf('Mensagem atual');
      expect(historyIdx).toBeLessThan(currentIdx);
    });
  });

  describe('edge cases', () => {
    it('deve funcionar com sessao nova (sem historico)', async () => {
      mockDataLoaders.getSessionHistory.mockResolvedValue([]);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Primeira mensagem',
          sessionId: 'session-new',
        },
        mockDataLoaders
      );

      expect(result.messages).toHaveLength(1); // Apenas a mensagem atual
      expect(result.messages[0].content).toBe('Primeira mensagem');
    });

    it('deve funcionar com perfil nulo (usuario sem dados)', async () => {
      mockDataLoaders.getUserProfile.mockResolvedValue(null);

      const result = await assembleContext(
        {
          coachType: 'mental',
          userId: 'USER-0001',
          message: 'Ola',
          sessionId: 'session-123',
        },
        mockDataLoaders
      );

      // Deve retornar contexto valido mesmo sem perfil
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('messages');
    });
  });
});
