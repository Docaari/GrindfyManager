/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Coach tool coachSessionInsights + service orquestrador.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.3
 * ADRs : 133 (cache em tabela), 134 (tools modulares + service)
 *
 * Cobertura:
 *   - Tool coachSessionInsightsTool: name, description, input_schema (sessionContext required).
 *   - SessionInsightsSchema (Zod) valida shape com summary, topHands, suggestedLessons,
 *     spotsToReview, focusStatsHighlight.
 *   - Service getOrGenerateCoachSessionInsights:
 *       - ownership check (NOT_OWNER se user nao eh dono)
 *       - finalized check (SESSION_NOT_FINALIZED se sessao em running)
 *       - cache hit retorna sem chamar Coach
 *       - cache miss chama Coach + valida output Zod + UPSERT
 *       - whitelist handId enforcement: handId fora dos starredHands.id da sessao -> reject + retry
 *       - retry 1x se Zod fail
 *
 * Lessons:
 *   #5 vi.fn nao constructor (Anthropic class wrap)
 *   #14 vi.hoisted spies
 *
 * Status RED: server/services/coachSessionInsightsService.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  storageMocks,
  anthropicCreateMock,
} = vi.hoisted(() => ({
  storageMocks: {
    getGrindSession: vi.fn(),
    getCoachSessionInsights: vi.fn(),
    upsertCoachSessionInsights: vi.fn(),
    getTournamentsByGrindSession: vi.fn(),
    getStarredHandsByGrindSession: vi.fn(),
    listUserFocusStats: vi.fn(),
    listLibraryLessonsCurated: vi.fn(),
  },
  anthropicCreateMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: storageMocks,
}));

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
});

function anthropicToolResponse(insightsJson: any) {
  return {
    id: 'msg_2',
    role: 'assistant',
    model: 'claude-opus-4-7',
    stop_reason: 'tool_use',
    usage: { input_tokens: 1500, output_tokens: 600 },
    content: [
      {
        type: 'tool_use',
        name: 'coachSessionInsights',
        id: 'toolu_2',
        input: insightsJson,
      },
    ],
  };
}

function validInsights(): any {
  return {
    summary: 'Sessao 4h, 22 torneios, +$143. C-bet OOP em 3-bet pots fraco.',
    topHands: [
      {
        handId: 'spot-1',
        title: 'BB defense vs UTG 3bet',
        rationale: 'Pot 25BB, voce check-fold com middle pair OOP.',
        action: 'review',
        ctaUrl: '/estudos/spots/spot-1',
        handBadge: 'big_pot',
      },
    ],
    suggestedLessons: [
      {
        lessonId: 'lesson-1',
        title: 'Ep 4: C-bet OOP',
        courseSlug: 'antes-das-cartas',
        lessonSlug: 'ep-4-cbet-oop',
        rationale: 'Cobre o leak C-bet OOP da sessao.',
        durationSeconds: 720,
      },
    ],
    spotsToReview: [
      { spotId: 'spot-1', label: 'Spot 1 BB defense', suggestedAction: 'add_insight' },
    ],
    focusStatsHighlight: [
      { statId: 'cbet_flop_oop', statName: 'C-bet OOP', occurredCount: 8, rationale: 'Decisoes c-bet repetidas.' },
    ],
  };
}

// =============================================================================
// Tool definition
// =============================================================================
describe('coachSessionInsightsTool — definition', () => {
  it('exporta tool com name=coachSessionInsights', async () => {
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights');
    expect(mod.coachSessionInsightsTool).toBeDefined();
    expect(mod.coachSessionInsightsTool.name).toBe('coachSessionInsights');
  });

  it('input_schema reflete o OUTPUT esperado (HIGH-1 fix): summary + arrays', async () => {
    // Com tool_choice forcado, tool_use.input casa input_schema; logo o
    // schema deve refletir o que SessionInsightsSchema valida.
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights');
    const schema = mod.coachSessionInsightsTool.input_schema;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'summary',
        'topHands',
        'suggestedLessons',
        'spotsToReview',
        'focusStatsHighlight',
      ]),
    );
  });

  it('SessionInsightsSchema valida shape com summary + arrays', async () => {
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights.schema');
    expect(() => mod.SessionInsightsSchema.parse(validInsights())).not.toThrow();
  });

  it('SessionInsightsSchema rejeita summary > 200 chars', async () => {
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights.schema');
    const invalid = { ...validInsights(), summary: 'x'.repeat(300) };
    expect(() => mod.SessionInsightsSchema.parse(invalid)).toThrow();
  });

  it('SessionInsightsSchema rejeita topHands com mais de 3 items', async () => {
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights.schema');
    const tooMany = {
      ...validInsights(),
      topHands: Array.from({ length: 5 }, (_, i) => ({
        handId: `spot-${i}`,
        title: 't',
        rationale: 'r',
        action: 'review',
        ctaUrl: '/x',
      })),
    };
    expect(() => mod.SessionInsightsSchema.parse(tooMany)).toThrow();
  });

  it('SessionInsightsSchema rejeita action fora do enum (review|study)', async () => {
    const mod: any = await import('../../server/coachTools/grind-live/coachSessionInsights.schema');
    const invalid = {
      ...validInsights(),
      topHands: [{ handId: 'x', title: 't', rationale: 'r', action: 'invalid', ctaUrl: '/x' }],
    };
    expect(() => mod.SessionInsightsSchema.parse(invalid)).toThrow();
  });
});

// =============================================================================
// Service: getOrGenerateCoachSessionInsights
// =============================================================================
describe('getOrGenerateCoachSessionInsights service', () => {
  it('exporta funcao', async () => {
    const mod: any = await import('../../server/services/coachSessionInsightsService');
    expect(typeof mod.getOrGenerateCoachSessionInsights).toBe('function');
  });

  it('NOT_OWNER quando session.user_id !== userId', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-OTHER',
      status: 'completed',
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    await expect(
      mod.getOrGenerateCoachSessionInsights({ userId: 'USER-INTRUDER', sessionId: 'gs-1' }),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' });
  });

  it('SESSION_NOT_FINALIZED quando session em running', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'running',
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    await expect(
      mod.getOrGenerateCoachSessionInsights({ userId: 'USER-0001', sessionId: 'gs-1' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FINALIZED' });
  });

  it('cache hit retorna sem chamar Coach', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    storageMocks.getCoachSessionInsights.mockResolvedValue({
      id: 'csi-1',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date('2026-05-08T20:00:00Z'),
      expiresAt: new Date('2026-05-09T20:00:00Z'),
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    const r = await mod.getOrGenerateCoachSessionInsights({
      userId: 'USER-0001',
      sessionId: 'gs-1',
    });

    expect(r.cached).toBe(true);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('cache miss: chama Coach, valida Zod, UPSERT', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    storageMocks.getCoachSessionInsights.mockResolvedValue(null);
    storageMocks.getTournamentsByGrindSession.mockResolvedValue([
      { id: 't-1', name: 'T', profitUsd: 50 },
    ]);
    storageMocks.getStarredHandsByGrindSession.mockResolvedValue([
      { id: 'spot-1', notes: 'BB defense' },
    ]);
    storageMocks.listUserFocusStats.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([
      { id: 'lesson-1', title: 'Ep 4', courseSlug: 'antes-das-cartas', lessonSlug: 'ep-4-cbet-oop' },
    ]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validInsights()));
    storageMocks.upsertCoachSessionInsights.mockResolvedValue({
      id: 'csi-new',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    const r = await mod.getOrGenerateCoachSessionInsights({
      userId: 'USER-0001',
      sessionId: 'gs-1',
    });

    expect(r.cached).toBe(false);
    expect(anthropicCreateMock).toHaveBeenCalled();
    expect(storageMocks.upsertCoachSessionInsights).toHaveBeenCalled();
  });

  it('whitelist enforcement: handId fora dos spots da sessao -> retry ou reject', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    storageMocks.getCoachSessionInsights.mockResolvedValue(null);
    storageMocks.getTournamentsByGrindSession.mockResolvedValue([]);
    storageMocks.getStarredHandsByGrindSession.mockResolvedValue([
      { id: 'spot-1', notes: 'X' },
    ]);
    storageMocks.listUserFocusStats.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);

    // Primeira: handId 'spot-FAKE' fora do whitelist
    const fake = { ...validInsights(), topHands: [{ handId: 'spot-FAKE', title: 't', rationale: 'r', action: 'review', ctaUrl: '/x' }] };
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicToolResponse(fake))
      .mockResolvedValueOnce(anthropicToolResponse(validInsights()));
    storageMocks.upsertCoachSessionInsights.mockResolvedValue({
      id: 'csi-1',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    await mod.getOrGenerateCoachSessionInsights({
      userId: 'USER-0001',
      sessionId: 'gs-1',
    });

    expect(anthropicCreateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('force=true ignora cache mesmo se valido', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    storageMocks.getCoachSessionInsights.mockResolvedValue({
      id: 'csi-1',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });
    storageMocks.getTournamentsByGrindSession.mockResolvedValue([]);
    storageMocks.getStarredHandsByGrindSession.mockResolvedValue([]);
    storageMocks.listUserFocusStats.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);
    anthropicCreateMock.mockResolvedValue(anthropicToolResponse(validInsights()));
    storageMocks.upsertCoachSessionInsights.mockResolvedValue({
      id: 'csi-1',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    await mod.getOrGenerateCoachSessionInsights({
      userId: 'USER-0001',
      sessionId: 'gs-1',
      force: true,
    });

    expect(anthropicCreateMock).toHaveBeenCalled();
  });

  it('retry 1x quando primeiro output falha Zod', async () => {
    storageMocks.getGrindSession.mockResolvedValue({
      id: 'gs-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    storageMocks.getCoachSessionInsights.mockResolvedValue(null);
    storageMocks.getTournamentsByGrindSession.mockResolvedValue([]);
    storageMocks.getStarredHandsByGrindSession.mockResolvedValue([]);
    storageMocks.listUserFocusStats.mockResolvedValue([]);
    storageMocks.listLibraryLessonsCurated.mockResolvedValue([]);

    const broken = { summary: 'x'.repeat(500) }; // > 200
    anthropicCreateMock
      .mockResolvedValueOnce(anthropicToolResponse(broken))
      .mockResolvedValueOnce(anthropicToolResponse(validInsights()));
    storageMocks.upsertCoachSessionInsights.mockResolvedValue({
      id: 'csi-1',
      grindSessionId: 'gs-1',
      insightsJsonb: validInsights(),
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });

    const mod: any = await import('../../server/services/coachSessionInsightsService');
    await mod.getOrGenerateCoachSessionInsights({
      userId: 'USER-0001',
      sessionId: 'gs-1',
    });

    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
  });
});
