import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// =============================================================================
// Testes TDD: Validacao Zod dos novos campos enriquecidos nos schemas
//
// Os schemas serao ATUALIZADOS pelo Implementer em:
//   shared/schema.ts
//
// Campos novos em planned_tournaments e session_tournaments:
//   lateRegMinutes, startingStack, maxPlayers, gameType, blindLevelMinutes, alertMinutesBefore
//
// Campos novos em user_settings:
//   lateRegAlertMinutes, lateRegAlertEnabled, lateRegAlertSound
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import dos schemas que serao ATUALIZADOS pelo Implementer
// ---------------------------------------------------------------------------
import {
  insertPlannedTournamentSchema,
  insertSessionTournamentSchema,
} from '../../../shared/schema';

// =============================================================================
// Grupo 1: insertPlannedTournamentSchema — campos enriquecidos
// =============================================================================

describe('insertPlannedTournamentSchema — campos enriquecidos', () => {

  // -------------------------------------------------------------------------
  // Factory: dados minimos validos para planned tournament
  // -------------------------------------------------------------------------
  function makeValidPlannedTournament(overrides: Record<string, any> = {}) {
    return {
      userId: 'USER-0001',
      dayOfWeek: 4,
      site: 'Suprema',
      time: '19:00',
      type: 'PKO',
      speed: 'Normal',
      name: 'Daily $22',
      buyIn: '22',
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Schema aceita todos os 6 novos campos (5 enriquecidos + alertMinutesBefore)
  // -------------------------------------------------------------------------
  it('deve aceitar todos os 6 novos campos quando presentes e validos', () => {
    const data = makeValidPlannedTournament({
      lateRegMinutes: 60,
      startingStack: 10000,
      maxPlayers: 500,
      gameType: 'NLH',
      blindLevelMinutes: 12,
      alertMinutesBefore: 10,
    });

    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lateRegMinutes).toBe(60);
      expect(result.data.startingStack).toBe(10000);
      expect(result.data.maxPlayers).toBe(500);
      expect(result.data.gameType).toBe('NLH');
      expect(result.data.blindLevelMinutes).toBe(12);
      expect(result.data.alertMinutesBefore).toBe(10);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Campos sao opcionais — schema valida sem eles
  // -------------------------------------------------------------------------
  it('deve validar sem nenhum campo enriquecido (todos opcionais)', () => {
    const data = makeValidPlannedTournament();
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Campos aceitam null
  // -------------------------------------------------------------------------
  it('deve aceitar null para todos os campos enriquecidos', () => {
    const data = makeValidPlannedTournament({
      lateRegMinutes: null,
      startingStack: null,
      maxPlayers: null,
      gameType: null,
      blindLevelMinutes: null,
      alertMinutesBefore: null,
    });

    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. lateRegMinutes — validacao de range (0-2880, 48h cap p/ multi-flight long late regs)
  // -------------------------------------------------------------------------
  describe('lateRegMinutes — validacao', () => {
    it('deve aceitar lateRegMinutes=0 (sem late reg)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: 0 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar lateRegMinutes=2880 (limite maximo, 48h)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: 2880 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar lateRegMinutes=1395 (caso real Mini Rainmaker)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: 1395 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar lateRegMinutes=-1 (negativo)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: -1 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar lateRegMinutes=-5 (negativo)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: -5 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar lateRegMinutes=2881 (acima do max)', () => {
      const data = makeValidPlannedTournament({ lateRegMinutes: 2881 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. alertMinutesBefore — validacao de range (1-120)
  // -------------------------------------------------------------------------
  describe('alertMinutesBefore — validacao', () => {
    it('deve aceitar alertMinutesBefore=1 (limite minimo)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: 1 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar alertMinutesBefore=120 (limite maximo)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: 120 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar alertMinutesBefore=5 (valor tipico)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: 5 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar alertMinutesBefore=0 (abaixo do minimo)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: 0 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar alertMinutesBefore=-1 (negativo)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: -1 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar alertMinutesBefore=121 (acima do maximo)', () => {
      const data = makeValidPlannedTournament({ alertMinutesBefore: 121 });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. gameType — validacao de valores permitidos
  // -------------------------------------------------------------------------
  describe('gameType — validacao', () => {
    it('deve aceitar gameType="NLH"', () => {
      const data = makeValidPlannedTournament({ gameType: 'NLH' });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar gameType="PLO"', () => {
      const data = makeValidPlannedTournament({ gameType: 'PLO' });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve aceitar gameType=null', () => {
      const data = makeValidPlannedTournament({ gameType: null });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar gameType="INVALID"', () => {
      const data = makeValidPlannedTournament({ gameType: 'INVALID' });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar gameType="PLO5" (deve ser mapeado para PLO antes)', () => {
      const data = makeValidPlannedTournament({ gameType: 'PLO5' });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('deve aceitar gameType="" (string vazia) e normalizar para null (Sprint 1 RF-01)', () => {
      // Antes do Sprint 1 (Tournament Types Extension), string vazia era rejeitada,
      // contribuindo para o bug "Erro ao adicionar torneio". O preprocess agora
      // normaliza '' → null porque o form envia string vazia quando o campo
      // opcional nao e preenchido.
      const data = makeValidPlannedTournament({ gameType: '' });
      const result = insertPlannedTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gameType).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. startingStack e maxPlayers — inteiros positivos ou null
  // -------------------------------------------------------------------------
  it('deve aceitar startingStack como inteiro positivo', () => {
    const data = makeValidPlannedTournament({ startingStack: 15000 });
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar maxPlayers como inteiro positivo', () => {
    const data = makeValidPlannedTournament({ maxPlayers: 1000 });
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar blindLevelMinutes como inteiro positivo', () => {
    const data = makeValidPlannedTournament({ blindLevelMinutes: 15 });
    const result = insertPlannedTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Grupo 2: insertSessionTournamentSchema — mesmos campos enriquecidos
// =============================================================================

describe('insertSessionTournamentSchema — campos enriquecidos', () => {

  // -------------------------------------------------------------------------
  // Factory: dados minimos validos para session tournament
  // -------------------------------------------------------------------------
  function makeValidSessionTournament(overrides: Record<string, any> = {}) {
    return {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'Suprema',
      buyIn: '22',
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Schema aceita todos os 6 novos campos
  // -------------------------------------------------------------------------
  it('deve aceitar todos os 6 novos campos quando presentes e validos', () => {
    const data = makeValidSessionTournament({
      lateRegMinutes: 60,
      startingStack: 10000,
      maxPlayers: 500,
      gameType: 'NLH',
      blindLevelMinutes: 12,
      alertMinutesBefore: 10,
    });

    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lateRegMinutes).toBe(60);
      expect(result.data.startingStack).toBe(10000);
      expect(result.data.maxPlayers).toBe(500);
      expect(result.data.gameType).toBe('NLH');
      expect(result.data.blindLevelMinutes).toBe(12);
      expect(result.data.alertMinutesBefore).toBe(10);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Campos sao opcionais
  // -------------------------------------------------------------------------
  it('deve validar sem nenhum campo enriquecido (todos opcionais)', () => {
    const data = makeValidSessionTournament();
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Campos aceitam null
  // -------------------------------------------------------------------------
  it('deve aceitar null para todos os campos enriquecidos', () => {
    const data = makeValidSessionTournament({
      lateRegMinutes: null,
      startingStack: null,
      maxPlayers: null,
      gameType: null,
      blindLevelMinutes: null,
      alertMinutesBefore: null,
    });

    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Mesmas validacoes de range que planned_tournaments
  // -------------------------------------------------------------------------
  it('deve rejeitar lateRegMinutes negativo', () => {
    const data = makeValidSessionTournament({ lateRegMinutes: -5 });
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar alertMinutesBefore=0', () => {
    const data = makeValidSessionTournament({ alertMinutesBefore: 0 });
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar alertMinutesBefore=121', () => {
    const data = makeValidSessionTournament({ alertMinutesBefore: 121 });
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar gameType="INVALID"', () => {
    const data = makeValidSessionTournament({ gameType: 'INVALID' });
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar gameType="PLO"', () => {
    const data = makeValidSessionTournament({ gameType: 'PLO' });
    const result = insertSessionTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Grupo 3: user_settings — campos de alerta
//
// Os 3 novos campos serao adicionados ao schema de user_settings.
// Como o insertUserSettingsSchema pode nao existir como export separado,
// testamos via import direto do schema Drizzle + createInsertSchema.
// =============================================================================

describe('user_settings schema — campos de alerta de late reg', () => {

  // Import do schema que sera ATUALIZADO
  // Se o projeto usa um insertUserSettingsSchema dedicado, ajustar o import
  let userSettingsSchema: z.ZodSchema;

  // Tentativa de importar schema existente ou inferir do Drizzle
  // O Implementer devera garantir que este import funcione
  beforeAll(async () => {
    try {
      const mod = await import('../../../shared/schema');
      // Tenta usar schema de insert se existir
      userSettingsSchema = (mod as any).insertUserSettingsSchema
        ?? (mod as any).userSettingsInsertSchema;
    } catch {
      // Se nao existir, os testes falharao (red phase esperado)
    }
  });

  it('deve aceitar lateRegAlertMinutes como inteiro (default 10)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined(); // Falha proposital — schema nao existe
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertMinutes: 10 };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lateRegAlertEnabled como boolean (default true)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined();
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertEnabled: true };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lateRegAlertSound como boolean (default true)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined();
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertSound: true };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lateRegAlertEnabled=false (desabilitar alertas)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined();
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertEnabled: false };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lateRegAlertMinutes=5 (opcao valida)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined();
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertMinutes: 5 };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar lateRegAlertMinutes=30 (opcao valida)', () => {
    if (!userSettingsSchema) {
      expect(userSettingsSchema).toBeDefined();
      return;
    }
    const data = { userId: 'USER-0001', lateRegAlertMinutes: 30 };
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
