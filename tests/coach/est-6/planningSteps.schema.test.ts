import { describe, it, expect } from 'vitest';

// =============================================================================
// EST-6 / ADR-224 — shared types + Zod schema (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE): shared/coach-planning.ts
//   - PLANNING_STEP_KEYS / PLANNING_STEP_STATUSES / PLANNING_SESSION_STATUSES /
//     PLANNING_SOURCES
//   - planningStepsSchema (Zod)
//   - initialPlanningSteps()
//   - startPlanningBodySchema / stepParamSchema
// =============================================================================

async function loadShared() {
  return await import('../../../shared/coach-planning');
}

describe('EST-6 shared constants', () => {
  it('PLANNING_STEP_KEYS = [grind, study, lessons, themes] nesta ordem', async () => {
    const m = await loadShared();
    expect(m.PLANNING_STEP_KEYS).toEqual(['grind', 'study', 'lessons', 'themes']);
  });

  it('PLANNING_STEP_STATUSES contem os 4 status validos (presenca individual — lesson #8)', async () => {
    const m = await loadShared();
    for (const s of ['pending', 'proposed', 'confirmed', 'skipped']) {
      expect(m.PLANNING_STEP_STATUSES).toContain(s);
    }
  });

  it('PLANNING_SESSION_STATUSES contem in_progress, completed, abandoned', async () => {
    const m = await loadShared();
    for (const s of ['in_progress', 'completed', 'abandoned']) {
      expect(m.PLANNING_SESSION_STATUSES).toContain(s);
    }
  });

  it('PLANNING_SOURCES contem coach_manual e est5_ritual', async () => {
    const m = await loadShared();
    for (const s of ['coach_manual', 'est5_ritual']) {
      expect(m.PLANNING_SOURCES).toContain(s);
    }
  });
});

describe('EST-6 initialPlanningSteps()', () => {
  it('retorna os 4 passos com status pending', async () => {
    const { initialPlanningSteps } = await loadShared();
    const steps = initialPlanningSteps();
    expect(steps.grind.status).toBe('pending');
    expect(steps.study.status).toBe('pending');
    expect(steps.lessons.status).toBe('pending');
    expect(steps.themes.status).toBe('pending');
  });

  it('passa pelo planningStepsSchema (estado inicial valido)', async () => {
    const { initialPlanningSteps, planningStepsSchema } = await loadShared();
    const parsed = planningStepsSchema.safeParse(initialPlanningSteps());
    expect(parsed.success).toBe(true);
  });

  it('retorna objetos independentes a cada chamada (sem alias compartilhado)', async () => {
    const { initialPlanningSteps } = await loadShared();
    const a = initialPlanningSteps();
    const b = initialPlanningSteps();
    a.grind.status = 'confirmed' as any;
    expect(b.grind.status).toBe('pending');
  });
});

describe('EST-6 planningStepsSchema validacao', () => {
  it('aceita um status valido por passo', async () => {
    const { planningStepsSchema } = await loadShared();
    const ok = planningStepsSchema.safeParse({
      grind: { status: 'confirmed', createdIds: ['pt_1'] },
      study: { status: 'skipped' },
      lessons: { status: 'proposed' },
      themes: { status: 'pending' },
    });
    expect(ok.success).toBe(true);
  });

  it('rejeita um status invalido', async () => {
    const { planningStepsSchema } = await loadShared();
    const bad = planningStepsSchema.safeParse({
      grind: { status: 'done' }, // invalido
      study: { status: 'pending' },
      lessons: { status: 'pending' },
      themes: { status: 'pending' },
    });
    expect(bad.success).toBe(false);
  });

  it('aceita campos opcionais por passo (createdIds/sessionIds/lessonIds/focus)', async () => {
    const { planningStepsSchema } = await loadShared();
    const ok = planningStepsSchema.safeParse({
      grind: { status: 'confirmed', createdIds: ['pt_1', 'pt_2'], offDays: ['2026-06-10'] },
      study: { status: 'confirmed', sessionIds: ['ss_1'], weeklyPlanSynced: true },
      lessons: { status: 'confirmed', lessonIds: ['l_1'], recIds: ['rec_1'] },
      themes: {
        status: 'confirmed',
        focus: [{ statId: 'vpip', statName: 'VPIP', severity: 'high', source: 'leaks' }],
      },
    });
    expect(ok.success).toBe(true);
  });
});

describe('EST-6 startPlanningBodySchema + stepParamSchema', () => {
  it('startPlanningBodySchema aceita body vazio e aplica source default coach_manual', async () => {
    const { startPlanningBodySchema } = await loadShared();
    const parsed = startPlanningBodySchema.parse({});
    expect(parsed.source).toBe('coach_manual');
    expect(parsed.weekStartDate).toBeUndefined();
  });

  it('startPlanningBodySchema aceita weekStartDate YYYY-MM-DD e source est5_ritual', async () => {
    const { startPlanningBodySchema } = await loadShared();
    const parsed = startPlanningBodySchema.parse({
      weekStartDate: '2026-06-08',
      source: 'est5_ritual',
    });
    expect(parsed.weekStartDate).toBe('2026-06-08');
    expect(parsed.source).toBe('est5_ritual');
  });

  it('startPlanningBodySchema rejeita weekStartDate fora de YYYY-MM-DD', async () => {
    const { startPlanningBodySchema } = await loadShared();
    expect(startPlanningBodySchema.safeParse({ weekStartDate: '08/06/2026' }).success).toBe(false);
  });

  it('stepParamSchema aceita os 4 steps e rejeita invalido', async () => {
    const { stepParamSchema } = await loadShared();
    for (const s of ['grind', 'study', 'lessons', 'themes']) {
      expect(stepParamSchema.safeParse(s).success).toBe(true);
    }
    expect(stepParamSchema.safeParse('warmup').success).toBe(false);
  });
});
