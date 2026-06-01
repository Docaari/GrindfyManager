import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase
//
// Módulo alvo (AINDA NÃO EXISTE):
//   server/coach/adherence/index.ts
//     getPlannedVsActual(userId, sourceMetric, period, injectedStorage?) -> PlannedVsActual
//     buildAdherenceRecap(userId, weekStartDate, injectedStorage?) -> AdherenceRecap
//   server/coach/adherence/types.ts   (contrato estável DEC-A7)
//   server/coach/adherence/sourceMetricMap.ts (SOURCE_METRIC_MAP + DIMENSION_KEY_BY_METRIC)
//
// Cobre: RF-01 (contrato puro/stateless/injectedStorage), RF-04 (compliance null),
// regras do contrato (allowlist, idempotência, breakdown sempre presente).
//
// Lessons aplicadas:
//   #34/#36 — injectedStorage 3º arg por composição (sem vi.mock('../storage') global).
//   #3/C1   — mocks espelham shape REAL do storage (validado contra fontes; ver
//             cabeçalho dos helpers de mock abaixo, com file:line).
//   #14/#26/#38 — usa `await import` (não require) para carregar o módulo do motor.
//   #9      — log antes do fallback verificado nos testes de degrade (arquivo dedicado).
//
// .test.ts roda no projeto "server" (node) — sem RTL/renderHook (vitest.config projects).
// =============================================================================

async function loadEngine() {
  return await import('../../../server/coach/adherence/index');
}

// -----------------------------------------------------------------------------
// SHAPES REAIS validados (lesson #3) — NÃO idealizar.
//   weekly_planning_sessions: server/storage/weeklyPlanningStorage.ts:113 (getWeeklyPlanningSession)
//     + rowToSession:25 -> { id,userId,weekStartDate(string),status,source,steps,createdAt,updatedAt }
//   steps jsonb shape: shared/coach-planning.ts:39-83
//     grind  { status, createdIds?[], offDays?[] }
//     study  { status, sessionIds?[], weeklyPlanSynced? }
//     lessons{ status, lessonIds?[], recIds?[], lessons?[] }
//     themes { status, focus?[{statId,statName,severity?,source?}] }
//   planned_tournaments: storage.ts:3980 getPlannedTournaments(userId, dayOfWeek?)
//     schema shared/schema.ts:576 -> { id,userId,dayOfWeek(int 0-6),time(HH:MM),isActive,... }
//     NÃO TEM scheduledDate (RECORRENTE) — ADR-227 achados §getPlannedTournaments.
//   grind_sessions: storage.ts:1779 getGrindSessions(userId,{limit?,offset?})
//     schema:635 -> { id,userId,date(timestamp Date),status(varchar 'planned'|'completed'|...),... }
//     SEM filtro de status/range no SQL -> motor filtra in-memory.
//   study_sessions_v2: storage.ts:14904 getStudySessionsV2(userId,{mode?,from?,to?,limit?})
//     schema:2427 -> { id,userId,status(default 'completed'),durationMinutes(int notNull),
//                      themeId,mode,registeredAt,startedAt,... } ; deletedAt filtrado no SQL.
//   study_weekly_plans: storage.ts:15692 getStudyWeeklyPlan(userId, weekStartDate?: Date)
//     schema:5200 -> { dailyTargetMinutes(int notNull),planJsonb, weekStartDate(date),... }
//   session_tournaments: storage.ts:4145 getSessionTournaments(userId, sessionId?)
//     schema:710 -> { id,userId,sessionId,buyIn,... }
//   coach_lesson_recommendations: storage.ts:14215 getCoachRecommendationByUserAndWeek(userId, weekStartDateBrt)
//     schema:4909 -> { id,userId,lessonId,weekStartDate(date BRT),inputSummary jsonb,consumedAt,... }
//   getStatsLeaks: storage.ts:9614 -> STUB retorna [].
// -----------------------------------------------------------------------------

// Janela de teste fechada (no passado) — `dataSufficiency='ok'` quando há plano+dado.
// 2026-06-01 é uma segunda-feira UTC; a janela [2026-06-01, 2026-06-08) já fechou.
const CLOSED_WEEK = { kind: 'week' as const, weekStartDate: '2026-06-01' };

function utc(ymd: string, h = 12): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0));
}

/** Sessão de planning com `steps` no shape real (coach-planning.ts). */
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

/** grind_session no shape real (schema:635) — só os campos que o motor lê. */
function grindSession(opts: { id: string; date: string; status?: string }) {
  return {
    id: opts.id,
    userId: 'USER-X',
    date: utc(opts.date),
    status: opts.status ?? 'completed',
    duration: 120,
    profitLoss: '0',
  };
}

/**
 * Mock de storage por composição (lesson #34). Só os métodos de LEITURA que o
 * motor usa. Defaults conservadores; cada teste sobrescreve o necessário.
 * NENHUM método de escrita aqui — guard test de statelessness cobre isso.
 */
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

// Congela o relógio FORA da janela [2026-06-01, 2026-06-08) para tornar
// determinístico o ramo "janela fechada" (DEC-MA7 / isWindowOpen). 2026-06-10 é
// 2 dias após o fim exclusivo da janela -> isWindowOpen=false em QUALQUER data
// real de CI. Sem isso os asserts `dataSufficiency:'ok'` quebrariam de 02 a 07/06
// (janela aberta -> 'low' + note 'window_open'). Nenhum teste deste arquivo
// depende de janela aberta, então congelar no beforeEach é seguro.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// RF-01 — contrato puro + injectedStorage + allowlist
// =============================================================================
describe('RF-01 getPlannedVsActual — contrato base', () => {
  it('retorna o shape estável { sourceMetric, period, planned, actual, compliancePct, dataSufficiency, breakdown }', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['pt-1'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'pt-1', userId: 'USER-X', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);

    expect(res).toMatchObject({
      sourceMetric: 'grind_sessions_count',
      period: CLOSED_WEEK,
    });
    expect(res).toHaveProperty('planned');
    expect(res).toHaveProperty('actual');
    expect(res).toHaveProperty('compliancePct');
    expect(res).toHaveProperty('dataSufficiency');
    expect(res).toHaveProperty('breakdown');
  });

  it('breakdown sempre presente com os 4 campos (skipped, shortfall, overachieved, note)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage(); // sem plano
    const res = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);

    expect(res.breakdown).toBeDefined();
    expect(res.breakdown).not.toBeUndefined();
    expect(typeof res.breakdown.skipped).toBe('boolean');
    expect('shortfall' in res.breakdown).toBe(true);
    expect(typeof res.breakdown.overachieved).toBe('boolean');
    expect('note' in res.breakdown).toBe(true);
  });

  it('sourceMetric fora da allowlist -> throw nomeado (code/name "unknown_source_metric"), NÃO 500 genérico', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage();

    await expect(
      getPlannedVsActual('USER-X', 'metric_que_nao_existe' as any, CLOSED_WEEK, storage as any),
    ).rejects.toMatchObject({ code: 'unknown_source_metric' });
  });

  it('warmup_compliance está no union mas SEM entrada no MAP (DEC-MA8 deferido) -> unknown_source_metric', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage();

    await expect(
      getPlannedVsActual('USER-X', 'warmup_compliance', CLOSED_WEEK, storage as any),
    ).rejects.toMatchObject({ code: 'unknown_source_metric' });
  });

  it('idempotência por leitura: 2 chamadas com mesmos args -> mesmo resultado', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['pt-1'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'pt-1', userId: 'USER-X', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
    });

    const a = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    const b = await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    expect(a).toEqual(b);
  });

  it('usa o injectedStorage (3º arg) — invoca métodos do mock, não importa ../storage', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const getWeeklyPlanningSession = vi.fn(async () => null);
    const storage = makeStorage({ getWeeklyPlanningSession });

    await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    expect(getWeeklyPlanningSession).toHaveBeenCalled();
    // 1º arg = userId, 2º arg = weekStartDate UTC string (alinhado a weekly_planning_sessions).
    expect(getWeeklyPlanningSession.mock.calls[0][0]).toBe('USER-X');
    expect(getWeeklyPlanningSession.mock.calls[0][1]).toBe('2026-06-01');
  });
});

// =============================================================================
// Statelessness guard (RNF read-only) — nenhum método de escrita invocado
// =============================================================================
describe('RNF statelessness — motor é read-only', () => {
  it('NÃO invoca nenhum método de escrita do storage (create/update/insert/delete/...)', async () => {
    const { getPlannedVsActual } = await loadEngine();

    // Storage com TODOS os write methods plausíveis presentes como spies. Se o
    // motor chamar QUALQUER um, o guard falha (statelessness violada).
    const writeSpies = {
      createWeeklyPlanningSession: vi.fn(),
      updateWeeklyPlanningSession: vi.fn(),
      createWeeklyReview: vi.fn(),
      updateWeeklyReview: vi.fn(),
      createCoachRecommendation: vi.fn(),
      deleteCoachRecommendationsForWeek: vi.fn(),
      createGrindSession: vi.fn(),
      updateGrindSession: vi.fn(),
      createStudySessionV2: vi.fn(),
      updateStudySessionV2: vi.fn(),
      upsertStudyWeeklyPlan: vi.fn(),
      insertChatMessage: vi.fn(),
      createPlannedTournament: vi.fn(),
    };
    const storage = makeStorage({
      ...writeSpies,
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['pt-1'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'pt-1', userId: 'USER-X', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
    });

    await getPlannedVsActual('USER-X', 'grind_sessions_count', CLOSED_WEEK, storage as any);
    await getPlannedVsActual('USER-X', 'study_minutes', CLOSED_WEEK, storage as any);

    for (const [name, spy] of Object.entries(writeSpies)) {
      expect(spy, `motor não deve chamar storage.${name}`).not.toHaveBeenCalled();
    }
  });
});

// =============================================================================
// RF-04 — compliancePct null em 3 casos + planned:null ≠ planned:0 + overachieve
// =============================================================================
describe('RF-04 regra do compliance', () => {
  it('planned > 0: compliancePct = min(100, round(actual/planned*100)) (4/3 -> 75)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b', 'c', 'd'] } }),
      ),
      // 4 dias distintos planejados (dayOfWeek distintos)
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

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(4);
    expect(res.actual).toBe(3);
    expect(res.compliancePct).toBe(75);
    expect(res.dataSufficiency).toBe('ok');
  });

  it('planned === 0 (descanso planejado) -> compliancePct=null, note="planned_zero", dataSufficiency="ok"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    // grind step confirmado mas SEM torneios planejados -> planejou explicitamente 0.
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: [] } }),
      ),
      getPlannedTournaments: vi.fn(async () => []),
      getGrindSessions: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(0);
    expect(res.compliancePct).toBeNull();
    expect(res.breakdown.note).toBe('planned_zero');
    expect(res.dataSufficiency).toBe('ok');
  });

  it('planned === null (sem weekly_planning_sessions) -> compliancePct=null, dataSufficiency="low", note="no_plan"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({ getWeeklyPlanningSession: vi.fn(async () => null) });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.planned).toBeNull();
    expect(res.compliancePct).toBeNull();
    expect(res.dataSufficiency).toBe('low');
    expect(res.breakdown.note).toBe('no_plan');
  });

  it('planned:null é DISTINTO de planned:0 (no_plan vs planned_zero)', async () => {
    const { getPlannedVsActual } = await loadEngine();

    const noPlan = makeStorage({ getWeeklyPlanningSession: vi.fn(async () => null) });
    const plannedZero = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: [] } }),
      ),
      getPlannedTournaments: vi.fn(async () => []),
    });

    const a = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, noPlan as any);
    const b = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, plannedZero as any);

    expect(a.planned).toBeNull();
    expect(b.planned).toBe(0);
    expect(a.breakdown.note).toBe('no_plan');
    expect(b.breakdown.note).toBe('planned_zero');
    expect(a.dataSufficiency).toBe('low');
    expect(b.dataSufficiency).toBe('ok');
  });

  it('actual > planned (fez mais do que planejou) -> compliancePct clampa em 100 + overachieved=true', async () => {
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
        grindSession({ id: 'g4', date: '2026-06-04' }),
        grindSession({ id: 'g5', date: '2026-06-05' }),
        grindSession({ id: 'g6', date: '2026-06-06' }),
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(4);
    expect(res.actual).toBe(6);
    expect(res.compliancePct).toBe(100);
    expect(res.breakdown.overachieved).toBe(true);
  });

  it('actual=0, planned=4, sem skip -> compliancePct=0, skipped=false, shortfall=4 (gap real "não feito")', async () => {
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
      getGrindSessions: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.planned).toBe(4);
    expect(res.actual).toBe(0);
    expect(res.compliancePct).toBe(0);
    expect(res.breakdown.skipped).toBe(false);
    expect(res.breakdown.shortfall).toBe(4);
  });
});
