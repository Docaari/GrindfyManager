/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 4 — RF-02 (cron weekly + generateForUser)
 *
 * Spec : Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-02
 * ADRs : 112 (cron strategy) + 111 (schema) + 113 (fallback tiers)
 * Pad. : tests/coach/nudges/b-snapshot.test.ts (mesma anatomia: tick + storage mocks)
 *
 * Cobertura:
 *   - Itera users elegiveis via storage.listUsersForCron (free + pro + premium ativo)
 *   - Skip user com rec ja existente para week_start_date corrente (idempotencia)
 *   - Chama recommendLessonForUser por user
 *   - Insert via storage.createCoachRecommendation com source/reason/lessonId
 *   - Quando servico retorna null -> NAO insere
 *   - Per-user error nao crasha batch (lesson #9: try/catch por user)
 *   - Logging agregado (success/skip/error counts) -> retorno do tick
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted nao necessario aqui (recommendLessonForUser eh funcao, nao constructor)
 *   #5  vi.fn() ok
 *   #9  try/catch + logging — testar que erro de 1 user nao impede outros
 *
 * Status RED: `server/coach/jobs/generateCoachRecommendations.ts` NAO existe
 * + `recommendLessonForUser` (mockado) NAO existe + `weekHelper` NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock storage — listUsersForCron + getCoachRecommendationByUserAndWeek +
// createCoachRecommendation + queries auxiliares de input do servico.
// =============================================================================
const listUsersForCronMock = vi.fn();
const getCoachRecByUserAndWeekMock = vi.fn();
const createCoachRecMock = vi.fn();
const getPerformanceByPeriodMock = vi.fn();
const getActiveProfileMock = vi.fn();
const getLastConsumedLessonIdsMock = vi.fn();
const getCatalogLessonsForRecommendationMock = vi.fn();

vi.mock('../../server/storage', () => ({
  storage: {
    listUsersForCron: listUsersForCronMock,
    getCoachRecommendationByUserAndWeek: getCoachRecByUserAndWeekMock,
    createCoachRecommendation: createCoachRecMock,
    getPerformanceByPeriod: getPerformanceByPeriodMock,
    getActiveProfile: getActiveProfileMock,
    getLastConsumedLessonIds: getLastConsumedLessonIdsMock,
    getCatalogLessonsForRecommendation: getCatalogLessonsForRecommendationMock,
  },
}));

// =============================================================================
// Mock recommendLessonForUser (servico chamado pelo job)
// =============================================================================
const recommendLessonForUserMock = vi.fn();
vi.mock('../../server/coach/recommendLessonForUser', () => ({
  recommendLessonForUser: (...args: any[]) => recommendLessonForUserMock(...args),
}));

// =============================================================================
// Mock detectLeaks (consumido para input do servico)
// =============================================================================
const detectLeaksMock = vi.fn();
vi.mock('../../server/coachLeakDetection', () => ({
  detectLeaks: (...args: any[]) => detectLeaksMock(...args),
}));

// =============================================================================
// Mock weekHelper (deterministico — segunda 2026-05-04 03:00 UTC)
// =============================================================================
vi.mock('../../server/coach/weekHelper', () => ({
  getCurrentWeekStartBRT: vi.fn(() => new Date('2026-05-04T03:00:00.000Z')),
}));

// =============================================================================
// Fixtures
// =============================================================================
const userA = { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' };
const userB = { userPlatformId: 'USER-B', timezone: 'America/Sao_Paulo', subscriptionPlan: 'free' };
const userC = { userPlatformId: 'USER-C', timezone: 'America/Sao_Paulo', subscriptionPlan: 'premium' };

const validRecommendation = {
  lessonId: 'LESS-1',
  reason: 'Justificativa em portugues longa o suficiente para passar.',
  source: 'coach' as const,
};

beforeEach(() => {
  listUsersForCronMock.mockReset();
  getCoachRecByUserAndWeekMock.mockReset();
  createCoachRecMock.mockReset();
  getPerformanceByPeriodMock.mockReset();
  getActiveProfileMock.mockReset();
  getLastConsumedLessonIdsMock.mockReset();
  getCatalogLessonsForRecommendationMock.mockReset();
  recommendLessonForUserMock.mockReset();
  detectLeaksMock.mockReset();

  // defaults
  detectLeaksMock.mockResolvedValue([]);
  getPerformanceByPeriodMock.mockResolvedValue({
    last7DaysRoi: 5,
    last7DaysVolume: 30,
    last7DaysProfit: 100,
    last30DaysRoi: 3,
  });
  getActiveProfileMock.mockResolvedValue('A');
  getLastConsumedLessonIdsMock.mockResolvedValue([]);
  getCatalogLessonsForRecommendationMock.mockResolvedValue([
    { id: 'LESS-1', title: 'L1', courseTitle: 'C', moduleTitle: 'M', categoryId: 'fundamentos', tags: [], learningObjectives: [], durationSeconds: 600 },
  ]);
});

// =============================================================================
// Itera por users elegiveis
// =============================================================================
describe('generateCoachRecommendationsTick — iteracao de users', () => {
  it('chama listUsersForCron com filtro de plans elegiveis (free + pro + premium) ativos', async () => {
    listUsersForCronMock.mockResolvedValue([]);
    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    await generateCoachRecommendationsTick({});
    expect(listUsersForCronMock).toHaveBeenCalled();
    const filter = listUsersForCronMock.mock.calls[0][0];
    const filterStr = typeof filter === 'string' ? filter : JSON.stringify(filter);
    expect(filterStr).toMatch(/free/);
    expect(filterStr).toMatch(/pro/);
    expect(filterStr).toMatch(/premium/);
  });

  it('itera todos users e chama recommendLessonForUser por cada novo', async () => {
    listUsersForCronMock.mockResolvedValue([userA, userB, userC]);
    getCoachRecByUserAndWeekMock.mockResolvedValue(null); // ninguem tem rec ainda
    recommendLessonForUserMock.mockResolvedValue(validRecommendation);
    createCoachRecMock.mockImplementation(async (payload: any) => ({ id: 'REC-X', ...payload }));

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(recommendLessonForUserMock).toHaveBeenCalledTimes(3);
    expect(createCoachRecMock).toHaveBeenCalledTimes(3);
    expect(summary.generated).toBe(3);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toBe(0);
  });
});

// =============================================================================
// Skip por idempotencia — user ja tem rec na semana corrente
// =============================================================================
describe('generateCoachRecommendationsTick — idempotencia (skip rec existente)', () => {
  it('user com rec ja existente -> skip + nao chama recommendLessonForUser', async () => {
    listUsersForCronMock.mockResolvedValue([userA]);
    getCoachRecByUserAndWeekMock.mockResolvedValue({
      id: 'REC-EXISTENTE',
      userId: 'USER-A',
      weekStartDate: '2026-05-04',
    });

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(recommendLessonForUserMock).not.toHaveBeenCalled();
    expect(createCoachRecMock).not.toHaveBeenCalled();
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.generated).toBe(0);
  });

  it('mistura: 1 com rec, 2 sem -> processa apenas 2', async () => {
    listUsersForCronMock.mockResolvedValue([userA, userB, userC]);
    getCoachRecByUserAndWeekMock
      .mockResolvedValueOnce({ id: 'EXIST', userId: 'USER-A' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    recommendLessonForUserMock.mockResolvedValue(validRecommendation);
    createCoachRecMock.mockResolvedValue({ id: 'REC-X' });

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(recommendLessonForUserMock).toHaveBeenCalledTimes(2);
    expect(createCoachRecMock).toHaveBeenCalledTimes(2);
    expect(summary.generated).toBe(2);
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Servico retorna null -> NAO insere
// =============================================================================
describe('generateCoachRecommendationsTick — null result do servico', () => {
  it('recommendLessonForUser retorna null -> NAO chama createCoachRecommendation', async () => {
    listUsersForCronMock.mockResolvedValue([userA]);
    getCoachRecByUserAndWeekMock.mockResolvedValue(null);
    recommendLessonForUserMock.mockResolvedValue(null);

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(recommendLessonForUserMock).toHaveBeenCalledTimes(1);
    expect(createCoachRecMock).not.toHaveBeenCalled();
    expect(summary.generated).toBe(0);
  });
});

// =============================================================================
// Insert payload — campos da spec RF-02 §5
// =============================================================================
describe('generateCoachRecommendationsTick — payload do insert', () => {
  it('chama createCoachRecommendation com lessonId/source/reason/inputSummary corretos', async () => {
    listUsersForCronMock.mockResolvedValue([userA]);
    getCoachRecByUserAndWeekMock.mockResolvedValue(null);
    recommendLessonForUserMock.mockResolvedValue({
      lessonId: 'LESS-42',
      reason: 'Razao plausivel longa o suficiente para passar.',
      source: 'fallback_leak_tag',
    });
    createCoachRecMock.mockResolvedValue({ id: 'REC-NEW' });

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    await generateCoachRecommendationsTick({});

    expect(createCoachRecMock).toHaveBeenCalledTimes(1);
    const payload = createCoachRecMock.mock.calls[0][0];
    expect(payload.userId).toBe('USER-A');
    expect(payload.lessonId).toBe('LESS-42');
    expect(payload.reason).toContain('Razao');
    expect(payload.source).toBe('fallback_leak_tag');
    expect(payload.weekStartDate).toBeDefined();
    // inputSummary com snapshot do que Coach viu
    expect(payload.inputSummary).toBeDefined();
  });
});

// =============================================================================
// Per-user error nao crasha batch (lesson #9)
// =============================================================================
describe('generateCoachRecommendationsTick — error isolation (lesson #9)', () => {
  it('falha em recommendLessonForUser para 1 user nao impede processar outros', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUsersForCronMock.mockResolvedValue([userA, userB]);
    getCoachRecByUserAndWeekMock.mockResolvedValue(null);
    recommendLessonForUserMock
      .mockRejectedValueOnce(new Error('coach_explode_for_A'))
      .mockResolvedValueOnce(validRecommendation);
    createCoachRecMock.mockResolvedValue({ id: 'REC-B' });

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(recommendLessonForUserMock).toHaveBeenCalledTimes(2);
    // User B foi processado mesmo com falha em A
    expect(createCoachRecMock).toHaveBeenCalledTimes(1);
    expect(summary.errors).toBeGreaterThanOrEqual(1);
    expect(summary.generated).toBeGreaterThanOrEqual(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('falha em createCoachRecommendation (DB unique violation por race) -> conta erro mas continua', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUsersForCronMock.mockResolvedValue([userA, userB]);
    getCoachRecByUserAndWeekMock.mockResolvedValue(null);
    recommendLessonForUserMock.mockResolvedValue(validRecommendation);
    createCoachRecMock
      .mockRejectedValueOnce(new Error('UNIQUE constraint uq_coach_rec_user_week'))
      .mockResolvedValueOnce({ id: 'REC-B' });

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});

    expect(summary.errors).toBeGreaterThanOrEqual(1);
    expect(summary.generated).toBeGreaterThanOrEqual(1);
    errSpy.mockRestore();
  });

  it('falha em listUsersForCron retorna sem crashar (early return)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUsersForCronMock.mockRejectedValue(new Error('db_down'));

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    await expect(generateCoachRecommendationsTick({})).resolves.not.toThrow();
    expect(recommendLessonForUserMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// Logging agregado / contadores
// =============================================================================
describe('generateCoachRecommendationsTick — summary counts', () => {
  it('retorna { generated, skipped, errors } com valores corretos', async () => {
    listUsersForCronMock.mockResolvedValue([userA, userB, userC]);
    getCoachRecByUserAndWeekMock
      .mockResolvedValueOnce({ id: 'EXIST' }) // skip
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    recommendLessonForUserMock
      .mockResolvedValueOnce(validRecommendation) // generated
      .mockRejectedValueOnce(new Error('boom')); // error
    createCoachRecMock.mockResolvedValue({ id: 'REC-X' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateCoachRecommendationsTick } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const summary = await generateCoachRecommendationsTick({});
    expect(summary.generated).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toBe(1);
    errSpy.mockRestore();
  });
});

// =============================================================================
// Override manual via generateForUser (RF-08)
// =============================================================================
describe('generateForUser — override manual (admin RF-08)', () => {
  it('exporta funcao generateForUser para uso pelo endpoint admin', async () => {
    listUsersForCronMock.mockResolvedValue([]);
    const mod: any = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    expect(typeof mod.generateForUser).toBe('function');
  });

  it('generateForUser chama recommendLessonForUser e insere quando rec ainda nao existe', async () => {
    getCoachRecByUserAndWeekMock.mockResolvedValue(null);
    recommendLessonForUserMock.mockResolvedValue(validRecommendation);
    createCoachRecMock.mockResolvedValue({ id: 'REC-NEW' });

    const { generateForUser } = await import(
      '../../server/coach/jobs/generateCoachRecommendations'
    );
    const result = await generateForUser('USER-X', new Date('2026-05-04T03:00:00.000Z'));
    expect(['created', 'skipped', 'skipped_empty']).toContain(result);
    expect(createCoachRecMock).toHaveBeenCalled();
  });
});
