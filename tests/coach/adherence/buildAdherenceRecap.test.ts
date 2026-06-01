import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase — RF-08
//
// buildAdherenceRecap(userId, weekStartDate, injectedStorage?) -> AdherenceRecap
//   { grind: PlannedVsActual, study: PlannedVsActual, summaryText: string }
//
// Surface do recap EST-5 (semana passada). Batcha grind + estudo. Texto A4:
// cobra comportamento, NUNCA culpa. Regras de tom em arquivo único
// (adherenceRecapTone.ts, lesson #10).
//
// Lessons #34/#36 (injectedStorage), #3 (mock shape real), #10 (tom em arquivo
// único), #14/#26/#38 (await import).
// =============================================================================

async function loadEngine() {
  return await import('../../../server/coach/adherence/index');
}

const PREV_WEEK = '2026-06-01'; // semana passada (UTC), já fechada

function utc(ymd: string, h = 12): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0));
}

function planningSession(steps: Record<string, any>) {
  return {
    id: 'wps-1',
    userId: 'USER-X',
    weekStartDate: PREV_WEEK,
    status: 'completed',
    source: 'coach_manual',
    steps,
    createdAt: new Date('2026-05-25T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

function grindSession(opts: { id: string; date: string; status?: string }) {
  return { id: opts.id, userId: 'USER-X', date: utc(opts.date), status: opts.status ?? 'completed' };
}

function studyV2(opts: { id: string; registeredAt: string; durationMinutes?: number; status?: string }) {
  return {
    id: opts.id,
    userId: 'USER-X',
    mode: 'drill_gto',
    source: 'manual',
    status: opts.status ?? 'completed',
    themeId: null,
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

/** Plano com grind + estudo confirmados e dado parcial (alavanca real). */
function fullPlanStorage() {
  return makeStorage({
    getWeeklyPlanningSession: vi.fn(async () =>
      planningSession({
        grind: { status: 'confirmed', createdIds: ['a', 'b', 'c', 'd'] },
        study: { status: 'confirmed', sessionIds: ['s1', 's2', 's3'] },
      }),
    ),
    getPlannedTournaments: vi.fn(async () => [
      { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
      { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      { id: 'c', dayOfWeek: 3, time: '19:00', isActive: true },
      { id: 'd', dayOfWeek: 4, time: '19:00', isActive: true },
    ]),
    getStudyWeeklyPlan: vi.fn(async () => ({
      dailyTargetMinutes: 100,
      weekStartDate: PREV_WEEK,
      planJsonb: { days: [{}, {}, {}] },
      source: 'coach_manual',
    })),
    getGrindSessions: vi.fn(async () => [
      grindSession({ id: 'g1', date: '2026-06-01' }),
      grindSession({ id: 'g2', date: '2026-06-02' }),
    ]),
    getStudySessionsV2: vi.fn(async () => [
      studyV2({ id: 's1', registeredAt: '2026-06-02', durationMinutes: 60 }),
    ]),
  });
}

// Congela o relógio FORA da janela [2026-06-01, 2026-06-08) (DEC-MA7 /
// isWindowOpen). PREV_WEEK='2026-06-01' é a semana passada; o recap só faz sentido
// sobre janela já fechada. 2026-06-10 -> janela sempre FECHADA em qualquer data
// real do CI, evitando que de 02 a 07/06 o recap caia em window_open/'low'.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RF-08 buildAdherenceRecap — shape', () => {
  it('retorna { grind, study, summaryText } com grind/study no shape PlannedVsActual', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, fullPlanStorage() as any);

    expect(res).toHaveProperty('grind');
    expect(res).toHaveProperty('study');
    expect(typeof res.summaryText).toBe('string');

    // grind/study são PlannedVsActual completos.
    for (const dim of [res.grind, res.study]) {
      expect(dim).toHaveProperty('planned');
      expect(dim).toHaveProperty('actual');
      expect(dim).toHaveProperty('compliancePct');
      expect(dim).toHaveProperty('dataSufficiency');
      expect(dim).toHaveProperty('breakdown');
    }
  });

  it('grind usa uma métrica de grind e study usa uma métrica de estudo', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, fullPlanStorage() as any);
    expect(res.grind.sourceMetric).toMatch(/^grind_/);
    expect(res.study.sourceMetric).toMatch(/^study_/);
  });

  it('summaryText traz números planejado vs realizado (cobra comportamento, A4)', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, fullPlanStorage() as any);
    expect(res.summaryText.length).toBeGreaterThan(0);
    // Texto contém os valores planejado/realizado de grind (4 planejados, 2 realizados).
    expect(res.summaryText).toMatch(/\b4\b/);
    expect(res.summaryText).toMatch(/\b2\b/);
  });
});

describe('RF-08 tom A4 — guard de linguagem (lesson #10)', () => {
  const FORBIDDEN = [
    'você falhou',
    'voce falhou',
    'você sempre',
    'voce sempre',
    'você nunca',
    'voce nunca',
    'você deveria',
    'voce deveria',
    'deveria ter',
    'isso prova',
  ];

  it('summaryText NÃO contém linguagem de culpa (falhou/sempre/nunca/deveria ter)', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, fullPlanStorage() as any);
    const lower = res.summaryText.toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(lower.includes(phrase), `summaryText não deve conter "${phrase}"`).toBe(false);
    }
  });

  it('skip aparece como decisão neutra, não como falha', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({
          grind: { status: 'confirmed', createdIds: ['a', 'b'] },
          study: { status: 'skipped', sessionIds: ['s1', 's2'] },
        }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-01' })]),
    });

    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, storage as any);
    expect(res.study.breakdown.skipped).toBe(true);
    const lower = res.summaryText.toLowerCase();
    // Não trata o skip como falha.
    expect(lower).not.toContain('falhou');
  });

  it('dataSufficiency="low" (sem plano) -> summaryText mostra "sem dado suficiente", não compliance numérico forte (D9)', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const storage = makeStorage({ getWeeklyPlanningSession: vi.fn(async () => null) });

    const res = await buildAdherenceRecap('USER-X', PREV_WEEK, storage as any);
    expect(res.grind.dataSufficiency).toBe('low');
    expect(res.study.dataSufficiency).toBe('low');
    // Não emite um % de compliance forte; menciona ausência de dado/plano.
    expect(res.summaryText.toLowerCase()).toMatch(/sem (plano|dado)|ainda sem|dado suficiente|n[ãa]o (h[áa]|tem)/);
  });
});

describe('RF-08 buildAdherenceRecap — usa injectedStorage e é stateless', () => {
  it('usa injectedStorage (3º arg) e NÃO chama métodos de escrita', async () => {
    const { buildAdherenceRecap } = await loadEngine();
    const writeSpies = {
      createWeeklyReview: vi.fn(),
      updateWeeklyReview: vi.fn(),
      insertChatMessage: vi.fn(),
      createGrindSession: vi.fn(),
    };
    const getWeeklyPlanningSession = vi.fn(async () =>
      planningSession({ grind: { status: 'confirmed', createdIds: ['a'] } }),
    );
    const storage = makeStorage({
      ...writeSpies,
      getWeeklyPlanningSession,
      getPlannedTournaments: vi.fn(async () => [{ id: 'a', dayOfWeek: 1, time: '19:00', isActive: true }]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-01' })]),
    });

    await buildAdherenceRecap('USER-X', PREV_WEEK, storage as any);
    expect(getWeeklyPlanningSession).toHaveBeenCalled();
    for (const [name, spy] of Object.entries(writeSpies)) {
      expect(spy, `recap não deve chamar storage.${name}`).not.toHaveBeenCalled();
    }
  });
});
