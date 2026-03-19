import { describe, it, expect } from 'vitest';
import {
  insertGrindSessionSchema,
  insertBreakFeedbackSchema,
  insertPreparationLogSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes de Caracterizacao: Schemas Zod de Grind Session
// Documentam o comportamento ATUAL das validacoes.
// Todos devem PASSAR com o codigo existente.
// =============================================================================

// ---------------------------------------------------------------------------
// insertGrindSessionSchema
// ---------------------------------------------------------------------------

describe('insertGrindSessionSchema', () => {
  const validSession = {
    userId: 'USER-0001',
    date: '2025-01-20T00:00:00.000Z',
  };

  it('deve aceitar sessao com campos obrigatorios minimos (userId e date)', () => {
    const result = insertGrindSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('deve transformar date string em Date object', () => {
    const result = insertGrindSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date);
    }
  });

  it('deve transformar startTime string em Date object quando fornecido', () => {
    const data = {
      ...validSession,
      startTime: '2025-01-20T14:00:00.000Z',
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeInstanceOf(Date);
    }
  });

  it('deve transformar endTime string em Date object quando fornecido', () => {
    const data = {
      ...validSession,
      endTime: '2025-01-20T22:00:00.000Z',
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.endTime).toBeInstanceOf(Date);
    }
  });

  it('deve aceitar startTime como undefined', () => {
    const data = {
      ...validSession,
      startTime: undefined,
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessao com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validSession,
      plannedBuyins: '500.00',
      actualBuyins: '450.00',
      profitLoss: '150.00',
      duration: 360,
      startTime: '2025-01-20T14:00:00.000Z',
      endTime: '2025-01-20T20:00:00.000Z',
      status: 'completed',
      tournamentsPlayed: 25,
      finalTables: 2,
      bigHits: 1,
      notes: 'Boa sessao',
      preparationNotes: 'Foquei em ICM',
      preparationPercentage: 80,
      dailyGoals: 'Jogar 30 torneios',
      skipBreaksToday: false,
      objectiveCompleted: true,
      finalNotes: 'Cumpri objetivo',
      screenCap: 6,
      volume: 25,
      profit: '150.00',
      abiMed: '22.00',
      roi: '15.5',
      fts: 2,
      cravadas: 0,
      energiaMedia: '7.5',
      focoMedio: '8.0',
      confiancaMedia: '7.0',
      inteligenciaEmocionalMedia: '6.5',
      interferenciasMedia: '3.0',
      vanillaPercentage: '40.0',
      pkoPercentage: '50.0',
      mysteryPercentage: '10.0',
      normalSpeedPercentage: '60.0',
      turboSpeedPercentage: '30.0',
      hyperSpeedPercentage: '10.0',
    };

    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar sessao sem userId', () => {
    const { userId, ...data } = validSession;
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar sessao sem date', () => {
    const { date, ...data } = validSession;
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar status "planned"', () => {
    const data = { ...validSession, status: 'planned' };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "active"', () => {
    const data = { ...validSession, status: 'active' };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "completed"', () => {
    const data = { ...validSession, status: 'completed' };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar status "cancelled"', () => {
    const data = { ...validSession, status: 'cancelled' };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar screenCap como integer', () => {
    const data = { ...validSession, screenCap: 8 };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar duration como integer em minutos', () => {
    const data = { ...validSession, duration: 480 };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar skipBreaksToday como boolean', () => {
    const data = { ...validSession, skipBreaksToday: true };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar metricas de break como string decimal', () => {
    const data = {
      ...validSession,
      energiaMedia: '8.5',
      focoMedio: '9.0',
      confiancaMedia: '7.5',
      inteligenciaEmocionalMedia: '8.0',
      interferenciasMedia: '2.0',
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar percentuais de tipo como string decimal', () => {
    const data = {
      ...validSession,
      vanillaPercentage: '33.33',
      pkoPercentage: '33.33',
      mysteryPercentage: '33.34',
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar percentuais de velocidade como string decimal', () => {
    const data = {
      ...validSession,
      normalSpeedPercentage: '50.0',
      turboSpeedPercentage: '40.0',
      hyperSpeedPercentage: '10.0',
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessionSnapshot como objeto JSON', () => {
    const data = {
      ...validSession,
      sessionSnapshot: { tournaments: [], breakFeedbacks: [] },
    };
    const result = insertGrindSessionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertBreakFeedbackSchema
// ---------------------------------------------------------------------------

describe('insertBreakFeedbackSchema', () => {
  const validFeedback = {
    userId: 'USER-0001',
    sessionId: 'session-001',
    breakTime: new Date('2025-01-20T16:00:00.000Z'),
    foco: 8,
    energia: 7,
    confianca: 9,
    inteligenciaEmocional: 6,
    interferencias: 3,
  };

  it('deve aceitar feedback com todos os campos obrigatorios', () => {
    const result = insertBreakFeedbackSchema.safeParse(validFeedback);
    expect(result.success).toBe(true);
  });

  it('deve aceitar feedback com notes opcional', () => {
    const data = { ...validFeedback, notes: 'Sentindo cansaco mental' };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar feedback sem userId', () => {
    const { userId, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem breakTime', () => {
    const { breakTime, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem foco', () => {
    const { foco, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem energia', () => {
    const { energia, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem confianca', () => {
    const { confianca, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem inteligenciaEmocional', () => {
    const { inteligenciaEmocional, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar feedback sem interferencias', () => {
    const { interferencias, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar valores de 0 para todas as dimensoes', () => {
    const data = {
      ...validFeedback,
      foco: 0,
      energia: 0,
      confianca: 0,
      inteligenciaEmocional: 0,
      interferencias: 0,
    };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar valores de 10 para todas as dimensoes', () => {
    const data = {
      ...validFeedback,
      foco: 10,
      energia: 10,
      confianca: 10,
      inteligenciaEmocional: 10,
      interferencias: 10,
    };
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessionId como opcional (pode ser null)', () => {
    const { sessionId, ...data } = validFeedback;
    const result = insertBreakFeedbackSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertPreparationLogSchema
// ---------------------------------------------------------------------------

describe('insertPreparationLogSchema', () => {
  const validLog = {
    userId: 'USER-0001',
    mentalState: 7,
    focusLevel: 8,
    confidenceLevel: 9,
  };

  it('deve aceitar log de preparacao com campos obrigatorios', () => {
    const result = insertPreparationLogSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });

  it('deve aceitar log com todos os campos opcionais', () => {
    const data = {
      ...validLog,
      sessionId: 'session-001',
      exercisesCompleted: ['breathing', 'visualization', 'review'],
      warmupCompleted: true,
      sessionGoals: 'Jogar 30 torneios com foco em ICM',
      notes: 'Me sinto preparado',
      postSessionReview: 'Sessao produtiva',
      goalsAchieved: true,
      lessonsLearned: 'Preciso melhorar fold equity em bubble',
    };

    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar log sem userId', () => {
    const { userId, ...data } = validLog;
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar log sem mentalState', () => {
    const { mentalState, ...data } = validLog;
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar log sem focusLevel', () => {
    const { focusLevel, ...data } = validLog;
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar log sem confidenceLevel', () => {
    const { confidenceLevel, ...data } = validLog;
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar exercisesCompleted como array de strings', () => {
    const data = { ...validLog, exercisesCompleted: ['meditation', 'stretching'] };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar exercisesCompleted como array vazio', () => {
    const data = { ...validLog, exercisesCompleted: [] };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar warmupCompleted como boolean', () => {
    const data = { ...validLog, warmupCompleted: true };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessionId como opcional', () => {
    const data = { ...validLog, sessionId: 'session-001' };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar goalsAchieved como boolean', () => {
    const data = { ...validLog, goalsAchieved: false };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar mentalState como 0', () => {
    const data = { ...validLog, mentalState: 0 };
    const result = insertPreparationLogSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
