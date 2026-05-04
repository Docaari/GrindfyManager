/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 4 — RF-03 (recommendLessonForUser)
 *
 * Spec : Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-03 + §RF-04
 * ADRs : Docs/architecture/decisions/111..115-coach-recommendation-*.md
 * Diag : Docs/architecture/coach-recommendation-flow.mermaid (5 tiers)
 *
 * Cobertura (5 Tiers + idempotencia):
 *   - Tier 0 (R1): user sem dados (volume7d=0 + leaks=[]) -> short-circuit popular OU null
 *   - Tier 1 (Coach IA): JSON valido + lesson_id no catalog -> source='coach'
 *   - Tier 1 falha (timeout/JSON malformado/lesson_id alucinado/ingles)
 *     -> Tier 2 leak->tag deterministico -> source='fallback_leak_tag'
 *   - Tier 2 sem match -> Tier 3 popular seed-randomizado -> source='fallback_popular'
 *   - Tier 3 vazio -> Tier 4 recente -> source='fallback_recent'
 *   - Tier 4 vazio -> null
 *   - reason > 240 chars -> trunca; reason < 20 -> template fallback
 *   - Idempotencia (servico + cron handoff): segunda chamada mesma semana =
 *     no-op (servico nao reexecuta side-effects de DB; isso fica no caller).
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para mockar @anthropic-ai/sdk (Anthropic eh constructor `new`)
 *   #15 vi.unmock so em top-level (nao usado aqui)
 *   #3  shape REAL: storage.getMostPopularLessonIds, getCatalogLessonsForRecommendation
 *   #5  vi.fn() ok aqui (sem `new` envolvido, exceto Anthropic via hoisted)
 *
 * Status RED: modulo `server/coach/recommendLessonForUser.ts` NAO existe.
 * Helpers `server/coach/leakToTag.ts` + `server/coach/weekHelper.ts` NAO existem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock Anthropic SDK via vi.hoisted (lesson #14)
// `Anthropic` eh constructor — `new Anthropic({ apiKey })`. `vi.fn()` puro nao
// funciona como constructor; precisa de class wrapper hoisted antes de qualquer
// import. Capturamos `messagesCreateMock` para controlar o retorno por teste.
// =============================================================================
const { messagesCreateMock, AnthropicMock } = vi.hoisted(() => {
  const messagesCreateMock = vi.fn();
  class AnthropicMock {
    messages = { create: (...args: any[]) => messagesCreateMock(...args) };
  }
  return { messagesCreateMock, AnthropicMock };
});

vi.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: AnthropicMock,
  Anthropic: AnthropicMock,
}));

// =============================================================================
// Mock storage (lesson #3 — shape REAL conforme RF-11 da spec)
// =============================================================================
const getMostPopularLessonIdsMock = vi.fn();
const getCatalogLessonsForRecommendationMock = vi.fn();

vi.mock('../../server/storage', () => ({
  storage: {
    getMostPopularLessonIds: getMostPopularLessonIdsMock,
    getCatalogLessonsForRecommendation: getCatalogLessonsForRecommendationMock,
  },
}));

beforeEach(() => {
  messagesCreateMock.mockReset();
  getMostPopularLessonIdsMock.mockReset();
  getCatalogLessonsForRecommendationMock.mockReset();
});

// =============================================================================
// Fixtures
// =============================================================================
function leak(code: string, severity: 'low' | 'medium' | 'high' = 'high', n = 50, value = -10) {
  return {
    code,
    severity,
    evidence: { n, value },
    description: `Leak ${code} (severity ${severity}, n=${n})`,
  };
}

function lesson(id: string, opts: Partial<any> = {}) {
  return {
    id,
    title: opts.title ?? `Lesson ${id}`,
    courseTitle: opts.courseTitle ?? 'Curso X',
    moduleTitle: opts.moduleTitle ?? 'Modulo Y',
    categoryId: opts.categoryId ?? 'fundamentos',
    tags: opts.tags ?? ['fundamentos'],
    learningObjectives: opts.learningObjectives ?? [],
    durationSeconds: opts.durationSeconds ?? 1800,
    ...opts,
  };
}

const baseAnalytics = {
  last7DaysRoi: -3.2,
  last7DaysVolume: 25,
  last7DaysProfit: -150,
  last30DaysRoi: 5.1,
};

function buildInput(overrides: any = {}) {
  return {
    userId: 'USER-TEST-1',
    leaks: [leak('weak_site', 'high')],
    analytics: baseAnalytics,
    activeProfile: 'A' as 'A' | 'B' | 'C' | null,
    accessibleLessonIds: ['L1', 'L2', 'L3'],
    lastConsumedLessonIds: [],
    catalogLessons: [
      lesson('L1', { tags: ['fundamentos'] }),
      lesson('L2', { tags: ['ICM', 'bubble'] }),
      lesson('L3', { tags: ['turbo-strategy'] }),
    ],
    ...overrides,
  };
}

function anthropicJsonReply(payload: { lesson_id: string; reason: string }) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 80,
    },
  };
}

// =============================================================================
// Tier 0 — Short-circuit user sem dados (R1)
// =============================================================================
describe('recommendLessonForUser — Tier 0 (user sem dados)', () => {
  it('volume7d=0 AND leaks=[] -> NAO chama Anthropic, vai direto pro popular', async () => {
    getMostPopularLessonIdsMock.mockResolvedValue(['L1', 'L2', 'L3']);

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );

    const input = buildInput({
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
    });
    const result = await recommendLessonForUser(input);

    expect(messagesCreateMock).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.source).toBe('fallback_popular');
    expect(['L1', 'L2', 'L3']).toContain(result?.lessonId);
    expect(result?.reason.length).toBeGreaterThanOrEqual(20);
    expect(result?.reason.length).toBeLessThanOrEqual(240);
  });

  it('Tier 0 + popular vazio -> tenta Tier 4 (recente)', async () => {
    getMostPopularLessonIdsMock.mockResolvedValue([]);
    getCatalogLessonsForRecommendationMock.mockResolvedValue([
      lesson('R1'),
      lesson('R2'),
    ]);

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const input = buildInput({
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
      catalogLessons: [lesson('R1'), lesson('R2')],
    });
    const result = await recommendLessonForUser(input);

    expect(result?.source).toBe('fallback_recent');
    expect(['R1', 'R2']).toContain(result?.lessonId);
  });

  it('Tier 0 + popular vazio + recente vazio + catalog vazio -> null', async () => {
    getMostPopularLessonIdsMock.mockResolvedValue([]);
    getCatalogLessonsForRecommendationMock.mockResolvedValue([]);

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const input = buildInput({
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
      catalogLessons: [],
    });
    const result = await recommendLessonForUser(input);

    expect(result).toBeNull();
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tier 1 — Coach IA happy path
// =============================================================================
describe('recommendLessonForUser — Tier 1 (Coach IA)', () => {
  it('Anthropic responde JSON valido com lesson_id no catalog -> source=coach', async () => {
    messagesCreateMock.mockResolvedValue(
      anthropicJsonReply({
        lesson_id: 'L2',
        reason: 'Voce esta perdendo bastante na bolha — esta licao foca em ICM short-stack.',
      }),
    );

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(buildInput());

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(result?.source).toBe('coach');
    expect(result?.lessonId).toBe('L2');
    expect(result?.reason).toMatch(/bolha|ICM/i);
  });

  it('Anthropic responde reason > 240 chars -> trunca para 240', async () => {
    const longReason = 'A'.repeat(400);
    messagesCreateMock.mockResolvedValue(
      anthropicJsonReply({ lesson_id: 'L1', reason: longReason }),
    );
    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(buildInput());
    expect(result?.source).toBe('coach');
    expect((result?.reason ?? '').length).toBeLessThanOrEqual(240);
  });

  it('Anthropic responde reason < 20 chars -> substitui por reason fallback template', async () => {
    messagesCreateMock.mockResolvedValue(
      anthropicJsonReply({ lesson_id: 'L1', reason: 'curta' }),
    );
    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(buildInput());
    expect(result?.source).toBe('coach');
    expect((result?.reason ?? '').length).toBeGreaterThanOrEqual(20);
  });
});

// =============================================================================
// Tier 1 falha -> Tier 2 (leak->tag deterministico)
// =============================================================================
describe('recommendLessonForUser — Tier 1 falha -> Tier 2 leak->tag', () => {
  it('Anthropic timeout/erro -> fallback leak_tag deterministico', async () => {
    messagesCreateMock.mockRejectedValue(new Error('anthropic_timeout'));
    // catalog tem L2 com tag 'ICM' que mapeia para o leak 'low_ft_conversion'
    const input = buildInput({
      leaks: [leak('low_ft_conversion', 'high')],
      catalogLessons: [
        lesson('LX', { tags: ['random'] }),
        lesson('L_ICM', { tags: ['ICM', 'final-table'] }),
      ],
    });

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);

    expect(result?.source).toBe('fallback_leak_tag');
    // leak 'low_ft_conversion' deve mapear para tags que matcham L_ICM
    expect(result?.lessonId).toBe('L_ICM');
  });

  it('Anthropic responde JSON malformado -> fallback', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'isto nao eh json valido { broken' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    getMostPopularLessonIdsMock.mockResolvedValue(['L1']);

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const input = buildInput({ leaks: [leak('insufficient_volume', 'low')] });
    const result = await recommendLessonForUser(input);
    // Tier 2 falhou (severity low pode nao acionar leak_tag), entao Tier 3
    expect(result?.source).toMatch(/^fallback_/);
  });

  it('Anthropic responde lesson_id alucinado (nao no catalog) -> fallback', async () => {
    messagesCreateMock.mockResolvedValue(
      anthropicJsonReply({ lesson_id: 'LESSON_NAO_EXISTE_99', reason: 'Razao plausivel longa o suficiente para passar.' }),
    );
    const input = buildInput({
      leaks: [leak('low_ft_conversion', 'high')],
      catalogLessons: [
        lesson('LX', { tags: ['random'] }),
        lesson('L_ICM', { tags: ['ICM', 'final-table'] }),
      ],
    });
    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);
    expect(result?.source).toBe('fallback_leak_tag');
    expect(result?.lessonId).toBe('L_ICM');
  });
});

// =============================================================================
// Tier 2 sem match -> Tier 3 (popular)
// =============================================================================
describe('recommendLessonForUser — Tier 2 sem match -> Tier 3 popular', () => {
  it('leak code sem match em tag -> popular seed-randomizado', async () => {
    messagesCreateMock.mockRejectedValue(new Error('coach_down'));
    getMostPopularLessonIdsMock.mockResolvedValue(['POP1', 'POP2', 'POP3']);

    const input = buildInput({
      // leak code que cai no DEFAULT do leakToTag
      leaks: [leak('codigo_inexistente_xyz', 'high')],
      catalogLessons: [
        lesson('POP1', { tags: ['outro'] }),
        lesson('POP2', { tags: ['outro'] }),
        lesson('POP3', { tags: ['outro'] }),
      ],
    });

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);

    // Pode ser leak_tag (DEFAULT match) ou popular — aceita ambos como
    // fallback determinista valido. Garantia minima: NAO chamou nada
    // alem do esperado e source comeca com 'fallback_'.
    expect(result?.source).toMatch(/^fallback_/);
    expect(['POP1', 'POP2', 'POP3']).toContain(result?.lessonId);
  });

  it('exclui lastConsumedLessonIds do popular', async () => {
    messagesCreateMock.mockRejectedValue(new Error('coach_down'));
    getMostPopularLessonIdsMock.mockResolvedValue(['POP1', 'POP2']);

    const input = buildInput({
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
      lastConsumedLessonIds: ['POP1'], // user ja consumiu POP1
      catalogLessons: [lesson('POP1'), lesson('POP2')],
    });

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);

    expect(result?.lessonId).toBe('POP2');
    expect(result?.lessonId).not.toBe('POP1');
  });

  it('seed determinista: mesmo (userId, weekStart) escolhe mesma lesson', async () => {
    messagesCreateMock.mockRejectedValue(new Error('coach_down'));
    getMostPopularLessonIdsMock.mockResolvedValue(['A', 'B', 'C', 'D']);

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const input = buildInput({
      userId: 'USER-SEED-1',
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
      catalogLessons: [lesson('A'), lesson('B'), lesson('C'), lesson('D')],
      weekStartDate: '2026-05-04',
    });
    const r1 = await recommendLessonForUser(input);
    const r2 = await recommendLessonForUser(input);
    expect(r1?.lessonId).toBe(r2?.lessonId);
  });
});

// =============================================================================
// Tier 4 — recente (catalog popular vazio R7)
// =============================================================================
describe('recommendLessonForUser — Tier 4 (lessons recentes)', () => {
  it('popular vazio -> Tier 4 lessons recentes (createdAt DESC)', async () => {
    messagesCreateMock.mockRejectedValue(new Error('coach_down'));
    getMostPopularLessonIdsMock.mockResolvedValue([]);
    getCatalogLessonsForRecommendationMock.mockResolvedValue([
      lesson('REC1'),
      lesson('REC2'),
    ]);

    const input = buildInput({
      leaks: [],
      analytics: { ...baseAnalytics, last7DaysVolume: 0 },
      catalogLessons: [lesson('REC1'), lesson('REC2')],
    });
    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);

    expect(result?.source).toBe('fallback_recent');
    expect(['REC1', 'REC2']).toContain(result?.lessonId);
  });

  it('catalog absolutamente vazio -> retorna null sem crashar', async () => {
    messagesCreateMock.mockRejectedValue(new Error('coach_down'));
    getMostPopularLessonIdsMock.mockResolvedValue([]);
    getCatalogLessonsForRecommendationMock.mockResolvedValue([]);

    const input = buildInput({
      leaks: [leak('weak_site', 'high')],
      catalogLessons: [],
    });

    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const result = await recommendLessonForUser(input);
    expect(result).toBeNull();
  });
});

// =============================================================================
// RF-04 helper getTagsForLeakCode
// =============================================================================
describe('leakToTag helper (RF-04)', () => {
  it('retorna array de tags para code conhecido', async () => {
    const { getTagsForLeakCode } = await import('../../server/coach/leakToTag');
    const tags = getTagsForLeakCode('low_ft_conversion');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
  });

  it('retorna LEAK_TO_TAGS.DEFAULT para code desconhecido', async () => {
    const { getTagsForLeakCode, LEAK_TO_TAGS } = await import(
      '../../server/coach/leakToTag'
    );
    const tags = getTagsForLeakCode('codigo_jamais_existira_xyz');
    expect(tags).toEqual(LEAK_TO_TAGS.DEFAULT);
  });

  it('cobre os 4 codes mais frequentes do detectLeaks atual', async () => {
    const { getTagsForLeakCode } = await import('../../server/coach/leakToTag');
    // Codes reais emitidos por server/coachLeakDetection.ts (2026-05):
    // roi_by_format, weak_site, early_bust, low_ft_conversion
    expect(getTagsForLeakCode('roi_by_format').length).toBeGreaterThan(0);
    expect(getTagsForLeakCode('weak_site').length).toBeGreaterThan(0);
    expect(getTagsForLeakCode('early_bust').length).toBeGreaterThan(0);
    expect(getTagsForLeakCode('low_ft_conversion').length).toBeGreaterThan(0);
  });
});

// =============================================================================
// RF-12 helper getCurrentWeekStartBRT
// =============================================================================
describe('getCurrentWeekStartBRT helper (RF-12)', () => {
  it('quarta-feira 14:00 BRT -> retorna segunda-feira da mesma semana', async () => {
    const { getCurrentWeekStartBRT } = await import(
      '../../server/coach/weekHelper'
    );
    // 2026-05-06 quarta 14:00 BRT = 17:00 UTC
    const wed = new Date('2026-05-06T17:00:00Z');
    const result = getCurrentWeekStartBRT(wed);
    // Esperado: segunda 2026-05-04 00:00 BRT = 03:00 UTC
    expect(result.toISOString()).toBe('2026-05-04T03:00:00.000Z');
  });

  it('domingo 23:00 BRT -> retorna segunda da semana que esta terminando', async () => {
    const { getCurrentWeekStartBRT } = await import(
      '../../server/coach/weekHelper'
    );
    // 2026-05-10 domingo 23:00 BRT = 2026-05-11 02:00 UTC
    const sun = new Date('2026-05-11T02:00:00Z');
    const result = getCurrentWeekStartBRT(sun);
    // Esperado: segunda 2026-05-04 00:00 BRT = 03:00 UTC
    expect(result.toISOString()).toBe('2026-05-04T03:00:00.000Z');
  });

  it('segunda 06:00 BRT (apos cron) -> retorna a propria segunda', async () => {
    const { getCurrentWeekStartBRT } = await import(
      '../../server/coach/weekHelper'
    );
    // 2026-05-04 06:00 BRT = 09:00 UTC
    const mon = new Date('2026-05-04T09:00:00Z');
    const result = getCurrentWeekStartBRT(mon);
    expect(result.toISOString()).toBe('2026-05-04T03:00:00.000Z');
  });

  it('segunda 00:30 BRT (logo apos virar a semana) -> retorna a propria segunda', async () => {
    const { getCurrentWeekStartBRT } = await import(
      '../../server/coach/weekHelper'
    );
    // 2026-05-04 00:30 BRT = 03:30 UTC
    const earlyMon = new Date('2026-05-04T03:30:00Z');
    const result = getCurrentWeekStartBRT(earlyMon);
    expect(result.toISOString()).toBe('2026-05-04T03:00:00.000Z');
  });
});

// =============================================================================
// Idempotencia — chamadas repetidas mesma semana NAO reexecutam side effects
// (Servico em si nao escreve em DB; quem escreve eh o caller. Aqui validamos
// que multiplas chamadas com mesmos inputs retornam mesmo resultado puro.)
// =============================================================================
describe('recommendLessonForUser — idempotencia (puro, sem side-effect DB)', () => {
  it('mesmas inputs (Tier 1) -> mesma saida; Anthropic chamado uma vez por call', async () => {
    messagesCreateMock.mockResolvedValue(
      anthropicJsonReply({
        lesson_id: 'L1',
        reason: 'Justificativa em portugues longa o suficiente para passar.',
      }),
    );
    const { recommendLessonForUser } = await import(
      '../../server/coach/recommendLessonForUser'
    );
    const input = buildInput();
    const r1 = await recommendLessonForUser(input);
    const r2 = await recommendLessonForUser(input);

    expect(r1?.lessonId).toBe(r2?.lessonId);
    expect(r1?.source).toBe(r2?.source);
    // 2 chamadas independentes do servico = 2 chamadas Anthropic.
    // A idempotencia verdadeira (1 rec/semana) eh garantida pelo cron+UNIQUE.
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });
});
