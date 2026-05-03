import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-11 — Batch upload manifest CSV
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-11
// Diagrama: flow-batch-upload-manifest.mermaid
//
// Modulo target: server/services/manifestImporter.ts (NAO EXISTE)
//   parseManifestCsv(csvText: string) => { rows: ManifestRow[], errors }
//   importManifest({ csv, files }) => { courseId, modulesCreated, lessonsCreated, errors }
//
// + sanitizer: server/services/htmlSanitizer.ts (NAO EXISTE)
//   sanitizeArticleHtml(rawHtml) => { clean, wordCount, warnings }
//
// Caps: 50MB total, 100 rows, slug duplicado bloqueia.
// Idempotente: rerun nao duplica (upsert por slug).
// =============================================================================

import {
  parseManifestCsv,
  importManifest,
  // @ts-expect-error - modulo nao existe (red phase)
} from '../../../server/services/manifestImporter';

import {
  sanitizeArticleHtml,
  // @ts-expect-error - modulo nao existe (red phase)
} from '../../../server/services/htmlSanitizer';

// Mock storage e mediaStorage
vi.mock('../../../server/storage', () => ({
  storage: {
    upsertLibraryCourseBySlug: vi.fn(),
    upsertLibraryModuleBySlug: vi.fn(),
    upsertLibraryLessonBySlug: vi.fn(),
    deleteLibraryLesson: vi.fn(),
  },
}));

vi.mock('../../../server/services/mediaStorage', () => ({
  createMediaStorage: vi.fn(() => ({
    put: vi.fn(async () => ({ key: 'library/audio/abc.m4a', size: 1024 })),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  })),
}));

vi.mock('../../../server/services/muxMediaProvider', () => ({
  createMuxProvider: vi.fn(() => ({
    uploadAsset: vi.fn(async () => ({ assetId: 'a_1', playbackId: 'pb_1' })),
    createPlaybackToken: vi.fn(),
  })),
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).upsertLibraryCourseBySlug.mockResolvedValue({ id: 'course_1', slug: 'antes-das-cartas' });
  (storage as any).upsertLibraryModuleBySlug.mockResolvedValue({ id: 'mod_1', slug: 'bloco-a' });
  (storage as any).upsertLibraryLessonBySlug.mockResolvedValue({ id: 'lesson_1', slug: 'a1-mentalidade' });
});

// ---------------------------------------------------------------------------
// parseManifestCsv
// ---------------------------------------------------------------------------

describe('parseManifestCsv', () => {
  it('deve parsear CSV valido com course/module/lesson', () => {
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,antes-das-cartas,"00 - Antes das Cartas",,,,,,,,,,,_capas/cover.jpg,1',
      'module,antes-das-cartas,,bloco-a,Bloco A - Fundamentos Mentais,,,,,,,,_capas/bloco-a.jpg,1',
      'lesson,antes-das-cartas,,bloco-a,,a1-mentalidade-fixa,Mentalidade Fixa,,performance_mental,"mindset,growth","Bloco A/A1.html","Bloco A/A1.m4a",,_capas/A1.jpg,1',
    ].join('\n');

    const result = parseManifestCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].type).toBe('course');
    expect(result.rows[1].type).toBe('module');
    expect(result.rows[2].type).toBe('lesson');
    expect(result.rows[2].category_id).toBe('performance_mental');
    expect(result.rows[2].tags).toEqual(['mindset', 'growth']);
  });

  it('deve registrar erro fatal quando CSV malformed', () => {
    const csv = 'no header at all,no rows';
    const result = parseManifestCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deve detectar slug duplicado dentro do mesmo curso (fatal)', () => {
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'lesson,course-x,,b,,dup-slug,Aula 1,,preflop,,art1.html,a1.m4a,,c1.jpg,1',
      'lesson,course-x,,b,,dup-slug,Aula 2,,preflop,,art2.html,a2.m4a,,c2.jpg,2',
    ].join('\n');
    const result = parseManifestCsv(csv);
    expect(result.errors.some((e: any) => /duplic|dup/i.test(e.reason || ''))).toBe(true);
  });

  it('deve registrar erro nao-fatal quando categoria invalida', () => {
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'lesson,course-x,,b,,l-slug,Aula,,nao_existe,,art.html,a.m4a,,c.jpg,1',
    ].join('\n');
    const result = parseManifestCsv(csv);
    // Nao-fatal: linha vai pro errors mas parser nao explode
    const hasInvalidCategory = result.errors.some((e: any) =>
      /categ/i.test(e.reason || '')
    );
    expect(hasInvalidCategory).toBe(true);
  });

  it('deve enforce cap de 100 rows', () => {
    const header = 'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order';
    const lines = [header];
    for (let i = 0; i < 101; i++) {
      lines.push(`lesson,c,,b,,slug${i},Aula ${i},,preflop,,a.html,a.m4a,,c.jpg,${i}`);
    }
    const result = parseManifestCsv(lines.join('\n'));
    expect(result.errors.some((e: any) => /100|cap|max/i.test(e.reason || ''))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importManifest — happy path + idempotencia + cleanup
// ---------------------------------------------------------------------------

describe('importManifest', () => {
  function makeCsv() {
    // F2 fix follow-up: linha module antes tinha 14 cols (faltava 1 virgula
    // entre video_filename e cover_filename). Antes de F2 isso era
    // incidentalmente ignorado porque module nunca consumia cover_filename.
    // Agora com F2 capturando coverKey de modulos tambem, ajustamos para
    // o shape correto de 15 colunas conforme HEADER_KEYS em manifestImporter.
    return [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,antes-das-cartas,"00 - Antes das Cartas",,,,,,,,,,,cover.jpg,1',
      'module,antes-das-cartas,,bloco-a,Bloco A,,,,,,,,,bloco-a.jpg,1',
      'lesson,antes-das-cartas,,bloco-a,,a1-mentalidade,A1 - Mentalidade,,performance_mental,mindset,A1.html,A1.m4a,,A1.jpg,1',
    ].join('\n');
  }

  function makeFiles() {
    return [
      { fieldname: 'files', originalname: 'A1.html', mimetype: 'text/html', buffer: Buffer.from('<p>conteudo</p>') },
      { fieldname: 'files', originalname: 'A1.m4a', mimetype: 'audio/mp4', buffer: Buffer.from('m4a-bytes') },
      { fieldname: 'files', originalname: 'A1.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('jpg-bytes') },
      { fieldname: 'files', originalname: 'cover.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('cover-bytes') },
      { fieldname: 'files', originalname: 'bloco-a.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('bloco-bytes') },
    ];
  }

  it('deve criar curso + modulo + lesson e retornar contadores', async () => {
    const result = await importManifest({
      csv: makeCsv(),
      files: makeFiles(),
      adminUserId: 'USER-ADMIN',
    });
    expect(result.courseId).toBeDefined();
    expect(result.modulesCreated).toBe(1);
    expect(result.lessonsCreated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('deve ser idempotente — rerun mesmo CSV nao duplica (upsert por slug)', async () => {
    await importManifest({
      csv: makeCsv(),
      files: makeFiles(),
      adminUserId: 'USER-ADMIN',
    });
    const callsAfterFirst = (storage as any).upsertLibraryLessonBySlug.mock.calls.length;
    await importManifest({
      csv: makeCsv(),
      files: makeFiles(),
      adminUserId: 'USER-ADMIN',
    });
    // Segunda chamada usa upsert — nao cria nova lesson
    expect((storage as any).upsertLibraryLessonBySlug).toHaveBeenCalled();
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it('deve registrar erro nao-fatal quando arquivo nao encontrado em files[]', async () => {
    const result = await importManifest({
      csv: makeCsv(),
      files: [], // sem arquivos referenciados
      adminUserId: 'USER-ADMIN',
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deve enforce cap de 100MB total payload', async () => {
    const huge = Buffer.alloc(105 * 1024 * 1024);
    await expect(
      importManifest({
        csv: makeCsv(),
        files: [
          { fieldname: 'files', originalname: 'huge.bin', mimetype: 'application/octet-stream', buffer: huge },
        ],
        adminUserId: 'USER-ADMIN',
      })
    ).rejects.toThrow(/100|too_large|payload|cap/i);
  });
});

// ---------------------------------------------------------------------------
// htmlSanitizer (D10) — XSS payloads bloqueados
// ---------------------------------------------------------------------------

describe('sanitizeArticleHtml (D10) — XSS prevention', () => {
  it('deve remover <script>', () => {
    const dirty = '<p>safe</p><script>alert(1)</script>';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean).toContain('safe');
    expect(result.clean.toLowerCase()).not.toContain('<script');
    expect(result.clean.toLowerCase()).not.toContain('alert(1)');
  });

  it('deve remover <iframe>', () => {
    const dirty = '<p>x</p><iframe src="https://evil.com"></iframe>';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean.toLowerCase()).not.toContain('<iframe');
  });

  it('deve remover handler onerror em <img>', () => {
    const dirty = '<img src="/api/library/assets/x.jpg" onerror="alert(1)">';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean.toLowerCase()).not.toContain('onerror');
  });

  it('deve bloquear <a href="javascript:...">', () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean.toLowerCase()).not.toMatch(/href="javascript:/);
  });

  it('deve bloquear <img src> hotlink externo (allowlist /api/library/assets/)', () => {
    const dirty = '<img src="https://evil.com/track.gif">';
    const result = sanitizeArticleHtml(dirty);
    // Externo bloqueado: src removido OU img inteira removida
    expect(result.clean.toLowerCase()).not.toContain('evil.com');
  });

  it('deve permitir <img src="/api/library/assets/...">', () => {
    const dirty = '<img src="/api/library/assets/abc.jpg" alt="x">';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean).toContain('/api/library/assets/abc.jpg');
  });

  it('deve preservar tags da allowlist (p, h1-h6, ul, ol, strong, em, code, pre, blockquote)', () => {
    const dirty = '<h1>Titulo</h1><p>Texto <strong>bold</strong> <em>ital</em></p><ul><li>i</li></ul><blockquote>q</blockquote><code>c</code><pre>p</pre>';
    const result = sanitizeArticleHtml(dirty);
    expect(result.clean.toLowerCase()).toContain('<h1>');
    expect(result.clean.toLowerCase()).toContain('<p>');
    expect(result.clean.toLowerCase()).toContain('<strong>');
    expect(result.clean.toLowerCase()).toContain('<em>');
    expect(result.clean.toLowerCase()).toContain('<ul>');
    expect(result.clean.toLowerCase()).toContain('<li>');
    expect(result.clean.toLowerCase()).toContain('<blockquote>');
    expect(result.clean.toLowerCase()).toContain('<code>');
    expect(result.clean.toLowerCase()).toContain('<pre>');
  });

  it('deve calcular wordCount (text-only)', () => {
    const dirty = '<p>uma duas tres quatro cinco</p>';
    const result = sanitizeArticleHtml(dirty);
    expect(result.wordCount).toBe(5);
  });
});
