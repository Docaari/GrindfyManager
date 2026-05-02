import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-01 — Schema do Modelo de Dados
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-01
// ADRs: 071 (media storage), 073 (entitlements), 074 (progress sync)
// Diagrama: Docs/architecture/diagrams/biblioteca/data-model.mermaid
//
// Valida que shared/schema.ts exporta:
//   - 7 tabelas Drizzle: library_courses, library_modules, library_lessons,
//     library_lesson_assets, user_lesson_access, library_events,
//     library_progress
//   - 3 enums: library_access_source, library_event_type, library_format
//   - Insert schemas via createInsertSchema com defaults corretos
//   - Composite uniques + FK CASCADE relacoes
//
// Os imports referenciam exports que AINDA NAO EXISTEM. Implementer cria.
// =============================================================================

import {
  // Tabelas
  libraryCourses,
  libraryModules,
  libraryLessons,
  libraryLessonAssets,
  userLessonAccess,
  libraryEvents,
  libraryProgress,
  // Enums (drizzle pgEnum)
  libraryAccessSourceEnum,
  libraryEventTypeEnum,
  libraryFormatEnum,
  // Insert schemas (drizzle-zod)
  insertLibraryCourseSchema,
  insertLibraryModuleSchema,
  insertLibraryLessonSchema,
  insertUserLessonAccessSchema,
  insertLibraryEventSchema,
  insertLibraryProgressSchema,
  // @ts-expect-error - tabelas/exports nao existem ainda (red phase)
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Tabelas Drizzle exportadas
// ---------------------------------------------------------------------------

describe('shared/schema.ts — Biblioteca tables', () => {
  it('deve exportar libraryCourses como tabela Drizzle', () => {
    expect(libraryCourses).toBeDefined();
    // Drizzle table tem propriedade _ com schema interno
    expect((libraryCourses as any)._).toBeDefined();
  });

  it('deve exportar libraryModules como tabela Drizzle', () => {
    expect(libraryModules).toBeDefined();
    expect((libraryModules as any)._).toBeDefined();
  });

  it('deve exportar libraryLessons como tabela Drizzle', () => {
    expect(libraryLessons).toBeDefined();
    expect((libraryLessons as any)._).toBeDefined();
  });

  it('deve exportar libraryLessonAssets como tabela Drizzle', () => {
    expect(libraryLessonAssets).toBeDefined();
    expect((libraryLessonAssets as any)._).toBeDefined();
  });

  it('deve exportar userLessonAccess como tabela Drizzle', () => {
    expect(userLessonAccess).toBeDefined();
    expect((userLessonAccess as any)._).toBeDefined();
  });

  it('deve exportar libraryEvents como tabela Drizzle', () => {
    expect(libraryEvents).toBeDefined();
    expect((libraryEvents as any)._).toBeDefined();
  });

  it('deve exportar libraryProgress como tabela Drizzle', () => {
    expect(libraryProgress).toBeDefined();
    expect((libraryProgress as any)._).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Enums Postgres (pgEnum)
// ---------------------------------------------------------------------------

describe('shared/schema.ts — Biblioteca enums', () => {
  it('library_access_source deve incluir admin/purchase/bundle/subscription', () => {
    expect(libraryAccessSourceEnum).toBeDefined();
    const values = (libraryAccessSourceEnum as any).enumValues;
    expect(values).toContain('admin');
    expect(values).toContain('purchase');
    expect(values).toContain('bundle');
    expect(values).toContain('subscription');
  });

  it('library_event_type deve incluir todos os 8 tipos da spec D11', () => {
    const values = (libraryEventTypeEnum as any).enumValues;
    // Validar presenca individual (nao length — anti-pattern lesson #8 enum length)
    expect(values).toContain('view');
    expect(values).toContain('play');
    expect(values).toContain('pause');
    expect(values).toContain('seek');
    expect(values).toContain('complete');
    expect(values).toContain('note_create');
    expect(values).toContain('coach_recommend');
    expect(values).toContain('access_blocked');
  });

  it('library_format deve incluir video/podcast/article', () => {
    const values = (libraryFormatEnum as any).enumValues;
    expect(values).toContain('video');
    expect(values).toContain('podcast');
    expect(values).toContain('article');
  });
});

// ---------------------------------------------------------------------------
// Insert Schemas (drizzle-zod) — validacao de inputs
// ---------------------------------------------------------------------------

describe('insertLibraryCourseSchema', () => {
  const validCourse = {
    slug: 'antes-das-cartas',
    title: '00 - Antes das Cartas',
  };

  it('deve aceitar curso com campos minimos (slug + title)', () => {
    const result = insertLibraryCourseSchema.safeParse(validCourse);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar curso sem slug', () => {
    const { slug, ...data } = validCourse;
    const result = insertLibraryCourseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar curso sem title', () => {
    const { title, ...data } = validCourse;
    const result = insertLibraryCourseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar campos opcionais subtitle/description/coverKey', () => {
    const result = insertLibraryCourseSchema.safeParse({
      ...validCourse,
      subtitle: 'sub',
      description: 'desc',
      coverKey: 'library/covers/abc.jpg',
      displayOrder: 5,
      isPublished: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('insertLibraryModuleSchema', () => {
  it('deve exigir courseId + slug + title', () => {
    const ok = insertLibraryModuleSchema.safeParse({
      courseId: 'course_123',
      slug: 'bloco-a',
      title: 'Bloco A - Fundamentos Mentais',
    });
    expect(ok.success).toBe(true);

    const noCourse = insertLibraryModuleSchema.safeParse({
      slug: 'bloco-a',
      title: 'X',
    });
    expect(noCourse.success).toBe(false);
  });
});

describe('insertLibraryLessonSchema', () => {
  const baseLesson = {
    moduleId: 'mod_1',
    courseId: 'course_1',
    slug: 'a1-mentalidade',
    title: 'A1 - Mentalidade Fixa vs Crescimento',
    categoryId: 'performance_mental',
  };

  it('deve aceitar lesson minima (moduleId/courseId/slug/title/categoryId)', () => {
    const result = insertLibraryLessonSchema.safeParse(baseLesson);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar lesson sem categoryId (D13 obrigatorio)', () => {
    const { categoryId, ...data } = baseLesson;
    const result = insertLibraryLessonSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('deve aceitar tags como array de strings (default [])', () => {
    const result = insertLibraryLessonSchema.safeParse({
      ...baseLesson,
      tags: ['mindset', 'growth'],
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar lesson com apenas artigo HTML (sem video/audio)', () => {
    const result = insertLibraryLessonSchema.safeParse({
      ...baseLesson,
      articleHtml: '<p>conteudo limpo</p>',
      articleWordCount: 2,
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar campos Mux opcionais', () => {
    const result = insertLibraryLessonSchema.safeParse({
      ...baseLesson,
      videoMuxAssetId: 'mux_asset_xyz',
      videoMuxPlaybackId: 'pb_xyz',
      videoDurationSeconds: 1320,
    });
    expect(result.success).toBe(true);
  });
});

describe('insertUserLessonAccessSchema', () => {
  const validGrant = {
    userId: 'USER-0001',
    lessonId: 'lesson_1',
    source: 'admin',
  };

  it('deve aceitar grant minimo (userId + lessonId + source admin)', () => {
    const result = insertUserLessonAccessSchema.safeParse(validGrant);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar source fora do enum', () => {
    const result = insertUserLessonAccessSchema.safeParse({
      ...validGrant,
      source: 'free_trial', // nao previsto
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar source purchase/bundle/subscription', () => {
    for (const source of ['purchase', 'bundle', 'subscription']) {
      const r = insertUserLessonAccessSchema.safeParse({ ...validGrant, source });
      expect(r.success).toBe(true);
    }
  });

  it('deve aceitar expiresAt opcional (null = vitalicio)', () => {
    const result = insertUserLessonAccessSchema.safeParse({
      ...validGrant,
      expiresAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

describe('insertLibraryEventSchema', () => {
  it('deve aceitar evento view sem positionSeconds nem format', () => {
    const result = insertLibraryEventSchema.safeParse({
      userId: 'USER-0001',
      lessonId: 'lesson_1',
      eventType: 'view',
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar evento play com format e positionSeconds', () => {
    const result = insertLibraryEventSchema.safeParse({
      userId: 'USER-0001',
      lessonId: 'lesson_1',
      eventType: 'play',
      format: 'podcast',
      positionSeconds: 120,
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar eventType fora do enum', () => {
    const result = insertLibraryEventSchema.safeParse({
      userId: 'USER-0001',
      lessonId: 'lesson_1',
      eventType: 'rocket_launch',
    });
    expect(result.success).toBe(false);
  });

  it('deve rejeitar format fora do enum', () => {
    const result = insertLibraryEventSchema.safeParse({
      userId: 'USER-0001',
      lessonId: 'lesson_1',
      eventType: 'play',
      format: 'tv', // invalido
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar metadata como objeto livre (jsonb)', () => {
    const result = insertLibraryEventSchema.safeParse({
      userId: 'USER-0001',
      lessonId: 'lesson_1',
      eventType: 'play',
      format: 'video',
      metadata: { playbackRate: 1.5, qualityLevel: '720p' },
    });
    expect(result.success).toBe(true);
  });
});

describe('insertLibraryProgressSchema', () => {
  const validProgress = {
    userId: 'USER-0001',
    lessonId: 'lesson_1',
    format: 'video',
    lastPositionSeconds: 720,
  };

  it('deve aceitar progresso minimo', () => {
    const result = insertLibraryProgressSchema.safeParse(validProgress);
    expect(result.success).toBe(true);
  });

  it('deve aceitar totalDurationSeconds opcional (snapshot)', () => {
    const result = insertLibraryProgressSchema.safeParse({
      ...validProgress,
      totalDurationSeconds: 1320,
    });
    expect(result.success).toBe(true);
  });

  it('deve rejeitar format fora do enum library_format', () => {
    const result = insertLibraryProgressSchema.safeParse({
      ...validProgress,
      format: 'pdf', // invalido — sem PDF format
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar lastPositionSeconds = 0 (default)', () => {
    const result = insertLibraryProgressSchema.safeParse({
      ...validProgress,
      lastPositionSeconds: 0,
    });
    expect(result.success).toBe(true);
  });
});
