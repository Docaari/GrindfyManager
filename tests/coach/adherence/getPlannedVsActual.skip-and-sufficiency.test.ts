import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase
//
// Cobre: RF-06 (skipped vs notDone), RF-07 (dataSufficiency low + degrade
// gracioso + log antes do fallback lesson #9 + window_open DEC-MA7), chave UTC.
//
// Lessons #34/#36 (injectedStorage), #3 (mock shape real), #9 (log antes do
// fallback), #11 (nunca fabrica dado), #14/#26/#38 (await import).
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
  return { id: opts.id, userId: 'USER-X', date: utc(opts.date), status: opts.status ?? 'completed' };
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

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// RF-06 — pulado conscientemente vs não feito (A4, DEC-MA5)
// =============================================================================
describe('RF-06 skipped vs notDone', () => {
  it('steps.grind.status="skipped" -> breakdown.skipped=true, compliancePct=null (decisão consciente, não falha)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'skipped', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.breakdown.skipped).toBe(true);
    expect(res.compliancePct).toBeNull();
  });

  it('skipped NÃO conta como falha: shortfall fica null (não pontua nem como gap)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ study: { status: 'skipped', sessionIds: ['s1', 's2'] } }),
      ),
      getStudySessionsV2: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'study_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.breakdown.skipped).toBe(true);
    expect(res.breakdown.shortfall).toBeNull();
  });

  it('steps.study.status="confirmed", planned=4 actual=2 -> skipped=false, shortfall=2 (gap real)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ study: { status: 'confirmed', sessionIds: ['s1', 's2', 's3', 's4'] } }),
      ),
      getStudySessionsV2: vi.fn(async () => [
        { id: 's1', userId: 'USER-X', status: 'completed', durationMinutes: 60, mode: 'drill_gto', registeredAt: utc('2026-06-02'), startedAt: utc('2026-06-02'), themeId: null },
        { id: 's2', userId: 'USER-X', status: 'completed', durationMinutes: 60, mode: 'drill_gto', registeredAt: utc('2026-06-03'), startedAt: utc('2026-06-03'), themeId: null },
      ]),
    });

    const res = await getPlannedVsActual('USER-X', 'study_sessions_count', CLOSED_WEEK, storage as any);
    expect(res.breakdown.skipped).toBe(false);
    expect(res.breakdown.shortfall).toBe(2);
  });

  it('ausência sem skip (status confirmed, planned>0, actual=0) é "não feito" — skipped=false', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.breakdown.skipped).toBe(false);
  });
});

// =============================================================================
// RF-07 / DEC-MA7 — dataSufficiency: window_open quando janela ainda em curso
// =============================================================================
describe('RF-07 / DEC-MA7 — janela aberta vs fechada', () => {
  it('janela da semana CORRENTE (now < weekStart+7d) -> dataSufficiency="low", note="window_open"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    // Congela o relógio DENTRO da janela [2026-06-01, 2026-06-08): 2026-06-03.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));

    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.dataSufficiency).toBe('low');
    expect(res.breakdown.note).toBe('window_open');
  });

  it('janela FECHADA (now >= weekStart+7d) com plano + dado -> dataSufficiency="ok"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T00:00:00Z')); // depois de 2026-06-08

    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a', 'b'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [
        { id: 'a', dayOfWeek: 1, time: '19:00', isActive: true },
        { id: 'b', dayOfWeek: 2, time: '19:00', isActive: true },
      ]),
      getGrindSessions: vi.fn(async () => [grindSession({ id: 'g1', date: '2026-06-02' })]),
    });

    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.dataSufficiency).toBe('ok');
  });
});

// =============================================================================
// RF-07 — degradação graciosa (lesson #9 log antes do fallback, lesson #11 sem dado fabricado)
// =============================================================================
describe('RF-07 degradação graciosa', () => {
  it('getStatsLeaks=[] (stub) -> themes_focus_studied degrada: planned=null, low, note="source_stub", flow não quebra', async () => {
    const { getPlannedVsActual } = await loadEngine();
    // themes step sem focus (origem em getStatsLeaks stub).
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ themes: { status: 'proposed', focus: [] } }),
      ),
      getStatsLeaks: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'themes_focus_studied', CLOSED_WEEK, storage as any);
    expect(res.planned).toBeNull();
    expect(res.dataSufficiency).toBe('low');
    expect(res.breakdown.note).toBe('source_stub');
  });

  it('themes degrade EMITE log antes do fallback (lesson #9)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ themes: { status: 'proposed', focus: [] } }),
      ),
      getStatsLeaks: vi.fn(async () => []),
    });

    await getPlannedVsActual('USER-X', 'themes_focus_studied', CLOSED_WEEK, storage as any);
    const logged = errSpy.mock.calls.length + warnSpy.mock.calls.length;
    expect(logged).toBeGreaterThan(0);

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('fonte que THROW -> motor captura, loga {userId, sourceMetric, err}, retorna low e NÃO propaga exceção', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: ['a'] } }),
      ),
      getPlannedTournaments: vi.fn(async () => [{ id: 'a', dayOfWeek: 1, time: '19:00', isActive: true }]),
      getGrindSessions: vi.fn(async () => {
        throw new Error('db explodiu');
      }),
    });

    // NÃO deve rejeitar — degrada.
    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.dataSufficiency).toBe('low');
    expect(res.breakdown.note).toBe('source_error');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('fonte vazia NUNCA produz compliancePct com veredito forte (lesson #11 — null, não 0-com-veredito)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ themes: { status: 'proposed', focus: [] } }),
      ),
      getStatsLeaks: vi.fn(async () => []),
    });

    const res = await getPlannedVsActual('USER-X', 'themes_focus_studied', CLOSED_WEEK, storage as any);
    expect(res.compliancePct).toBeNull();
    expect(res.compliancePct).not.toBe(0);
  });
});

// =============================================================================
// Chave UTC — getWeeklyPlanningSession recebe a chave UTC crua (não BRT)
// =============================================================================
describe('chave de semana UTC (CLAUDE.md §10 — não unifica com BRT)', () => {
  it('getWeeklyPlanningSession recebe weekStartDate UTC exato (mesma key de weekly_planning_sessions)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const getWeeklyPlanningSession = vi.fn(async () => null);
    const storage = makeStorage({ getWeeklyPlanningSession });

    await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(getWeeklyPlanningSession).toHaveBeenCalledWith('USER-X', '2026-06-01');
    // Garante que NÃO converteu para BRT (2026-05-25) na leitura do plano UTC.
    expect(getWeeklyPlanningSession.mock.calls[0][1]).not.toBe('2026-05-25');
  });
});
