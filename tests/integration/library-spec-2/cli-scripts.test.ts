import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-10 + RF-11 — Scripts CLI smoke
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-10 + RF-11
//
// Modulos target (NAO EXISTEM — red phase):
//   scripts/library-upload-bloco-a.ts
//   scripts/library-upload-static-assets.ts
//
// Smoke tests cobrem:
//   - Funcoes helpers exportadas (transformLessonJs, buildBlocoAManifestCsv,
//     LESSONS const)
//   - Comportamento dry-run (sem network call)
//   - Cap 9 lessons hardcoded
//
// IMPORTANTE: nao executamos `process.argv` parsing dos scripts;
// validamos que helpers internos sao exportados pra reuso e teste.
// =============================================================================

// ---------------------------------------------------------------------------
// transformLessonJs (RF-11)
// ---------------------------------------------------------------------------

describe('transformLessonJs (RF-11)', () => {
  function loadTransform() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../scripts/library-upload-static-assets');
    return mod.transformLessonJs;
  }

  it('deve retornar { transformed, removedHandlers }', () => {
    const transform = loadTransform();
    const source = 'function originalCode() {}';
    const result = transform(source);
    expect(result).toHaveProperty('transformed');
    expect(result).toHaveProperty('removedHandlers');
    expect(typeof result.transformed).toBe('string');
    expect(typeof result.removedHandlers).toBe('number');
  });

  it('transformed deve incluir boilerplate de postMessage resize', () => {
    const transform = loadTransform();
    const result = transform('// original');
    expect(result.transformed).toMatch(/grindfy:library:resize/);
  });

  it('transformed deve incluir boilerplate de scroll-depth postMessage', () => {
    const transform = loadTransform();
    const result = transform('// original');
    expect(result.transformed).toMatch(/grindfy:library:scroll/);
  });

  it('transformed deve incluir handler para data-flashcard-toggle', () => {
    const transform = loadTransform();
    const result = transform('// original');
    expect(result.transformed).toMatch(/data-flashcard-toggle/);
  });

  it('transformed deve incluir handler para data-accordion-toggle', () => {
    const transform = loadTransform();
    const result = transform('// original');
    expect(result.transformed).toMatch(/data-accordion-toggle/);
  });

  it('transformed deve preservar codigo original', () => {
    const transform = loadTransform();
    const result = transform('// original code marker XYZ-123');
    expect(result.transformed).toContain('XYZ-123');
  });
});

// ---------------------------------------------------------------------------
// LESSONS constant (RF-10) — 9 lessons hardcoded
// ---------------------------------------------------------------------------

describe('library-upload-bloco-a — LESSONS constant (RF-10)', () => {
  function loadLessons() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../scripts/library-upload-bloco-a');
    return mod.LESSONS ?? mod.BLOCO_A_LESSONS;
  }

  it('deve exportar exatamente 9 lessons (Bloco A)', () => {
    const lessons = loadLessons();
    expect(Array.isArray(lessons)).toBe(true);
    expect(lessons).toHaveLength(9);
  });

  it('cada lesson deve ter shape { episode, slug, title, displayOrder }', () => {
    const lessons = loadLessons();
    for (const l of lessons) {
      expect(l).toHaveProperty('episode');
      expect(l).toHaveProperty('slug');
      expect(l).toHaveProperty('title');
      expect(l).toHaveProperty('displayOrder');
      expect(l.episode).toMatch(/^A[1-9]$/);
    }
  });

  it('A1 deve ser mentalidade-fixa-vs-crescimento', () => {
    const lessons = loadLessons();
    const a1 = lessons.find((l: any) => l.episode === 'A1');
    expect(a1).toBeDefined();
    expect(a1.slug).toMatch(/mentalidade-fixa/);
  });

  it('todos os slugs devem ser unicos', () => {
    const lessons = loadLessons();
    const slugs = lessons.map((l: any) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('displayOrder deve ser sequencial 1-9', () => {
    const lessons = loadLessons();
    const orders = lessons.map((l: any) => l.displayOrder).sort((a: number, b: number) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

// ---------------------------------------------------------------------------
// buildBlocoAManifestCsv (RF-10) helper
// ---------------------------------------------------------------------------

describe('buildBlocoAManifestCsv (RF-10)', () => {
  function loadBuilder() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../scripts/library-upload-bloco-a');
    return mod.buildBlocoAManifestCsv;
  }

  it('deve gerar CSV com 1 course + 1 module + N lessons', () => {
    const builder = loadBuilder();
    const csv = builder({ skipExistingSlugs: [] });
    expect(typeof csv).toBe('string');
    expect(csv).toMatch(/^type,course_slug/);
    const lines = csv.split('\n').filter((l: string) => l.length > 0);
    // 1 header + 1 course + 1 module + 9 lessons = 12
    expect(lines.length).toBeGreaterThanOrEqual(12);
  });

  it('com skipExistingSlugs ativo, lessons existentes nao sao incluidas', () => {
    const builder = loadBuilder();
    const csv = builder({
      skipExistingSlugs: ['a1-mentalidade-fixa-vs-crescimento'],
    });
    expect(csv).not.toMatch(/a1-mentalidade-fixa-vs-crescimento/);
  });
});
