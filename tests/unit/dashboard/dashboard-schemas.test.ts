import { describe, it, expect } from 'vitest';
import {
  insertTournamentSchema,
  insertAnalyticsDailySchema,
  insertUserActivitySchema,
  insertUserActivitiesSchema,
  insertEngagementMetricsSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes de Caracterizacao: Schemas Zod de Dashboard & Analytics
// Documentam o comportamento ATUAL das validacoes (drizzle-zod createInsertSchema).
// Todos devem PASSAR com o codigo existente.
//
// NOTA: drizzle-zod exige Date objects para campos timestamp (nao aceita strings).
// =============================================================================

// ---------------------------------------------------------------------------
// insertTournamentSchema — base de dados do dashboard de analytics
// ---------------------------------------------------------------------------

describe('insertTournamentSchema', () => {
  const validTournament = {
    userId: 'USER-0001',
    name: 'Sunday Million',
    buyIn: '215',
    site: 'PokerStars',
    format: 'MTT',
    category: 'Vanilla',
    speed: 'Regular',
    datePlayed: new Date('2025-06-15T20:00:00.000Z'),
  };

  it('deve aceitar torneio com campos obrigatorios minimos', () => {
    const result = insertTournamentSchema.safeParse(validTournament);
    expect(result.success).toBe(true);
  });

  it('deve aceitar torneio com todos os campos opcionais preenchidos', () => {
    const data = {
      ...validTournament,
      tournamentId: 'EXT-12345',
      prizePool: '100000',
      position: 42,
      prize: '500',
      fieldSize: 5000,
      reentries: 2,
      finalTable: false,
      bigHit: false,
      earlyFinish: false,
      lateFinish: false,
      currency: 'USD',
      rake: '15',
      convertedToUSD: false,
      templateId: 'tmpl-001',
      grindSessionId: 'gs-001',
    };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar torneio sem userId', () => {
    const { userId, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem name', () => {
    const { name, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem buyIn', () => {
    const { buyIn, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem site', () => {
    const { site, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem format', () => {
    const { format, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem category', () => {
    const { category, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem speed', () => {
    const { speed, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar torneio sem datePlayed', () => {
    const { datePlayed, ...data } = validTournament;
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar datePlayed como string (exige Date object)', () => {
    const data = { ...validTournament, datePlayed: '2025-06-15T20:00:00.000Z' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar prize como string decimal (ex: "500.50")', () => {
    const data = { ...validTournament, prize: '500.50' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar prize como "0" para torneio sem premiacao (bust out)', () => {
    const data = { ...validTournament, prize: '0' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar buyIn como string "0" para freerolls', () => {
    const data = { ...validTournament, buyIn: '0' };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar finalTable como true', () => {
    const data = { ...validTournament, finalTable: true };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finalTable).toBe(true);
    }
  });

  it('deve aceitar bigHit como true', () => {
    const data = { ...validTournament, bigHit: true };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bigHit).toBe(true);
    }
  });

  it('deve aceitar position como inteiro positivo', () => {
    const data = { ...validTournament, position: 1 };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.position).toBe(1);
    }
  });

  it('deve aceitar fieldSize como inteiro positivo', () => {
    const data = { ...validTournament, fieldSize: 2500 };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fieldSize).toBe(2500);
    }
  });

  it('deve aceitar reentries como 0 (sem reentrada)', () => {
    const data = { ...validTournament, reentries: 0 };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reentries).toBe(0);
    }
  });

  it('deve aceitar currency como qualquer string (USD, BRL, EUR)', () => {
    for (const currency of ['USD', 'BRL', 'EUR', 'CNY']) {
      const data = { ...validTournament, currency };
      const result = insertTournamentSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('deve aceitar convertedToUSD como boolean', () => {
    const data = { ...validTournament, convertedToUSD: true };
    const result = insertTournamentSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.convertedToUSD).toBe(true);
    }
  });

  it('deve manter datePlayed como Date object no output', () => {
    const result = insertTournamentSchema.safeParse(validTournament);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.datePlayed).toBeInstanceOf(Date);
    }
  });

  it('deve omitir id, createdAt e updatedAt do schema de insert', () => {
    const dataWithOmitted = {
      ...validTournament,
      id: 'should-be-ignored',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = insertTournamentSchema.safeParse(dataWithOmitted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('createdAt');
      expect(result.data).not.toHaveProperty('updatedAt');
    }
  });
});

// ---------------------------------------------------------------------------
// insertAnalyticsDailySchema — resumo diario de analytics
// ---------------------------------------------------------------------------

describe('insertAnalyticsDailySchema', () => {
  const validDaily = {
    date: new Date('2025-06-15T00:00:00.000Z'),
  };

  it('deve aceitar registro com apenas date (campo obrigatorio)', () => {
    const result = insertAnalyticsDailySchema.safeParse(validDaily);
    expect(result.success).toBe(true);
  });

  it('deve aceitar registro com todos os campos opcionais', () => {
    const data = {
      ...validDaily,
      userId: 'USER-0001',
      totalSessions: 5,
      totalDuration: 3600,
      pagesVisited: ['dashboard', 'grind', 'studies'],
      featuresUsed: ['upload', 'filter'],
      loginCount: 3,
      uploadCount: 1,
      grindSessionsCreated: 2,
      warmupSessionsCompleted: 1,
    };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar registro sem date', () => {
    const result = insertAnalyticsDailySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('deve rejeitar date como string (exige Date object)', () => {
    const result = insertAnalyticsDailySchema.safeParse({ date: '2025-06-15' });
    expect(result.success).toBe(false);
  });

  it('deve manter date como Date object no output', () => {
    const result = insertAnalyticsDailySchema.safeParse(validDaily);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeInstanceOf(Date);
    }
  });

  it('deve aceitar totalSessions como inteiro', () => {
    const data = { ...validDaily, totalSessions: 10 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar totalDuration como inteiro (segundos)', () => {
    const data = { ...validDaily, totalDuration: 7200 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar pagesVisited como array de strings', () => {
    const data = { ...validDaily, pagesVisited: ['dashboard', 'grind'] };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar featuresUsed como array de strings', () => {
    const data = { ...validDaily, featuresUsed: ['upload', 'export'] };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar loginCount como inteiro', () => {
    const data = { ...validDaily, loginCount: 5 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar uploadCount como inteiro', () => {
    const data = { ...validDaily, uploadCount: 3 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar grindSessionsCreated como inteiro', () => {
    const data = { ...validDaily, grindSessionsCreated: 2 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar warmupSessionsCompleted como inteiro', () => {
    const data = { ...validDaily, warmupSessionsCompleted: 1 };
    const result = insertAnalyticsDailySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve omitir id e createdAt do schema de insert', () => {
    const dataWithOmitted = {
      ...validDaily,
      id: 'should-be-ignored',
      createdAt: new Date(),
    };
    const result = insertAnalyticsDailySchema.safeParse(dataWithOmitted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('createdAt');
    }
  });
});

// ---------------------------------------------------------------------------
// insertUserActivitySchema — tracking avancado de atividade (user_activity)
// ---------------------------------------------------------------------------

describe('insertUserActivitySchema', () => {
  const validActivity = {
    userId: 'USER-0001',
    page: 'dashboard',
    action: 'page_view',
  };

  it('deve aceitar atividade com campos obrigatorios (userId, page, action)', () => {
    const result = insertUserActivitySchema.safeParse(validActivity);
    expect(result.success).toBe(true);
  });

  it('deve aceitar atividade com todos os campos opcionais', () => {
    const data = {
      ...validActivity,
      feature: 'filter',
      duration: 120,
      metadata: { browser: 'Chrome' },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar atividade sem userId', () => {
    const { userId, ...data } = validActivity;
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar atividade sem page', () => {
    const { page, ...data } = validActivity;
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar atividade sem action', () => {
    const { action, ...data } = validActivity;
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar feature como string opcional', () => {
    const data = { ...validActivity, feature: 'upload' };
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar duration como inteiro (segundos)', () => {
    const data = { ...validActivity, duration: 300 };
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar metadata como objeto JSON', () => {
    const data = { ...validActivity, metadata: { source: 'sidebar', version: 2 } };
    const result = insertUserActivitySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve omitir id e createdAt do schema de insert', () => {
    const dataWithOmitted = {
      ...validActivity,
      id: 'should-be-ignored',
      createdAt: new Date(),
    };
    const result = insertUserActivitySchema.safeParse(dataWithOmitted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('createdAt');
    }
  });
});

// ---------------------------------------------------------------------------
// insertUserActivitiesSchema — tracking basico de atividade (user_activities)
// ---------------------------------------------------------------------------

describe('insertUserActivitiesSchema', () => {
  const validActivity = {
    userId: 'USER-0001',
    activityType: 'login',
  };

  it('deve aceitar atividade com campos obrigatorios (userId, activityType)', () => {
    const result = insertUserActivitiesSchema.safeParse(validActivity);
    expect(result.success).toBe(true);
  });

  it('deve aceitar atividade com todos os campos opcionais', () => {
    const data = {
      ...validActivity,
      page: 'dashboard',
      sessionDuration: 45,
      metadata: { device: 'desktop' },
    };
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar atividade sem userId', () => {
    const { userId, ...data } = validActivity;
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar atividade sem activityType', () => {
    const { activityType, ...data } = validActivity;
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar page como string opcional', () => {
    const data = { ...validActivity, page: 'grind' };
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar sessionDuration como inteiro (minutos)', () => {
    const data = { ...validActivity, sessionDuration: 120 };
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar metadata como objeto JSON', () => {
    const data = { ...validActivity, metadata: { ip: '10.0.0.1' } };
    const result = insertUserActivitiesSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar activityType com valores tipicos do sistema', () => {
    const types = ['login', 'logout', 'grind_session', 'upload', 'study_session', 'page_view'];
    for (const activityType of types) {
      const data = { ...validActivity, activityType };
      const result = insertUserActivitiesSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('deve omitir id e createdAt do schema de insert', () => {
    const dataWithOmitted = {
      ...validActivity,
      id: 'should-be-ignored',
      createdAt: new Date(),
    };
    const result = insertUserActivitiesSchema.safeParse(dataWithOmitted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('createdAt');
    }
  });
});

// ---------------------------------------------------------------------------
// insertEngagementMetricsSchema — metricas de engajamento
// ---------------------------------------------------------------------------

describe('insertEngagementMetricsSchema', () => {
  const validMetrics = {
    userId: 'USER-0001',
  };

  it('deve aceitar metricas com apenas userId (campo obrigatorio)', () => {
    const result = insertEngagementMetricsSchema.safeParse(validMetrics);
    expect(result.success).toBe(true);
  });

  it('deve aceitar metricas com todos os campos opcionais', () => {
    const data = {
      ...validMetrics,
      totalSessions: 50,
      totalTimeMinutes: 3000,
      lastLoginDate: new Date('2025-06-15T10:00:00.000Z'),
      streakDays: 7,
      avgSessionDuration: 60,
      favoritePage: 'dashboard',
      subscriptionDaysRemaining: 25,
      engagementScore: 85,
    };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar metricas sem userId', () => {
    const result = insertEngagementMetricsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('deve rejeitar lastLoginDate como string (exige Date object)', () => {
    const data = { ...validMetrics, lastLoginDate: '2025-06-15T10:00:00.000Z' };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar totalSessions como inteiro', () => {
    const data = { ...validMetrics, totalSessions: 100 };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar totalTimeMinutes como inteiro', () => {
    const data = { ...validMetrics, totalTimeMinutes: 5000 };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar streakDays como inteiro', () => {
    const data = { ...validMetrics, streakDays: 14 };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar avgSessionDuration como inteiro', () => {
    const data = { ...validMetrics, avgSessionDuration: 45 };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar favoritePage como string', () => {
    const data = { ...validMetrics, favoritePage: 'grind' };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve aceitar engagementScore como inteiro (0-100)', () => {
    for (const score of [0, 50, 100]) {
      const data = { ...validMetrics, engagementScore: score };
      const result = insertEngagementMetricsSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it('deve aceitar subscriptionDaysRemaining como inteiro', () => {
    const data = { ...validMetrics, subscriptionDaysRemaining: 30 };
    const result = insertEngagementMetricsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('deve omitir id e updatedAt do schema de insert', () => {
    const dataWithOmitted = {
      ...validMetrics,
      id: 'should-be-ignored',
      updatedAt: new Date(),
    };
    const result = insertEngagementMetricsSchema.safeParse(dataWithOmitted);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('updatedAt');
    }
  });
});
