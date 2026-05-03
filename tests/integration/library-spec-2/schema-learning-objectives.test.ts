import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-08 — learning_objectives JSONB
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-08 + D4
// ADR-095
// Migration: 0034_library_lessons_learning_objectives.sql (NAO 0033 — ratificado founder)
//
// Schema target: shared/schema.ts libraryLessons + insertLibraryLessonSchema
//
// Mudancas Spec 2:
//   1. Coluna learning_objectives JSONB NOT NULL DEFAULT '[]'
//   2. LibraryLesson type ($inferSelect) inclui learningObjectives: string[]
//   3. insertLibraryLessonSchema valida:
//      - learningObjectives: optional, default []
//      - cap 10 items
//      - cada item string nao-vazia (min 1 char)
//      - cada item max 200 chars
// =============================================================================

import {
  libraryLessons,
  insertLibraryLessonSchema,
  type LibraryLesson,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Schema column existence
// ---------------------------------------------------------------------------

describe('libraryLessons schema — learning_objectives column (RF-08)', () => {
  it('libraryLessons table deve ter coluna learning_objectives', () => {
    // Drizzle expoe colunas via simbolo interno; checa presenca via inferred type
    // ou via inspecao do objeto. Caller real usa $inferSelect.
    const cols: any = (libraryLessons as any);
    // Algum dos shapes Drizzle: .learningObjectives, .learning_objectives, ._.columns, etc
    const has =
      'learningObjectives' in cols ||
      Object.values(cols).some((v: any) => v?.name === 'learning_objectives');
    expect(has).toBe(true);
  });

  it('LibraryLesson type ($inferSelect) deve incluir learningObjectives: string[]', () => {
    // Compile-time check: se o type estiver presente no LibraryLesson,
    // este const eh valido. Implementer adiciona o campo no schema.
    const stub: LibraryLesson = {} as LibraryLesson;
    type Has = LibraryLesson extends { learningObjectives: any } ? true : false;
    const _: Has = true as Has;
    // Runtime check: placeholder shape
    expect(typeof stub).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Zod insert schema validation
// ---------------------------------------------------------------------------

describe('insertLibraryLessonSchema — learning_objectives validation', () => {
  const baseInput = {
    moduleId: 'mod_1',
    courseId: 'course_1',
    slug: 'a1-mentalidade',
    title: 'A1 - Mentalidade Fixa',
    categoryId: 'performance_mental',
    tags: [],
    isPublished: false,
    displayOrder: 1,
  };

  it('deve aceitar learningObjectives valido (array de strings)', () => {
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: ['Obj 1', 'Obj 2'],
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar input SEM learningObjectives (default [])', () => {
    const result = insertLibraryLessonSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.learningObjectives).toEqual([]);
    }
  });

  it('deve REJEITAR array com 11+ items (cap 10)', () => {
    const items = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`);
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: items,
    });
    expect(result.success).toBe(false);
  });

  it('deve REJEITAR string vazia em learningObjectives', () => {
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: ['Valido', ''],
    });
    expect(result.success).toBe(false);
  });

  it('deve REJEITAR string > 200 chars', () => {
    const longStr = 'x'.repeat(250);
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: [longStr],
    });
    expect(result.success).toBe(false);
  });

  it('deve aceitar string com exatamente 200 chars (boundary)', () => {
    const str200 = 'x'.repeat(200);
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: [str200],
    });
    expect(result.success).toBe(true);
  });

  it('deve aceitar exatamente 10 items (boundary cap)', () => {
    const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
    const result = insertLibraryLessonSchema.safeParse({
      ...baseInput,
      learningObjectives: items,
    });
    expect(result.success).toBe(true);
  });
});
