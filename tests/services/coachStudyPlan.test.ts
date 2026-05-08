/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Coach tool coachStudyPlan + service orquestrador.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.1, §RF-3.4
 * ADR  : 134 (tools modulares + servicos orquestradores)
 *
 * Cobertura:
 *   - Tool coachStudyPlanTool: name, description, input_schema (RF-3.1 contrato).
 *   - Tool handler chama Anthropic SDK (mock factory pattern lesson #5: vi.fn nao eh constructor).
 *   - Service generateWeeklyStudyPlan orquestra:
 *       - coleta context (focusStats, leaks via getStatsLeaks, avgDuration, recentLessons, starredHandsRecent)
 *       - calcula daily_target_minutes: avg null -> 30; avg=20 -> 19 (95%); avg=200 -> 120 (clamp)
 *       - chama tool coachStudyPlan
 *       - valida output Zod (StudyWeeklyPlanSchema)
 *       - whitelist enforce (lessonId IN providedWhitelist; themeId IN curated/user)
 *       - retry 1x se Zod fail; se 2a falha -> erro
 *       - UPSERT study_weekly_plans
 *
 * Lessons:
 *   #5 vi.fn() nao eh constructor — Anthropic SDK requer class wrapper
 *   #14 vi.hoisted spies
 *   #10 DRY de prompts (reuso entre cron + manual)
 *
 * Status RED: server/services/studyWeeklyPlanService.ts + server/coachTools/studies/coachStudyPlan.ts NAO existem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks compartilhados via vi.hoisted (lesson #14)
// =============================================================================
const {
  storageMocks,
  anthropicCreateMock,
} = vi.hoisted(() => ({
  storageMocks: {
    listUserFocusStats: vi.fn(),
    getStatsLeaks: vi.fn(),
    getStudyThemeById: vi.fn(),
    getRecentStudySessionAvgMinutes: vi.fn(),
    upsertStudyWeeklyPlan: vi.fn(),
    listLibraryLessonsByIds: vi.fn(),
    listStarredHandsRecent: vi.fn(),
    listCuratedStudyThemes: vi.fn(),
    listLibraryLessonsCurated: vi.fn(),
  },
  anthropicCreateMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: storageMocks,
}));

// Lesson #5: vi.fn() nao eh constructor. Anthropic eh `new Anthropic(...)`. Wrap em class.
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: anthropicCreateMock };
  }
  return { default: MockAnthropic };
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(storageMocks).forEach((m: any) => m.mockReset());
  anthropicCreateMock.mockReset();
  storageMocks.listUserFocusStats.mockResolvedValue([]);
  storageMocks.getStatsLeaks.mockResolvedValue([]);
  storageMocks.listStarredHandsRecent.mockResolvedValue([]);
  storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
  storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
});

// =============================================================================
// Helper: response Anthropic com tool_use shape
// =============================================================================
function anthropicToolResponse(planJson: any) {
  return {
    id: 'msg_1',
    role: 'assistant',
    model: 'claude-opus-4-7',
    stop_reason: 'tool_use',
    usage: { input_tokens: 1200, output_tokens: 800 },
    content: [
      {
        type: 'tool_use',
        name: 'coachStudyPlan',
        id: 'toolu_1',
        input: planJson,
      },
    ],
  };
}

// =============================================================================
// Tool definition contract
// =============================================================================
describe('coachStudyPlanTool — definition (RF-3 / ADR-134)', () => {
  it('exporta tool com name=coachStudyPlan e description nao vazia', async () => {
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan');
    expect(mod.coachStudyPlanTool).toBeDefined();
    expect(mod.coachStudyPlanTool.name).toBe('coachStudyPlan');
    expect(typeof mod.coachStudyPlanTool.description).toBe('string');
    expect(mod.coachStudyPlanTool.description.length).toBeGreaterThan(20);
  });

  it('input_schema reflete o OUTPUT esperado (HIGH-1 fix): requer days', async () => {
    // Com tool_choice forcado, o tool_use.input que Claude gera DEVE casar
    // com input_schema. Como validamos via StudyWeeklyPlanSchema (que exige
    // {days: [...]}, o input_schema da tool tambem deve declarar isso.
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan');
    const schema = mod.coachStudyPlanTool.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(expect.arrayContaining(['days']));
    // Sanity: properties.days deve ser array.
    expect(schema.properties?.days?.type).toBe('array');
  });

  it('exporta StudyWeeklyPlanSchema (Zod) para validacao output', async () => {
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan.schema');
    expect(mod.StudyWeeklyPlanSchema).toBeDefined();
    expect(typeof mod.StudyWeeklyPlanSchema.parse).toBe('function');
  });

  it('Zod schema valida shape minimo (days array de StudyWeeklyPlanItem)', async () => {
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan.schema');
    const valid = {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'a-1',
              type: 'drill_gto',
              title: 'Drill 3bet',
              description: 'Foco SB vs BTN',
              estimatedMinutes: 30,
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: [],
              reasoning: 'Leak detectado',
            },
          ],
        },
      ],
    };
    expect(() => mod.StudyWeeklyPlanSchema.parse(valid)).not.toThrow();
  });

  it('Zod schema rejeita estimatedMinutes fora de [5, 120]', async () => {
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan.schema');
    const invalid = {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'a-1',
              type: 'drill_gto',
              title: 't',
              description: 'd',
              estimatedMinutes: 200, // > 120
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: [],
              reasoning: 'r',
            },
          ],
        },
      ],
    };
    expect(() => mod.StudyWeeklyPlanSchema.parse(invalid)).toThrow();
  });

  it('Zod schema rejeita type fora do enum', async () => {
    const mod: any = await import('../../server/coachTools/studies/coachStudyPlan.schema');
    const invalid = {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'a-1',
              type: 'random_activity', // invalido
              title: 't',
              description: 'd',
              estimatedMinutes: 30,
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: [],
              reasoning: 'r',
            },
          ],
        },
      ],
    };
    expect(() => mod.StudyWeeklyPlanSchema.parse(invalid)).toThrow();
  });
});

// =============================================================================
// Service: generateWeeklyStudyPlan — orquestrador
// =============================================================================
describe('generateWeeklyStudyPlan service (RF-3.1 algoritmo)', () => {
  function validPlan(): any {
    return {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'a-mon-1',
              type: 'lesson',
              title: 'Aula 4',
              description: 'C-bet OOP no flop',
              estimatedMinutes: 12,
              ctaTarget: '/biblioteca/curso/antes-das-cartas/ep-4-cbet-oop-flop/play',
              themeId: 'th-curated-1',
              lessonId: 'lesson-1',
              handIds: [],
              reasoning: 'Atende leak C-bet OOP',
            },
          ],
        },
        {
          dayLabel: 'tue',
          date: '2026-05-05',
          activities: [
            {
              itemId: 'a-tue-1',
              type: 'drill_gto',
              title: 'Drill 3bet',
              description: 'SB vs BTN',
              estimatedMinutes: 30,
              ctaTarget: null,
              themeId: 'th-curated-1',
              lessonId: null,
              handIds: [],
              reasoning: 'Leak 3bet baixo',
            },
          ],
        },
        {
          dayLabel: 'wed',
          date: '2026-05-06',
          activities: [
            {
              itemId: 'a-wed-1',
              type: 'hand_review',
              title: 'Review starred hands',
              description: 'Maos criticas pendentes',
              estimatedMinutes: 30,
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: ['hand-1'],
              reasoning: 'Spots criticos',
            },
          ],
        },
        {
          dayLabel: 'thu',
          date: '2026-05-07',
          activities: [
            {
              itemId: 'a-thu-1',
              type: 'snapshot_review',
              title: 'Review focus stats',
              description: 'Confronto com benchmark',
              estimatedMinutes: 15,
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: [],
              reasoning: 'Avaliar progresso',
            },
          ],
        },
        {
          dayLabel: 'fri',
          date: '2026-05-08',
          activities: [
            {
              itemId: 'a-fri-1',
              type: 'theory_read',
              title: 'Theory: ICM bubble',
              description: 'Leitura estruturada',
              estimatedMinutes: 20,
              ctaTarget: null,
              themeId: null,
              lessonId: null,
              handIds: [],
              reasoning: 'Reforcar fundamento',
            },
          ],
        },
      ],
    };
  }

  it('exporta funcao generateWeeklyStudyPlan({userId, source, weekStartDate?})', async () => {
    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    expect(typeof mod.generateWeeklyStudyPlan).toBe('function');
  });

  it('happy path: plano valido eh persistido via upsertStudyWeeklyPlan', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(20);
    storageMocks.listUserFocusStats.mockResolvedValue([]);
    storageMocks.getStatsLeaks.mockResolvedValue([]);
    storageMocks.listStarredHandsRecent.mockResolvedValue([]);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([
      { id: 'th-curated-1', name: 'C-bet OOP', isCurated: true },
    ]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([
      { id: 'lesson-1', title: 'Ep 4', courseSlug: 'antes-das-cartas', lessonSlug: 'ep-4-cbet-oop-flop' },
    ]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      userId: 'USER-0001',
      planJsonb: validPlan(),
      source: 'coach_manual',
      dailyTargetMinutes: 19,
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    const r = await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_manual',
      weekStartDate: new Date('2026-05-04'),
    });

    expect(storageMocks.upsertStudyWeeklyPlan).toHaveBeenCalled();
    expect(r).toMatchObject({ source: 'coach_manual' });
  });

  it('daily_target_minutes: avg=null -> default 30', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(null);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 30,
      source: 'coach_auto',
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    const args = storageMocks.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(args.dailyTargetMinutes).toBe(30);
  });

  it('daily_target_minutes: avg=200 -> clamp para 120', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(200);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 120,
      source: 'coach_auto',
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    const args = storageMocks.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(args.dailyTargetMinutes).toBeLessThanOrEqual(120);
  });

  it('daily_target_minutes: avg=20 -> ~19 (95% clamp 15-120)', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(20);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 19,
      source: 'coach_auto',
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    const args = storageMocks.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(args.dailyTargetMinutes).toBeGreaterThanOrEqual(15);
    expect(args.dailyTargetMinutes).toBeLessThanOrEqual(20);
  });

  it('retry 1x quando primeiro output falha Zod (segunda tentativa valida)', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(30);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);

    // Primeira chamada: payload invalido (estimatedMinutes 999)
    const invalidPlan = { days: [{ dayLabel: 'mon', date: '2026-05-04', activities: [{ itemId: 'a', type: 'other', title: 't', description: 'd', estimatedMinutes: 999, ctaTarget: null, themeId: null, lessonId: null, handIds: [], reasoning: 'r' }] }] };
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicToolResponse(invalidPlan))
      .mockResolvedValueOnce(anthropicToolResponse(validPlan()));

    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 30,
      source: 'coach_auto',
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
  });

  it('throws apos 2 falhas Zod consecutivas (sem fallback silencioso)', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(30);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    const invalidPlan = { days: [] }; // 0 dias = invalido
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(invalidPlan));

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await expect(
      mod.generateWeeklyStudyPlan({
        userId: 'USER-0001',
        source: 'coach_auto',
        weekStartDate: new Date('2026-05-04'),
      }),
    ).rejects.toThrow();
  });

  it('whitelist enforce: lessonId fora do whitelist -> reject ou retry', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(30);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([
      { id: 'th-1', name: 'X', isCurated: true },
    ]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([
      { id: 'lesson-1', title: 'Ep 4', courseSlug: 'antes-das-cartas', lessonSlug: 'ep-4' },
    ]);

    // Coach inventou lessonId 'lesson-FAKE' (nao no whitelist)
    const planWithFakeLesson = {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'a-1',
              type: 'lesson',
              title: 't',
              description: 'd',
              estimatedMinutes: 12,
              ctaTarget: null,
              themeId: 'th-1',
              lessonId: 'lesson-FAKE',
              handIds: [],
              reasoning: 'r',
            },
          ],
        },
        { dayLabel: 'tue', date: '2026-05-05', activities: [] },
        { dayLabel: 'wed', date: '2026-05-06', activities: [] },
        { dayLabel: 'thu', date: '2026-05-07', activities: [] },
        { dayLabel: 'fri', date: '2026-05-08', activities: [] },
      ],
    };

    anthropicCreateMock
      .mockResolvedValueOnce(anthropicToolResponse(planWithFakeLesson))
      .mockResolvedValueOnce(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 30,
      source: 'coach_auto',
      completedItemsJsonb: [],
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    // Esperado: pelo menos 1 retry (pode ser >= 2 calls)
    expect(anthropicCreateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('telemetria captura cost_tokens_used (input + output) no UPSERT', async () => {
    storageMocks.getRecentStudySessionAvgMinutes.mockResolvedValue(30);
    storageMocks.listCuratedStudyThemes.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validPlan()));
    storageMocks.upsertStudyWeeklyPlan.mockResolvedValue({
      id: 'swp-1',
      planJsonb: validPlan(),
      dailyTargetMinutes: 30,
      source: 'coach_auto',
      completedItemsJsonb: [],
      costTokensUsed: 2000,
    });

    const mod: any = await import('../../server/services/studyWeeklyPlanService');
    await mod.generateWeeklyStudyPlan({
      userId: 'USER-0001',
      source: 'coach_auto',
      weekStartDate: new Date('2026-05-04'),
    });

    const args = storageMocks.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(args.costTokensUsed).toBeGreaterThan(0);
  });
});
