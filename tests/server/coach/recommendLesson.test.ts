import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-10 — Coach tool recommend_lesson
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-10 + D14
// ADR: Docs/architecture/decisions/075-coach-recommend-lesson-tool.md
//
// Modulo target: server/coachTools/recommendLesson.ts (AINDA NAO EXISTE)
//
// Surface esperada:
//   recommendLessonTool: CoachTool {
//     name: 'recommend_lesson',
//     inputSchema: zod (leakTopic + urgency + maxResults),
//     gateByTier: ['pro', 'premium', 'admin'],
//     handler(input, ctx) -> { __type: 'ToolResult', tool, ok, data }
//   }
//
// Ranking (D14): exact category > tag overlap > sort por progresso.
// Side-effect: events coach_recommend gravados via storage.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    findLibraryLessonsByCategory: vi.fn(),
    findLibraryLessonsByTag: vi.fn(),
    libraryLessonProgressLookup: vi.fn(),
    libraryLessonAccessLookup: vi.fn(),
    recordLibraryEvents: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
import {
  recommendLessonTool,
  // @ts-expect-error - modulo nao existe (red phase)
} from '../../../server/coachTools/recommendLesson';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).findLibraryLessonsByCategory.mockResolvedValue([]);
  (storage as any).findLibraryLessonsByTag.mockResolvedValue([]);
  (storage as any).libraryLessonProgressLookup.mockResolvedValue(new Map());
  (storage as any).libraryLessonAccessLookup.mockResolvedValue(new Map());
  (storage as any).recordLibraryEvents.mockResolvedValue({ inserted: 0 });
});

const ctx = {
  userId: 'USER-0001',
  userPlatformId: 'USER-0001',
  chatSessionId: 'sess_1',
  messageId: 'msg_1',
};

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

describe('recommendLessonTool — definition', () => {
  it('deve ter name "recommend_lesson"', () => {
    expect(recommendLessonTool.name).toBe('recommend_lesson');
  });

  it('deve ter gateByTier limitado a Pro+ (sem free)', () => {
    expect(recommendLessonTool.gateByTier).toEqual(
      expect.arrayContaining(['pro', 'premium', 'admin'])
    );
    expect(recommendLessonTool.gateByTier).not.toContain('free');
  });

  it('deve ter auditLevel "log"', () => {
    expect(recommendLessonTool.auditLevel).toBe('log');
  });

  it('deve ter handler como funcao', () => {
    expect(typeof recommendLessonTool.handler).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

describe('recommendLessonTool.inputSchema', () => {
  it('deve aceitar leakTopic valido', () => {
    const result = recommendLessonTool.inputSchema.safeParse({
      leakTopic: 'postflop',
      urgency: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar leakTopic fora do enum library-categories', () => {
    const result = recommendLessonTool.inputSchema.safeParse({
      leakTopic: 'cooking',
    });
    expect(result.success).toBe(false);
  });

  it('deve aplicar default urgency=medium', () => {
    const result = recommendLessonTool.inputSchema.safeParse({
      leakTopic: 'preflop',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urgency).toBe('medium');
    }
  });

  it('deve cap maxResults em 3 (D14)', () => {
    const result = recommendLessonTool.inputSchema.safeParse({
      leakTopic: 'icm_pre',
      maxResults: 10,
    });
    expect(result.success).toBe(false);
  });

  it('deve aplicar default maxResults=3', () => {
    const result = recommendLessonTool.inputSchema.safeParse({
      leakTopic: 'icm_pre',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxResults).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Handler — happy path + ranking determinista
// ---------------------------------------------------------------------------

describe('recommendLessonTool.handler — happy path', () => {
  beforeEach(() => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([
      {
        id: 'l1',
        slug: 'm3-3bet',
        courseId: 'c1',
        courseSlug: 'anatomia-spot',
        courseTitle: 'Anatomia de um Spot',
        title: 'M3 - 3-bet OOP',
        coverKey: 'library/covers/l1.jpg',
        videoDurationSeconds: 1080,
        audioDurationSeconds: null,
        categoryId: 'postflop',
        tags: [],
        displayOrder: 3,
      },
      {
        id: 'l2',
        slug: 'm5-oop',
        courseId: 'c1',
        courseSlug: 'anatomia-spot',
        courseTitle: 'Anatomia de um Spot',
        title: 'M5 - Postflop OOP',
        coverKey: 'library/covers/l2.jpg',
        videoDurationSeconds: 1320,
        audioDurationSeconds: 1500,
        categoryId: 'postflop',
        tags: [],
        displayOrder: 5,
      },
      {
        id: 'l3',
        slug: 'm7-cbet',
        courseId: 'c1',
        courseSlug: 'anatomia-spot',
        courseTitle: 'Anatomia de um Spot',
        title: 'M7 - C-bet',
        coverKey: 'library/covers/l3.jpg',
        videoDurationSeconds: 900,
        audioDurationSeconds: null,
        categoryId: 'postflop',
        tags: [],
        displayOrder: 7,
      },
    ]);
    (storage as any).libraryLessonAccessLookup.mockResolvedValue(
      new Map([
        ['l1', true],
        ['l2', true],
        ['l3', false],
      ])
    );
  });

  it('deve retornar ToolResult ok com lessons[]', async () => {
    const result = await recommendLessonTool.handler(
      { leakTopic: 'postflop', urgency: 'medium', maxResults: 3 },
      ctx
    );
    expect(result.__type).toBe('ToolResult');
    expect(result.tool).toBe('recommend_lesson');
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data.lessons)).toBe(true);
    expect(result.data.lessons.length).toBe(3);
  });

  it('deve incluir hasAccess por lesson', async () => {
    const result = await recommendLessonTool.handler(
      { leakTopic: 'postflop' },
      ctx
    );
    const ids = result.data.lessons.map((l: any) => l.id);
    const accessMap = new Map(result.data.lessons.map((l: any) => [l.id, l.hasAccess]));
    expect(accessMap.get('l1')).toBe(true);
    expect(accessMap.get('l3')).toBe(false);
    expect(ids).toContain('l1');
    expect(ids).toContain('l3');
  });

  it('deve construir url no formato /biblioteca/curso/:courseSlug/:lessonSlug', async () => {
    const result = await recommendLessonTool.handler(
      { leakTopic: 'postflop' },
      ctx
    );
    const l1 = result.data.lessons.find((l: any) => l.id === 'l1');
    expect(l1.url).toBe('/biblioteca/curso/anatomia-spot/m3-3bet');
  });

  it('deve fallback para tags quando categoria insuficiente', async () => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([]);
    (storage as any).findLibraryLessonsByTag.mockResolvedValue([
      {
        id: 'lt1',
        slug: 'extra',
        courseId: 'c2',
        courseSlug: 'extra-course',
        courseTitle: 'Extra',
        title: 'Tag-Match',
        coverKey: null,
        videoDurationSeconds: 600,
        audioDurationSeconds: null,
        categoryId: 'preflop',
        tags: ['postflop'],
        displayOrder: 1,
      },
    ]);
    (storage as any).libraryLessonAccessLookup.mockResolvedValue(new Map([['lt1', false]]));
    const result = await recommendLessonTool.handler(
      { leakTopic: 'postflop', maxResults: 3 },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(result.data.lessons.length).toBe(1);
    expect(result.data.lessons[0].id).toBe('lt1');
  });

  it('deve respeitar maxResults', async () => {
    const result = await recommendLessonTool.handler(
      { leakTopic: 'postflop', maxResults: 1 },
      ctx
    );
    expect(result.data.lessons.length).toBe(1);
  });

  it('deve retornar lessons: [] quando 0 matches (lesson #11 default minimo)', async () => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([]);
    (storage as any).findLibraryLessonsByTag.mockResolvedValue([]);
    const result = await recommendLessonTool.handler(
      { leakTopic: 'special_formats' },
      ctx
    );
    expect(result.ok).toBe(true);
    expect(result.data.lessons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ranking determinista por progresso (D14)
// ---------------------------------------------------------------------------

describe('recommendLessonTool — ranking por progresso (D14)', () => {
  it('deve preferir nao-iniciada > iniciada > completa', async () => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([
      { id: 'completed', slug: 's1', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'Completed', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'preflop', tags: [], displayOrder: 1 },
      { id: 'started', slug: 's2', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'Started', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'preflop', tags: [], displayOrder: 2 },
      { id: 'untouched', slug: 's3', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'Untouched', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'preflop', tags: [], displayOrder: 3 },
    ]);
    (storage as any).libraryLessonProgressLookup.mockResolvedValue(
      new Map([
        ['completed', { completedAt: new Date(), lastPositionSeconds: 600 }],
        ['started', { completedAt: null, lastPositionSeconds: 100 }],
        // 'untouched' nao aparece no map
      ])
    );
    (storage as any).libraryLessonAccessLookup.mockResolvedValue(
      new Map([
        ['completed', true],
        ['started', true],
        ['untouched', true],
      ])
    );
    const result = await recommendLessonTool.handler(
      { leakTopic: 'preflop', maxResults: 3 },
      ctx
    );
    const order = result.data.lessons.map((l: any) => l.id);
    expect(order[0]).toBe('untouched');
    expect(order[1]).toBe('started');
    expect(order[2]).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// Side-effect — eventos coach_recommend
// ---------------------------------------------------------------------------

describe('recommendLessonTool — side-effect events coach_recommend', () => {
  it('deve gravar 1 evento por lesson recomendada', async () => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([
      { id: 'l1', slug: 'a', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'A', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'icm_pre', tags: [], displayOrder: 1 },
      { id: 'l2', slug: 'b', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'B', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'icm_pre', tags: [], displayOrder: 2 },
    ]);
    (storage as any).libraryLessonAccessLookup.mockResolvedValue(new Map([['l1', true], ['l2', false]]));
    await recommendLessonTool.handler(
      { leakTopic: 'icm_pre', urgency: 'high', maxResults: 3 },
      ctx
    );
    expect((storage as any).recordLibraryEvents).toHaveBeenCalled();
    const events = (storage as any).recordLibraryEvents.mock.calls[0][0];
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(2);
    for (const evt of events) {
      expect(evt.eventType).toBe('coach_recommend');
      expect(evt.userId).toBe('USER-0001');
      expect(evt.metadata?.leakTopic).toBe('icm_pre');
      expect(evt.metadata?.urgency).toBe('high');
    }
  });

  it('deve continuar retornando ok quando recordLibraryEvents falha (best-effort, lesson #9)', async () => {
    (storage as any).findLibraryLessonsByCategory.mockResolvedValue([
      { id: 'l1', slug: 'a', courseId: 'c1', courseSlug: 'cs', courseTitle: 'X', title: 'A', coverKey: null, videoDurationSeconds: 600, audioDurationSeconds: null, categoryId: 'multiway', tags: [], displayOrder: 1 },
    ]);
    (storage as any).libraryLessonAccessLookup.mockResolvedValue(new Map([['l1', true]]));
    (storage as any).recordLibraryEvents.mockRejectedValue(new Error('DB down'));
    const result = await recommendLessonTool.handler(
      { leakTopic: 'multiway' },
      ctx
    );
    // Best-effort: tool retorna ok mesmo se evento falhar
    expect(result.ok).toBe(true);
    expect(result.data.lessons.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('recommendLessonTool — error handling', () => {
  it('deve retornar tool_error com input invalido', async () => {
    const result = await recommendLessonTool.handler(
      { leakTopic: 'invalid_category' },
      ctx
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBeDefined();
  });
});
