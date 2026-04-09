import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Schemas Zod do AI Coach
//
// Estes testes validam os schemas de insert para chat_sessions e chat_messages,
// alem do schema de request do endpoint POST /api/coach/chat.
//
// Os schemas AINDA NAO EXISTEM em shared/schema.ts — o Implementer ira cria-los.
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// Imports que serao criados pelo Implementer em shared/schema.ts
import {
  insertChatSessionSchema,
  insertChatMessageSchema,
  chatMessageRequestSchema,
} from '../../../shared/schema';

// =============================================================================
// chat_sessions — insert schema
// =============================================================================

describe('insertChatSessionSchema', () => {
  describe('dados validos', () => {
    it('deve aceitar sessao com todos os campos obrigatorios', () => {
      const data = {
        userId: 'USER-0001',
        coachType: 'mental',
      };

      const result = insertChatSessionSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('deve aceitar sessao com todos os campos preenchidos', () => {
      const data = {
        userId: 'USER-0001',
        coachType: 'tournament',
        title: 'Sessao sobre game selection',
        status: 'active',
        summary: 'Resumo da sessao anterior',
        tokenCount: 500,
        messageCount: 10,
      };

      const result = insertChatSessionSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe('coachType enum', () => {
    it('deve aceitar coachType "mental"', () => {
      const data = { userId: 'USER-0001', coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar coachType "tournament"', () => {
      const data = { userId: 'USER-0001', coachType: 'tournament' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar coachType "technical"', () => {
      const data = { userId: 'USER-0001', coachType: 'technical' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar coachType invalido "strategy"', () => {
      const data = { userId: 'USER-0001', coachType: 'strategy' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar coachType vazio', () => {
      const data = { userId: 'USER-0001', coachType: '' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar coachType numerico', () => {
      const data = { userId: 'USER-0001', coachType: 1 };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('status enum', () => {
    it('deve aceitar status "active"', () => {
      const data = { userId: 'USER-0001', coachType: 'mental', status: 'active' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar status "archived"', () => {
      const data = { userId: 'USER-0001', coachType: 'mental', status: 'archived' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar status "deleted"', () => {
      const data = { userId: 'USER-0001', coachType: 'mental', status: 'deleted' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar status invalido "paused"', () => {
      const data = { userId: 'USER-0001', coachType: 'mental', status: 'paused' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('campos obrigatorios', () => {
    it('deve rejeitar quando userId esta ausente', () => {
      const data = { coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar quando coachType esta ausente', () => {
      const data = { userId: 'USER-0001' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('campos opcionais', () => {
    it('deve aceitar sem title (auto-gerado da 1a mensagem)', () => {
      const data = { userId: 'USER-0001', coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem summary (preenchido pela Spec 3)', () => {
      const data = { userId: 'USER-0001', coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem tokenCount (default 0)', () => {
      const data = { userId: 'USER-0001', coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem messageCount (default 0)', () => {
      const data = { userId: 'USER-0001', coachType: 'mental' };
      const result = insertChatSessionSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// chat_messages — insert schema
// =============================================================================

describe('insertChatMessageSchema', () => {
  describe('dados validos', () => {
    it('deve aceitar mensagem com campos obrigatorios', () => {
      const data = {
        sessionId: 'session-abc123',
        role: 'user',
        content: 'Como melhorar meu jogo em PKOs?',
      };

      const result = insertChatMessageSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('deve aceitar mensagem com todos os campos preenchidos', () => {
      const data = {
        sessionId: 'session-abc123',
        role: 'assistant',
        content: 'Analisando seus dados de PKO...',
        tokenCount: 250,
        metadata: {
          model: 'claude-sonnet-4-5-20250514',
          latency_ms: 1850,
        },
      };

      const result = insertChatMessageSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe('role enum', () => {
    it('deve aceitar role "user"', () => {
      const data = { sessionId: 'session-abc123', role: 'user', content: 'Ola' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar role "assistant"', () => {
      const data = { sessionId: 'session-abc123', role: 'assistant', content: 'Resposta' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar role "system"', () => {
      const data = { sessionId: 'session-abc123', role: 'system', content: 'Prompt' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar role "admin"', () => {
      const data = { sessionId: 'session-abc123', role: 'admin', content: 'Msg' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar role vazio', () => {
      const data = { sessionId: 'session-abc123', role: '', content: 'Msg' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('campos obrigatorios', () => {
    it('deve rejeitar quando sessionId esta ausente', () => {
      const data = { role: 'user', content: 'Mensagem' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar quando role esta ausente', () => {
      const data = { sessionId: 'session-abc123', content: 'Mensagem' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar quando content esta ausente', () => {
      const data = { sessionId: 'session-abc123', role: 'user' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar content vazio', () => {
      const data = { sessionId: 'session-abc123', role: 'user', content: '' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('campos opcionais', () => {
    it('deve aceitar sem tokenCount (default 0)', () => {
      const data = { sessionId: 'session-abc123', role: 'user', content: 'Msg' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar sem metadata (nullable)', () => {
      const data = { sessionId: 'session-abc123', role: 'user', content: 'Msg' };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar metadata como objeto JSON arbitrario', () => {
      const data = {
        sessionId: 'session-abc123',
        role: 'assistant',
        content: 'Resposta',
        metadata: { model: 'claude-sonnet-4-5-20250514', latency_ms: 1200, error: null },
      };
      const result = insertChatMessageSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// chatMessageRequestSchema — schema de request do POST /api/coach/chat
// =============================================================================

describe('chatMessageRequestSchema', () => {
  describe('dados validos', () => {
    it('deve aceitar request com coachType e message', () => {
      const data = {
        coachType: 'mental',
        message: 'Como lidar com tilt?',
      };

      const result = chatMessageRequestSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('deve aceitar request com sessionId opcional', () => {
      const data = {
        coachType: 'tournament',
        message: 'Quais torneios devo jogar hoje?',
        sessionId: 'session-abc123',
      };

      const result = chatMessageRequestSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe('coachType validation', () => {
    it('deve aceitar coachType "mental"', () => {
      const data = { coachType: 'mental', message: 'Msg' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar coachType "tournament"', () => {
      const data = { coachType: 'tournament', message: 'Msg' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar coachType "technical"', () => {
      const data = { coachType: 'technical', message: 'Msg' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar coachType invalido', () => {
      const data = { coachType: 'financial', message: 'Msg' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar coachType ausente', () => {
      const data = { message: 'Msg' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('message validation', () => {
    it('deve rejeitar mensagem vazia', () => {
      const data = { coachType: 'mental', message: '' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar mensagem ausente', () => {
      const data = { coachType: 'mental' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve aceitar mensagem com exatamente 2000 caracteres (limite)', () => {
      const data = { coachType: 'mental', message: 'a'.repeat(2000) };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar mensagem com 2001 caracteres (acima do limite)', () => {
      const data = { coachType: 'mental', message: 'a'.repeat(2001) };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve aceitar mensagem com 1 caractere (minimo)', () => {
      const data = { coachType: 'mental', message: 'a' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('sessionId validation', () => {
    it('deve aceitar sem sessionId (sessao criada automaticamente)', () => {
      const data = { coachType: 'mental', message: 'Ola' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar sessionId como string', () => {
      const data = { coachType: 'mental', message: 'Ola', sessionId: 'abc123' };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar sessionId numerico', () => {
      const data = { coachType: 'mental', message: 'Ola', sessionId: 123 };
      const result = chatMessageRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
