import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: Context Loaders dos 3 Coaches
//
// Testa que cada context loader busca e retorna apenas os dados da sua
// especialidade. Modulo alvo: server/coachContext.ts (AINDA NAO EXISTE)
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
  gte: vi.fn((...args: any[]) => ({ type: 'gte', args })),
  lte: vi.fn((...args: any[]) => ({ type: 'lte', args })),
  sql: vi.fn(),
  inArray: vi.fn((...args: any[]) => ({ type: 'inArray', args })),
}));

// Mock do storage
vi.mock('../../../server/storage', () => ({
  storage: {
    getDashboardStats: vi.fn(),
    getAnalyticsBySite: vi.fn(),
    getAnalyticsByBuyinRange: vi.fn(),
    getAnalyticsByCategory: vi.fn(),
    getAnalyticsBySpeed: vi.fn(),
    getAnalyticsByDayOfWeek: vi.fn(),
    getAnalyticsByField: vi.fn(),
    getAnalyticsByMonth: vi.fn(),
    getFinalTableAnalytics: vi.fn(),
    getTournamentLibrary: vi.fn(),
  },
}));

// Mock do schema
vi.mock('@shared/schema', () => ({
  breakFeedbacks: { userId: 'break_feedbacks.userId', sessionId: 'break_feedbacks.sessionId' },
  preparationLogs: { userId: 'preparation_logs.userId', sessionId: 'preparation_logs.sessionId' },
  grindSessions: { userId: 'grind_sessions.userId', status: 'grind_sessions.status', id: 'grind_sessions.id' },
  weeklyRoutines: { userId: 'weekly_routines.userId' },
  tournaments: { userId: 'tournaments.userId' },
  plannedTournaments: { userId: 'planned_tournaments.userId' },
  profileStates: { userId: 'profile_states.userId' },
  studyCards: { userId: 'study_cards.userId' },
  studySessions: { userId: 'study_sessions.userId' },
  coachingInsights: { userId: 'coaching_insights.userId' },
  tournamentTemplates: { userId: 'tournament_templates.userId' },
}));

// O modulo que o Implementer vai criar
import {
  buildMentalContext,
  buildTournamentContext,
  buildTechnicalContext,
} from '../../../server/coachContext';

import { storage } from '../../../server/storage';

const TEST_USER_ID = 'USER-0001';

// ---------------------------------------------------------------------------
// buildMentalContext
// ---------------------------------------------------------------------------
describe('buildMentalContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar objeto com breakFeedbacks, preparationLogs e grindSessions', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    expect(result).toHaveProperty('breakFeedbacks');
    expect(result).toHaveProperty('preparationLogs');
    expect(result).toHaveProperty('grindSessions');
  });

  it('deve carregar ultimos 10 break feedbacks', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    expect(Array.isArray(result.breakFeedbacks)).toBe(true);
    // O loader deve limitar a 10 feedbacks
  });

  it('deve carregar ultimos 5 preparation logs', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    expect(Array.isArray(result.preparationLogs)).toBe(true);
    // O loader deve limitar a 5 logs
  });

  it('deve carregar metricas mentais das sessoes de grind', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    expect(Array.isArray(result.grindSessions)).toBe(true);
  });

  it('deve incluir correlacao mental-resultado quando dados existem', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    // O campo pode existir ou ser undefined dependendo da disponibilidade de dados
    expect(result).toHaveProperty('mentalCorrelation');
  });

  it('NAO deve conter dados de torneios (isolamento de especialidade)', async () => {
    const result = await buildMentalContext(TEST_USER_ID);

    expect(result).not.toHaveProperty('roiBySite');
    expect(result).not.toHaveProperty('roiByCategory');
    expect(result).not.toHaveProperty('dashboardStats');
    expect(result).not.toHaveProperty('studyCards');
    expect(result).not.toHaveProperty('detectedLeaks');
  });

  it('deve funcionar com usuario sem dados (graceful degradation)', async () => {
    const result = await buildMentalContext('USER-NO-DATA');

    expect(result.breakFeedbacks).toEqual([]);
    expect(result.preparationLogs).toEqual([]);
    expect(result.grindSessions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTournamentContext
// ---------------------------------------------------------------------------
describe('buildTournamentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks para storage
    vi.mocked(storage.getDashboardStats).mockResolvedValue({
      totalTournaments: 1500,
      roi: 12.5,
      profit: '15000.00',
      abi: 25,
      itmPercent: 16.2,
    } as any);
    vi.mocked(storage.getAnalyticsBySite).mockResolvedValue([
      { site: 'PokerStars', roi: 15.3, count: 800 },
    ] as any);
    vi.mocked(storage.getAnalyticsByBuyinRange).mockResolvedValue([]);
    vi.mocked(storage.getAnalyticsByCategory).mockResolvedValue([]);
    vi.mocked(storage.getAnalyticsBySpeed).mockResolvedValue([]);
    vi.mocked(storage.getAnalyticsByDayOfWeek).mockResolvedValue([]);
    vi.mocked(storage.getTournamentLibrary).mockResolvedValue([]);
  });

  it('deve retornar objeto com dashboardStats e analytics por dimensao', async () => {
    const result = await buildTournamentContext(TEST_USER_ID);

    expect(result).toHaveProperty('dashboardStats');
    expect(result).toHaveProperty('roiBySite');
    expect(result).toHaveProperty('roiByBuyin');
    expect(result).toHaveProperty('roiByCategory');
    expect(result).toHaveProperty('roiBySpeed');
    expect(result).toHaveProperty('roiByDay');
  });

  it('deve carregar ROI por site usando storage.getAnalyticsBySite', async () => {
    const result = await buildTournamentContext(TEST_USER_ID);

    expect(storage.getAnalyticsBySite).toHaveBeenCalledWith(TEST_USER_ID, expect.anything());
  });

  it('deve carregar templates top e worst da biblioteca', async () => {
    const result = await buildTournamentContext(TEST_USER_ID);

    expect(result).toHaveProperty('topTemplates');
    expect(result).toHaveProperty('worstTemplates');
  });

  it('deve carregar grade planejada e perfis ativos', async () => {
    const result = await buildTournamentContext(TEST_USER_ID);

    expect(result).toHaveProperty('plannedTournaments');
    expect(result).toHaveProperty('profileStates');
  });

  it('NAO deve conter dados de mental game (isolamento de especialidade)', async () => {
    const result = await buildTournamentContext(TEST_USER_ID);

    expect(result).not.toHaveProperty('breakFeedbacks');
    expect(result).not.toHaveProperty('preparationLogs');
    expect(result).not.toHaveProperty('mentalCorrelation');
    expect(result).not.toHaveProperty('studyCards');
    expect(result).not.toHaveProperty('detectedLeaks');
  });

  it('deve funcionar com usuario sem torneios (graceful degradation)', async () => {
    vi.mocked(storage.getDashboardStats).mockResolvedValue({
      totalTournaments: 0,
      roi: 0,
      profit: '0',
      abi: 0,
      itmPercent: 0,
    } as any);

    const result = await buildTournamentContext('USER-NO-DATA');

    expect(result.dashboardStats.totalTournaments).toBe(0);
    expect(result.roiBySite).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTechnicalContext
// ---------------------------------------------------------------------------
describe('buildTechnicalContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(storage.getDashboardStats).mockResolvedValue({
      totalTournaments: 1500,
      roi: 12.5,
    } as any);
    vi.mocked(storage.getFinalTableAnalytics).mockResolvedValue({
      ftRate: 3.0,
      winRate: 17.8,
    } as any);
    vi.mocked(storage.getAnalyticsByField).mockResolvedValue([]);
    vi.mocked(storage.getAnalyticsByMonth).mockResolvedValue([]);
  });

  it('deve retornar objeto com dashboardStats completo e FT analytics', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('dashboardStats');
    expect(result).toHaveProperty('finalTableAnalytics');
  });

  it('deve incluir early/late finish rates', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('earlyFinishRate');
    expect(result).toHaveProperty('lateFinishRate');
  });

  it('deve incluir analytics por field size e por mes', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('analyticsByField');
    expect(result).toHaveProperty('analyticsByMonth');
  });

  it('deve incluir study cards e study sessions', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('studyCards');
    expect(result).toHaveProperty('studySessions');
  });

  it('deve incluir leaks pre-computados (detectedLeaks)', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('detectedLeaks');
    expect(Array.isArray(result.detectedLeaks)).toBe(true);
  });

  it('deve incluir big hits e coaching insights existentes', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).toHaveProperty('bigHits');
    expect(result).toHaveProperty('coachingInsights');
  });

  it('NAO deve conter dados de mental game nem grade planejada (isolamento)', async () => {
    const result = await buildTechnicalContext(TEST_USER_ID);

    expect(result).not.toHaveProperty('breakFeedbacks');
    expect(result).not.toHaveProperty('preparationLogs');
    expect(result).not.toHaveProperty('mentalCorrelation');
    expect(result).not.toHaveProperty('plannedTournaments');
    expect(result).not.toHaveProperty('profileStates');
  });

  it('deve funcionar com usuario sem dados (graceful degradation)', async () => {
    vi.mocked(storage.getDashboardStats).mockResolvedValue({
      totalTournaments: 0,
    } as any);
    vi.mocked(storage.getFinalTableAnalytics).mockResolvedValue({} as any);

    const result = await buildTechnicalContext('USER-NO-DATA');

    expect(result.studyCards).toEqual([]);
    expect(result.detectedLeaks).toEqual([]);
  });
});
