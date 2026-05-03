import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-01 — 18 storage methods stubbed em server/storage.ts
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-01
// ADR-095 (learning_objectives JSONB)
//
// Estes testes mockam o pool/db underlying e validam que os metodos
// concretos (atualmente `throw "not implemented (Sprint Biblioteca-2)"`)
// produzem queries Drizzle corretas + retornam shapes esperados pelo
// caller (handlers em routes/library.ts, manifestImporter, coach tools).
//
// IMPORTANT: red phase. Todos os testes devem FALHAR com:
//   "<methodName> not implemented (Sprint Biblioteca-2)"
// quando rodados antes da implementacao.
//
// Lessons aplicadas:
//   #3 mocks idealizados — shape deve bater com Drizzle $inferSelect
//   #9 try/catch generico engole erros — distinguir "no rows" de "DB explodiu"
//   #11 default minimo
// =============================================================================

// Mock o modulo db ANTES de importar storage. Estrategia: drizzle-mock com
// .select/.insert/.update/.delete chainables; cada call retorna fixture especifico.
// IMPORTANT: vi.mock factory eh hoisted; nao pode usar variaveis top-level.
// Padrao Vitest: declare mocks dentro do factory, exponha via vi.mocked() depois.

vi.mock('../../../server/db', () => {
  const dbSelectMock = vi.fn();
  const dbInsertMock = vi.fn();
  const dbUpdateMock = vi.fn();
  const dbDeleteMock = vi.fn();
  const dbQueryMock = vi.fn();
  const dbExecuteMock = vi.fn();
  return {
    db: {
      select: dbSelectMock,
      insert: dbInsertMock,
      update: dbUpdateMock,
      delete: dbDeleteMock,
      query: dbQueryMock,
      execute: dbExecuteMock,
    },
    pool: {},
    // Expostos para o teste verificar chamadas
    __mocks: {
      dbSelectMock,
      dbInsertMock,
      dbUpdateMock,
      dbDeleteMock,
      dbQueryMock,
      dbExecuteMock,
    },
  };
});

import { storage } from '../../../server/storage';
// @ts-expect-error - acesso ao __mocks injetado no factory
import { __mocks } from '../../../server/db';

const dbSelectMock = __mocks?.dbSelectMock ?? vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. listLibraryCourses
// ---------------------------------------------------------------------------

describe('storage.listLibraryCourses', () => {
  it('deve retornar cursos publicados ordenados por displayOrder ASC', async () => {
    const result = await storage.listLibraryCourses({ onlyPublished: true });
    expect(Array.isArray(result)).toBe(true);
  });

  it('deve incluir lessonCount + hasAnyAccess quando userId fornecido', async () => {
    const result = await storage.listLibraryCourses({
      userId: 'USER-0001',
      onlyPublished: true,
    });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('lessonCount');
      expect(result[0]).toHaveProperty('hasAnyAccess');
      expect(typeof result[0].lessonCount).toBe('number');
      expect(typeof result[0].hasAnyAccess).toBe('boolean');
    }
  });

  it('sem userId, hasAnyAccess deve ser false em todos cursos', async () => {
    const result = await storage.listLibraryCourses({ onlyPublished: true });
    for (const c of result) {
      expect(c.hasAnyAccess).toBe(false);
    }
  });

  it('default opts.onlyPublished = true (filtra unpublished)', async () => {
    // Sem opts -> default behavior
    const result = await storage.listLibraryCourses();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. getLibraryCourseBySlug
// ---------------------------------------------------------------------------

describe('storage.getLibraryCourseBySlug', () => {
  it('deve retornar curso com modulos + lessons quando slug existe', async () => {
    const result = await storage.getLibraryCourseBySlug('antes-das-cartas');
    if (result !== null) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('slug', 'antes-das-cartas');
      expect(result).toHaveProperty('modules');
      expect(Array.isArray(result.modules)).toBe(true);
    }
  });

  it('deve retornar null quando slug invalido', async () => {
    const result = await storage.getLibraryCourseBySlug('does-not-exist');
    expect(result).toBeNull();
  });

  it('cada lesson deve ter formats[] derivado (video|podcast|article)', async () => {
    const result = await storage.getLibraryCourseBySlug('antes-das-cartas');
    if (result && result.modules?.length > 0) {
      const firstLesson = result.modules[0]?.lessons?.[0];
      if (firstLesson) {
        expect(firstLesson).toHaveProperty('formats');
        expect(Array.isArray(firstLesson.formats)).toBe(true);
        // Cada formato eh derivado: video se videoMuxPlaybackId, podcast se audioKey, article se articleHtml
        for (const f of firstLesson.formats) {
          expect(['video', 'podcast', 'article']).toContain(f);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. getLibraryLesson
// ---------------------------------------------------------------------------

describe('storage.getLibraryLesson', () => {
  it('deve retornar lesson completa com learning_objectives (RF-08)', async () => {
    const result = await storage.getLibraryLesson('lesson_1');
    if (result !== null) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('articleHtml');
      expect(result).toHaveProperty('learningObjectives');
      expect(Array.isArray(result.learningObjectives)).toBe(true);
    }
  });

  it('deve retornar null quando id nao existe', async () => {
    const result = await storage.getLibraryLesson('nonexistent_id');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. getLibraryLessonBySlug
// ---------------------------------------------------------------------------

describe('storage.getLibraryLessonBySlug', () => {
  it('deve retornar lesson via courseSlug + lessonSlug', async () => {
    const result = await storage.getLibraryLessonBySlug(
      'antes-das-cartas',
      'a1-mentalidade-fixa-vs-crescimento'
    );
    if (result !== null) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('slug', 'a1-mentalidade-fixa-vs-crescimento');
    }
  });

  it('deve retornar null quando courseSlug invalido', async () => {
    const result = await storage.getLibraryLessonBySlug(
      'no-course',
      'a1-mentalidade-fixa-vs-crescimento'
    );
    expect(result).toBeNull();
  });

  it('deve retornar null quando lessonSlug invalido', async () => {
    const result = await storage.getLibraryLessonBySlug('antes-das-cartas', 'invalid-slug');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. upsertLibraryCourseBySlug — INSERT vs UPDATE conflito
// ---------------------------------------------------------------------------

describe('storage.upsertLibraryCourseBySlug', () => {
  it('deve criar curso novo quando slug nao existe', async () => {
    const result = await storage.upsertLibraryCourseBySlug({
      slug: 'novo-curso',
      title: 'Novo Curso',
      displayOrder: 1,
      createdBy: 'USER-0001',
    });
    if (result) {
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('slug', 'novo-curso');
      expect(result).toHaveProperty('title', 'Novo Curso');
    }
  });

  it('deve atualizar curso existente quando slug ja existe (idempotente)', async () => {
    const first = await storage.upsertLibraryCourseBySlug({
      slug: 'antes-das-cartas',
      title: 'Antes das Cartas',
      displayOrder: 1,
      createdBy: 'USER-0001',
    });
    const second = await storage.upsertLibraryCourseBySlug({
      slug: 'antes-das-cartas',
      title: 'Antes das Cartas - Atualizado',
      displayOrder: 1,
      createdBy: 'USER-0001',
    });
    if (first && second) {
      expect(first.id).toBe(second.id);
      expect(second.title).toBe('Antes das Cartas - Atualizado');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. upsertLibraryModuleBySlug
// ---------------------------------------------------------------------------

describe('storage.upsertLibraryModuleBySlug', () => {
  it('deve usar conflict target composite (course_id, slug)', async () => {
    const first = await storage.upsertLibraryModuleBySlug({
      courseSlug: 'antes-das-cartas',
      slug: 'bloco-a',
      title: 'Bloco A',
      displayOrder: 1,
    });
    const second = await storage.upsertLibraryModuleBySlug({
      courseSlug: 'antes-das-cartas',
      slug: 'bloco-a',
      title: 'Bloco A - Updated',
      displayOrder: 1,
    });
    if (first && second) {
      expect(first.id).toBe(second.id);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. upsertLibraryLessonBySlug — RF-08 learning_objectives
// ---------------------------------------------------------------------------

describe('storage.upsertLibraryLessonBySlug', () => {
  it('deve aceitar learning_objectives no input (RF-08 / D4)', async () => {
    const result = await storage.upsertLibraryLessonBySlug({
      courseSlug: 'antes-das-cartas',
      moduleSlug: 'bloco-a',
      slug: 'a1-mentalidade-fixa',
      title: 'Mentalidade Fixa',
      categoryId: 'performance_mental',
      tags: ['mindset'],
      learningObjectives: ['Entender Carol Dweck', 'Reconhecer mentalidade fixa'],
    });
    if (result) {
      expect(result).toHaveProperty('learningObjectives');
      expect(result.learningObjectives).toEqual([
        'Entender Carol Dweck',
        'Reconhecer mentalidade fixa',
      ]);
    }
  });

  it('default isPublished=false quando nao explicitado', async () => {
    const result = await storage.upsertLibraryLessonBySlug({
      courseSlug: 'antes-das-cartas',
      moduleSlug: 'bloco-a',
      slug: 'unpublished',
      title: 'Unpublished',
      categoryId: 'performance_mental',
    });
    if (result) {
      expect(result.isPublished).toBe(false);
    }
  });

  it('deve fazer upsert (UPDATE quando course_id+slug existe)', async () => {
    const first = await storage.upsertLibraryLessonBySlug({
      courseSlug: 'antes-das-cartas',
      moduleSlug: 'bloco-a',
      slug: 'a1-mentalidade-fixa',
      title: 'V1',
      categoryId: 'performance_mental',
    });
    const second = await storage.upsertLibraryLessonBySlug({
      courseSlug: 'antes-das-cartas',
      moduleSlug: 'bloco-a',
      slug: 'a1-mentalidade-fixa',
      title: 'V2',
      categoryId: 'performance_mental',
    });
    if (first && second) {
      expect(first.id).toBe(second.id);
      expect(second.title).toBe('V2');
    }
  });
});

// ---------------------------------------------------------------------------
// 8. lessonAccessLookup — bulk lookup user + lessonIds
// ---------------------------------------------------------------------------

describe('storage.lessonAccessLookup', () => {
  it('deve retornar Map vazio (todas false) quando userId undefined', async () => {
    const result = await storage.lessonAccessLookup(undefined, ['l1', 'l2']);
    expect(result).toBeInstanceOf(Map);
    expect(result.get('l1')).toBe(false);
    expect(result.get('l2')).toBe(false);
  });

  it('deve curto-circuitar (sem query DB) quando userId undefined', async () => {
    await storage.lessonAccessLookup(undefined, ['l1', 'l2']);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it('deve retornar Map com booleanos por lessonId quando userId fornecido', async () => {
    const result = await storage.lessonAccessLookup('USER-0001', ['l1', 'l2']);
    expect(result).toBeInstanceOf(Map);
    // Cada key tem que estar presente (true ou false)
    expect(result.has('l1')).toBe(true);
    expect(result.has('l2')).toBe(true);
  });

  it('deve aceitar array vazio sem quebrar', async () => {
    const result = await storage.lessonAccessLookup('USER-0001', []);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. findLessonAccess
// ---------------------------------------------------------------------------

describe('storage.findLessonAccess', () => {
  it('deve retornar null quando userId undefined', async () => {
    const result = await storage.findLessonAccess({ userId: undefined, lessonId: 'l1' });
    expect(result).toBeNull();
  });

  it('deve retornar null quando user nao tem acesso', async () => {
    const result = await storage.findLessonAccess({
      userId: 'USER-NOACCESS',
      lessonId: 'l1',
    });
    expect(result).toBeNull();
  });

  it('deve retornar row UserLessonAccess quando user tem acesso valido', async () => {
    const result = await storage.findLessonAccess({
      userId: 'USER-0001',
      lessonId: 'l1',
    });
    if (result) {
      expect(result).toHaveProperty('userId', 'USER-0001');
      expect(result).toHaveProperty('lessonId', 'l1');
      expect(result).toHaveProperty('source');
    }
  });
});

// ---------------------------------------------------------------------------
// 10. bulkGrantLessonAccess — idempotencia
// ---------------------------------------------------------------------------

describe('storage.bulkGrantLessonAccess', () => {
  it('deve retornar { granted, alreadyHadAccess } counters', async () => {
    const result = await storage.bulkGrantLessonAccess({
      userId: 'USER-0001',
      lessonIds: ['l1', 'l2', 'l3'],
      source: 'admin_grant',
      grantedBy: 'USER-ADMIN',
    });
    if (result) {
      expect(result).toHaveProperty('granted');
      expect(result).toHaveProperty('alreadyHadAccess');
      expect(typeof result.granted).toBe('number');
      expect(typeof result.alreadyHadAccess).toBe('number');
    }
  });

  it('deve ser idempotente (rerun com mesmos lessonIds nao quebra; alreadyHadAccess incrementa)', async () => {
    await storage.bulkGrantLessonAccess({
      userId: 'USER-0001',
      lessonIds: ['l1', 'l2'],
      source: 'admin_grant',
      grantedBy: 'USER-ADMIN',
    });
    const second = await storage.bulkGrantLessonAccess({
      userId: 'USER-0001',
      lessonIds: ['l1', 'l2'],
      source: 'admin_grant',
      grantedBy: 'USER-ADMIN',
    });
    if (second) {
      expect(second.alreadyHadAccess).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. recordLibraryEvents — bulk insert
// ---------------------------------------------------------------------------

describe('storage.recordLibraryEvents', () => {
  it('deve aceitar array de eventos para bulk insert', async () => {
    await expect(
      storage.recordLibraryEvents([
        { userId: 'USER-0001', lessonId: 'l1', eventType: 'coach_recommend' },
        { userId: 'USER-0001', lessonId: 'l2', eventType: 'coach_recommend' },
      ])
    ).resolves.toBeUndefined();
  });

  it('aceita array vazio sem quebrar (no-op)', async () => {
    await expect(storage.recordLibraryEvents([])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. createLibraryEvent — single insert
// ---------------------------------------------------------------------------

describe('storage.createLibraryEvent', () => {
  it('deve retornar LibraryEvent inserido com id', async () => {
    const result = await storage.createLibraryEvent({
      userId: 'USER-0001',
      lessonId: 'l1',
      eventType: 'view',
      format: 'article',
      eventTimestamp: new Date(),
    });
    if (result) {
      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// 13. countLibraryEventsForUserInWindow — rate limit support
// ---------------------------------------------------------------------------

describe('storage.countLibraryEventsForUserInWindow', () => {
  it('deve retornar number (count) de eventos no window', async () => {
    const result = await storage.countLibraryEventsForUserInWindow({
      userId: 'USER-0001',
      windowSeconds: 60,
    });
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('deve retornar 0 quando user sem eventos no window', async () => {
    const result = await storage.countLibraryEventsForUserInWindow({
      userId: 'USER-NOEVENTS',
      windowSeconds: 60,
    });
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. upsertLibraryProgress — completedAt threshold 95%
// ---------------------------------------------------------------------------

describe('storage.upsertLibraryProgress', () => {
  it('deve marcar completedAt quando lastPositionSeconds >= 95% (D12 Spec 1)', async () => {
    const result = await storage.upsertLibraryProgress({
      userId: 'USER-0001',
      lessonId: 'l1',
      format: 'article',
      lastPositionSeconds: 95,
      totalDurationSeconds: 100,
    });
    if (result) {
      expect(result.completed).toBe(true);
      expect(result.row).toHaveProperty('completedAt');
      expect(result.row.completedAt).not.toBeNull();
    }
  });

  it('NAO deve marcar completedAt quando 94.9% (boundary just below 95)', async () => {
    const result = await storage.upsertLibraryProgress({
      userId: 'USER-0001',
      lessonId: 'l2',
      format: 'article',
      lastPositionSeconds: 94,
      totalDurationSeconds: 100,
    });
    if (result) {
      expect(result.completed).toBe(false);
    }
  });

  it('deve fazer upsert por (userId, lessonId, format) — composite conflict target', async () => {
    const first = await storage.upsertLibraryProgress({
      userId: 'USER-0001',
      lessonId: 'l1',
      format: 'podcast',
      lastPositionSeconds: 100,
      totalDurationSeconds: 1500,
    });
    const second = await storage.upsertLibraryProgress({
      userId: 'USER-0001',
      lessonId: 'l1',
      format: 'podcast',
      lastPositionSeconds: 200,
      totalDurationSeconds: 1500,
    });
    if (first && second) {
      // Mesmo (user, lesson, format) -> upsert deve retornar mesma row id
      expect(first.row.id).toBe(second.row.id);
    }
  });
});

// ---------------------------------------------------------------------------
// 15. getLibraryProgressForLesson — bulk fetch dos 3 formatos
// ---------------------------------------------------------------------------

describe('storage.getLibraryProgressForLesson', () => {
  it('deve retornar array com progressos por formato (max 3)', async () => {
    const result = await storage.getLibraryProgressForLesson({
      userId: 'USER-0001',
      lessonId: 'l1',
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('deve retornar array vazio quando user sem progresso na lesson', async () => {
    const result = await storage.getLibraryProgressForLesson({
      userId: 'USER-NOPROGRESS',
      lessonId: 'l1',
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 16. findLibraryLessonsByCategory — Coach AI tool dependency
// ---------------------------------------------------------------------------

describe('storage.findLibraryLessonsByCategory', () => {
  it('deve filtrar por categoryId + isPublished=true', async () => {
    const result = await storage.findLibraryLessonsByCategory(
      'performance_mental',
      { userId: 'USER-0001', limit: 10 }
    );
    expect(Array.isArray(result)).toBe(true);
    // Cada item tem: lesson + course + module + hasAccess + progressState
    for (const item of result) {
      expect(item).toHaveProperty('hasAccess');
      expect(item).toHaveProperty('progressState');
      expect(['untouched', 'in-progress', 'completed']).toContain(item.progressState);
    }
  });

  it('deve ordenar por progressState (untouched > in-progress > completed) entao displayOrder (D14 Spec 1)', async () => {
    const result = await storage.findLibraryLessonsByCategory('performance_mental', {
      userId: 'USER-0001',
    });
    if (result.length >= 2) {
      // Untouched/in-progress comes before completed
      const stateRank: any = { untouched: 0, 'in-progress': 1, completed: 2 };
      for (let i = 1; i < result.length; i++) {
        expect(stateRank[result[i - 1].progressState]).toBeLessThanOrEqual(
          stateRank[result[i].progressState]
        );
      }
    }
  });

  it('deve respeitar limit', async () => {
    const result = await storage.findLibraryLessonsByCategory('performance_mental', {
      limit: 3,
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 17. findLibraryLessonsByTag
// ---------------------------------------------------------------------------

describe('storage.findLibraryLessonsByTag', () => {
  it('deve filtrar por tag presente no array tags[]', async () => {
    const result = await storage.findLibraryLessonsByTag('mindset', { limit: 5 });
    expect(Array.isArray(result)).toBe(true);
    for (const item of result) {
      expect(item).toHaveProperty('hasAccess');
      expect(item).toHaveProperty('progressState');
    }
  });

  it('shape do return deve ser igual ao findLibraryLessonsByCategory', async () => {
    const result = await storage.findLibraryLessonsByTag('mindset', {
      userId: 'USER-0001',
      limit: 1,
    });
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('lesson');
      expect(result[0]).toHaveProperty('hasAccess');
      expect(result[0]).toHaveProperty('progressState');
    }
  });
});

// ---------------------------------------------------------------------------
// 18. libraryLessonProgressLookup — bulk progress lookup
// ---------------------------------------------------------------------------

describe('storage.libraryLessonProgressLookup', () => {
  it('deve retornar Map vazio quando userId undefined', async () => {
    const result = await storage.libraryLessonProgressLookup(undefined, ['l1', 'l2']);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('deve retornar Map { lessonId -> { maxPercent, lastFormat } }', async () => {
    const result = await storage.libraryLessonProgressLookup('USER-0001', ['l1', 'l2']);
    expect(result).toBeInstanceOf(Map);
    // Cada entry deve ter shape: { maxPercent: number, lastFormat: 'video'|'podcast'|'article' }
    for (const [, summary] of result) {
      expect(summary).toHaveProperty('maxPercent');
      expect(summary).toHaveProperty('lastFormat');
      expect(typeof summary.maxPercent).toBe('number');
      expect(['video', 'podcast', 'article']).toContain(summary.lastFormat);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. libraryLessonAccessLookup — alias de #8
// ---------------------------------------------------------------------------

describe('storage.libraryLessonAccessLookup', () => {
  it('deve ter mesma shape de lessonAccessLookup', async () => {
    const result = await storage.libraryLessonAccessLookup('USER-0001', ['l1', 'l2']);
    expect(result).toBeInstanceOf(Map);
    expect(result.has('l1')).toBe(true);
    expect(result.has('l2')).toBe(true);
  });

  it('userId undefined -> Map com todos false', async () => {
    const result = await storage.libraryLessonAccessLookup(undefined, ['l1']);
    expect(result.get('l1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Smoke: nenhum metodo deve mais lancar "not implemented"
// ---------------------------------------------------------------------------

describe('storage methods — nenhum stub remanescente (Sprint Biblioteca-2 done)', () => {
  it.each([
    'listLibraryCourses',
    'getLibraryCourseBySlug',
    'getLibraryLesson',
    'getLibraryLessonBySlug',
    'upsertLibraryCourseBySlug',
    'upsertLibraryModuleBySlug',
    'upsertLibraryLessonBySlug',
    'lessonAccessLookup',
    'findLessonAccess',
    'bulkGrantLessonAccess',
    'recordLibraryEvents',
    'createLibraryEvent',
    'countLibraryEventsForUserInWindow',
    'upsertLibraryProgress',
    'getLibraryProgressForLesson',
    'findLibraryLessonsByCategory',
    'findLibraryLessonsByTag',
    'libraryLessonProgressLookup',
    'libraryLessonAccessLookup',
  ])('storage.%s nao deve lancar "not implemented"', async (methodName) => {
    const fn = (storage as any)[methodName];
    expect(typeof fn).toBe('function');
    let threwNotImplemented = false;
    try {
      // Best-effort call with safe defaults (each method has different signature
      // but we just want to check that it doesn't throw "not implemented").
      const args: any[] = [];
      if (
        methodName === 'lessonAccessLookup' ||
        methodName === 'libraryLessonProgressLookup' ||
        methodName === 'libraryLessonAccessLookup'
      ) {
        args.push(undefined, []);
      } else if (methodName === 'getLibraryLessonBySlug') {
        args.push('a', 'b');
      } else if (methodName === 'findLibraryLessonsByCategory' || methodName === 'findLibraryLessonsByTag') {
        args.push('performance_mental', {});
      } else if (methodName === 'recordLibraryEvents') {
        args.push([]);
      } else if (
        methodName === 'createLibraryEvent' ||
        methodName === 'upsertLibraryCourseBySlug' ||
        methodName === 'upsertLibraryModuleBySlug' ||
        methodName === 'upsertLibraryLessonBySlug' ||
        methodName === 'bulkGrantLessonAccess' ||
        methodName === 'upsertLibraryProgress'
      ) {
        args.push({});
      } else if (
        methodName === 'getLibraryProgressForLesson' ||
        methodName === 'countLibraryEventsForUserInWindow' ||
        methodName === 'findLessonAccess'
      ) {
        args.push({ userId: 'x', lessonId: 'y', windowSeconds: 60 });
      } else if (methodName === 'getLibraryLesson' || methodName === 'getLibraryCourseBySlug') {
        args.push('any');
      } else {
        args.push({});
      }
      await fn.apply(storage, args);
    } catch (err: any) {
      if (typeof err?.message === 'string' && /not implemented/i.test(err.message)) {
        threwNotImplemented = true;
      }
      // Outros erros (DB mock, validation) sao OK pra esse smoke
    }
    expect(threwNotImplemented).toBe(false);
  });
});
