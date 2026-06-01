import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase
//
// AdherenceNote é vocabulário FECHADO (estável). Cada caso produz a note correta.
// Vocabulário: planned_zero | no_plan | window_open | source_stub | source_error
//            | plan_from_weekly_plan | null.
//
// Lessons #34/#36 (injectedStorage), #3 (mock shape real), #14/#26/#38 (await import).
// =============================================================================

async function loadEngine() {
  return await import('../../../server/coach/adherence/index');
}

const CLOSED_WEEK = { kind: 'week' as const, weekStartDate: '2026-06-01' };
const ALLOWED_NOTES = new Set([
  'planned_zero',
  'no_plan',
  'window_open',
  'source_stub',
  'source_error',
  'plan_from_weekly_plan',
  null,
]);

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
// isWindowOpen). 2026-06-10 -> janela sempre FECHADA em qualquer data real do CI.
// Sem isso, de 02 a 07/06 a janela ficaria aberta e a note 'window_open' poluiria
// os casos que esperam 'planned_zero'/'no_plan'/'source_stub'/null. O vocabulário
// fechado inclui 'window_open', mas nenhum teste aqui o exige propositalmente.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdherenceNote — vocabulário fechado', () => {
  it('a note retornada está SEMPRE dentro do vocabulário fechado (qualquer caso)', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const scenarios = [
      // no_plan
      makeStorage({ getWeeklyPlanningSession: vi.fn(async () => null) }),
      // planned_zero
      makeStorage({
        getWeeklyPlanningSession: vi.fn(async () =>
          planningSession({ grind: { status: 'confirmed', createdIds: [] } }),
        ),
        getPlannedTournaments: vi.fn(async () => []),
      }),
      // source_stub (themes)
      makeStorage({
        getWeeklyPlanningSession: vi.fn(async () =>
          planningSession({ themes: { status: 'proposed', focus: [] } }),
        ),
        getStatsLeaks: vi.fn(async () => []),
      }),
      // source_error
      makeStorage({
        getWeeklyPlanningSession: vi.fn(async () =>
          planningSession({ grind: { status: 'confirmed', createdIds: ['a'] } }),
        ),
        getPlannedTournaments: vi.fn(async () => [{ id: 'a', dayOfWeek: 1, time: '19:00', isActive: true }]),
        getGrindSessions: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    ];

    const metrics = ['grind_days', 'grind_days', 'themes_focus_studied', 'grind_days'] as const;
    for (let i = 0; i < scenarios.length; i++) {
      const res = await getPlannedVsActual('USER-X', metrics[i], CLOSED_WEEK, scenarios[i] as any);
      expect(ALLOWED_NOTES.has(res.breakdown.note as any), `note "${res.breakdown.note}" fora do vocabulário`).toBe(true);
    }

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('no_plan: sem weekly_planning_sessions -> note="no_plan"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({ getWeeklyPlanningSession: vi.fn(async () => null) });
    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.breakdown.note).toBe('no_plan');
  });

  it('planned_zero: plano confirmado com 0 itens -> note="planned_zero"', async () => {
    const { getPlannedVsActual } = await loadEngine();
    const storage = makeStorage({
      getWeeklyPlanningSession: vi.fn(async () =>
        planningSession({ grind: { status: 'confirmed', createdIds: [] } }),
      ),
      getPlannedTournaments: vi.fn(async () => []),
    });
    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.breakdown.note).toBe('planned_zero');
  });

  it('happy path com plano+dado completos -> note=null (nada a sinalizar)', async () => {
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
        { id: 'g1', userId: 'USER-X', date: utc('2026-06-01'), status: 'completed' },
        { id: 'g2', userId: 'USER-X', date: utc('2026-06-02'), status: 'completed' },
      ]),
    });
    const res = await getPlannedVsActual('USER-X', 'grind_days', CLOSED_WEEK, storage as any);
    expect(res.breakdown.note).toBeNull();
  });
});
