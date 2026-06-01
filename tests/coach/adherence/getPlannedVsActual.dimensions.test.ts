import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase
//
// Cobre por sourceMetric (RF-02 mapa + RF-03 grind + RF-05 estudo + aulas/temas):
//   grind_sessions_count, grind_days, planned_tournaments_count,
//   study_minutes, study_sessions_count, lessons_recommended_done, themes_focus_studied.
// + §6.1 (volume usa tabelas de sessão; histórico filtra grind_session_id IS NULL).
//
// Shapes reais validados no cabeçalho de getPlannedVsActual.contract.test.ts.
// Lessons #34/#36 (injectedStorage), #3 (mock shape real), #14/#26/#38 (await import).
// =============================================================================

async function loadEngine() {
  return await import('../../../server/coach/adherence/index');
}

const CLOSED_WEEK = { kind: 'week' as const, weekStartDate: '2026-06-01' };

function utc(ymd: string, h = 12): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0));
}

function planningSession(steps: Record<string, any>) {
  return {
    id: 'wps-1',
    userId: 'USER-X',
    weekStartDate: '2026-06-01',
    status: 'completed',
    source: 'coach_manual',
    steps,
    createdAt: new Date('2026-05-25T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

function grindSession(opts: { id: string; date: string; status?: string }) {
  return {
    id: opts.id,
    userId: 'USER-X',
    date: utc(opts.date),
    status: opts.status ?? 'completed',
  };
}

/** study_sessions_v2 no shape real (schema:2427) — durationMinutes notNull int. */
function studyV2(opts: {
  id: string;
  registeredAt: string;
  status?: string;
  durationMinutes?: number;
  mode?: string;
  themeId?: string | null;
}) {
  return {
    id: opts.id,
    userId: 'USER-X',
    mode: opts.mode ?? 'drill_gto',
    source: 'manual',
    status: opts.status ?? 'completed',
    themeId: opts.themeId ?? null,
    durationMinutes: opts.durationMinutes ?? 60,
    registeredAt: utc(opts.registeredAt),
    startedAt: utc(opts.registeredAt),
  };
}

function makeStorage(overrides: Record<string, any> = {}) {
  return {
    getWeeklyPlanningSession: vi.fn(async () => null),
    getPlannedTournaments: vi.fn(async () => []),
    getStudyWeeklyPlan: vi.fn(async () => null),
    getGrindSessions: vi.fn(async () => []),
    getStudySessionsV2: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getStatsLeaks: vi.fn(async () => []),
    getCoachRecommendationByUserAndWeek: vi.fn(async () => null),
    ...overrides,
  };
}

// Congela o relógio FORA da janela [2026-06-01, 2026-06-08) (DEC-MA7 /
// isWindowOpen). 2026-06-10 está 2 dias após o fim exclusivo -> janela sempre
// FECHADA, independente da data real do CI. Sem isso, os asserts
// `dataSufficiency:'ok'` quebrariam de 02 a 07/06 (janela aberta -> 'low').
// Nenhum teste deste arquivo testa janela aberta propositalmente.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// RF-03 — Grind/volume
// =============================================================================
describe('RF-03 dimensão Grind/volume', () => {
  it('grind_sessions_count: 4 planejados, 3 sessões completas na janela -> {planned:4, actual:3, compliancePct:75, ok}', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b', 'c', 'd'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
        { id: 'c', dayOfWeek: 3, time: '19:00', isActive: true },
        { id: 'd', dayOfWeek: 4, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [
        grindSession({ id: 'g1', date: '2026-06-01' }),
        grindSession({ id: 'g2', date: '2026-06-02' }),
        grindSession({ id: 'g3', date: '2026-06-03' }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(4);
    expect(res.actual).toBe(3);
    expect(res.compliancePct).toBe(75);
    expect(res.dataSufficiency).toBe('ok');
    expect(res.breakdown).toMatchObject({ skipped: false, shortfall: 1, overachieved: false });
  });

  it('grind_days conta dias DISTINTOS (2 sessões no mesmo dia = 1 dia)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      // 3 sessões mas em 2 dias distintos (2026-06-02 x2)
      getGrindSessions: vi.fn(async () => [
        grindSession({ id: 'g1', date: '2026-06-01' }),
        grindSession({ id: 'g2', date: '2026-06-02' }),
        grindSession({ id: 'g3', date: '2026-06-02' }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.actual).toBe(2);
  });

  it('só conta grind_sessions status="completed" (filtra in-memory; getGrindSessions não filtra status no SQL)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [
        grindSession({ id: 'g1', date: '2026-06-01', status: 'completed' }),
        grindSession({ id: 'g2', date: '2026-06-02', status: 'planned' }), // não conta
        grindSession({ id: 'g3', date: '2026-06-03', status: 'cancelled' }), // não conta
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.actual).toBe(1);
  });

  it('só conta grind_sessions com date DENTRO da janela [weekStart, +7d) — filtra in-memory', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [
        grindSession({ id: 'g0', date: '2026-05-31' }), // ANTES da janela
        grindSession({ id: 'g1', date: '2026-06-02' }), // DENTRO
        grindSession({ id: 'g2', date: '2026-06-08' }), // FORA (próxima semana, fim exclusivo)
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.actual).toBe(1);
  });
});

// =============================================================================
// RF-02 §6.1 — guard de fonte: volume usa tabelas de sessão, não tournaments histórico
// =============================================================================
describe('RF-02 §6.1 — fonte de volume', () => {
  it('grind_days NÃO chama getTournaments/getDashboardStats (histórico); usa getGrindSessions (sessão)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const getTournaments = vi.fn(async () => []);
    const getDashboardStats = vi.fn(async () => ({}));
    const getGrindSessions = vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]);
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [{ id: 'a', dayOfWeek: 1, time: '19:00', isActive: true }]),
      getGrindSessions,
      getTournaments,
      getDashboardStats,
    });

    await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(getGrindSessions).toHaveBeenCalled();
    expect(getTournaments).not.toHaveBeenCalled();
    expect(getDashboardStats).not.toHaveBeenCalled();
  });

  it('planned_tournaments_count realizado usa getSessionTournaments (sessão), não tournaments histórico (DEC-MA3)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const getSessionTournaments = vi.fn(async () => [
      { id: 'st1', sessionId: 'g1', buyIn: '5.50' },
      { id: 'st2', sessionId: 'g1', buyIn: '11.00' },
    ]);
    const getTournaments = vi.fn(async () => []);
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b', 'c'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 1, time: '20:00', isActive: true },
        { id: 'c', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
      getSessionTournaments,
      getTournaments,
    });

    await getPlannedVsActual('USER-X', 'planned_tournaments_count', CLOSED_WEEK, storage as any);
    expect(getSessionTournaments).toHaveBeenCalled();
    expect(getTournaments).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-05 — Estudo
// =============================================================================
describe('RF-05 dimensão Estudo', () => {
  it('study_minutes: plano 300 min (steps.study), realizado 180 min -> {planned:300, actual:180, compliancePct:60}', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      // DEC-MA4: fonte primária = blocos steps.study (durações). Aqui 3 blocos = 300 min.
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({
          study: {
            status: 'confirmed',
            sessionIds: ['s1', 's2', 's3'],
          },
        }),
      ),
      // fallback DEC-MA4: study_weekly_plans dailyTargetMinutes (caso steps.study não tenha durações)
      getStudyWeeklyPlan: vi.fn(async () => ({
        dailyTargetMinutes: 60,
        weekStartDate: '2026-06-01',
        planJsonb: { days: [{}, {}, {}, {}, {}] }, // 5 dias planejados -> 300
        source: 'coach_manual',
      })),
      getStudySessionsV2: vi.fn(async () => [
        studyV2({ id: 's1', registeredAt: '2026-06-02', durationMinutes: 90 }),
        studyV2({ id: 's2', registeredAt: '2026-06-04', durationMinutes: 90 }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'study_minutes', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(300);
    expect(res.actual).toBe(180);
    expect(res.compliancePct).toBe(60);
  });

  it('study_sessions_v2 mode "stat_analysis" conta no realizado (NÃO filtra por mode)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ study: { status: 'confirmed', sessionIds: ['s1', 's2'] } }),
      ),
      getStudySessionsV2: vi.fn(async () => [
        studyV2({ id: 's1', registeredAt: '2026-06-02', mode: 'drill_gto' }),
        studyV2({ id: 's2', registeredAt: '2026-06-03', mode: 'stat_analysis' }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'study_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.actual).toBe(2);
  });

  it('study_sessions_v2 só conta status="completed" + dentro da janela (filtra in-memory)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ study: { status: 'confirmed', sessionIds: ['s1', 's2', 's3'] } }),
      ),
      getStudySessionsV2: vi.fn(async () => [
        studyV2({ id: 's1', registeredAt: '2026-06-02', status: 'completed' }),
        studyV2({ id: 's2', registeredAt: '2026-06-03', status: 'planned' }), // não conta
        studyV2({ id: 's3', registeredAt: '2026-05-30', status: 'completed' }), // fora da janela
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'study_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.actual).toBe(1);
  });

  it('sem study_weekly_plans e sem steps.study -> planned=null, dataSufficiency="low"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () => null),
      getStudyWeeklyPlan: vi.fn(async () => null),
    });

    const res = await getPlannedVsActual('USER-X', 'study_minutes', CLOSED_WEEK, storage as any);
    expect(res.planned).toBeNull();
    expect(res.dataSufficiency).toBe('low');
  });

  it('study_minutes via fallback study_weekly_plans (sem steps.study) -> note="plan_from_weekly_plan" (DEC-MA4)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    // weekly_planning_sessions existe mas study sem sessionIds/durações -> fallback p/ study_weekly_plans.
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ study: { status: 'confirmed' } }),
      ),
      getStudyWeeklyPlan: vi.fn(async () => ({
        dailyTargetMinutes: 60,
        weekStartDate: '2026-06-01',
        planJsonb: { days: [{}, {}, {}] }, // 3 dias -> 180
        source: 'coach_auto',
      })),
      getStudySessionsV2: vi.fn(async () => [
        studyV2({ id: 's1', registeredAt: '2026-06-02', durationMinutes: 90 }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'study_minutes', CLOSED_WEEK, storage as any);
    expect(res.breakdown.note).toBe('plan_from_weekly_plan');
  });
});

// =============================================================================
// Aulas (lessons_recommended_done) — chave BRT explícita (não unifica com UTC)
// =============================================================================
describe('lessons_recommended_done — chave BRT', () => {
  it('lê coach_lesson_recommendations via chave BRT (converte; não passa a chave UTC crua)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const getCoachRecommendationByUserAndWeek = vi.fn(async () => ({
      id: 'rec-1',
      userId: 'USER-X',
      lessonId: 'lesson-1',
      weekStartDate: '2026-06-01',
      inputSummary: { lessonIds: ['lesson-1', 'lesson-2'] },
      consumedAt: null,
    }));
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ lessons: { status: 'confirmed', lessonIds: ['lesson-1', 'lesson-2'] } }),
      ),
      getCoachRecommendationByUserAndWeek,
    });

    await getPlannedVsActual('USER-X', 'lessons_recommended_done', CLOSED_WEEK, storage as any);

    // weekStartDate da chamada de recs deve ser uma chave BRT derivada de ymdToUtcDate('2026-06-01').
    // 2026-06-01 00:00 UTC -> 2026-05-31 21:00 BRT (domingo) -> segunda BRT = 2026-05-25
    // (validado contra brtMondayYmd em weekKeys.ts). NÃO unificar com UTC (CLAUDE.md §10).
    expect(getCoachRecommendationByUserAndWeek).toHaveBeenCalled();
    const passedKey = getCoachRecommendationByUserAndWeek.mock.calls[0][1];
    expect(passedKey).toBe('2026-05-25');
    expect(passedKey).not.toBe('2026-06-01');
  });
});
