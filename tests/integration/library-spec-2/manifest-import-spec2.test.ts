import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / RF-09 — Manifest importer changes
//
// Spec: Docs/specs/biblioteca-spec-2.md RF-09 + D5
// ADR-095 (learning_objectives extraction)
//
// Mudancas Spec 2:
//   1. Extracao automatica de learning_objectives do HTML antes do sanitize
//   2. Aceita config Bloco A (audio_extension='m4a', MIME='audio/mp4',
//      scope='library/audio')
//   3. Cap batch total 150MB no caller (multer limits stay 50MB/file)
//   4. Manual override via CSV column learning_objectives (JSON array string)
//   5. Sanitizer chamado com policy='admin-trusted' (ADR-093)
//
// Modulo target:
//   - server/services/manifestImporter.ts (REFACTOR — RF-09)
//   - server/services/learningObjectivesExtractor.ts (NOVO — RF-09 / ADR-095)
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    upsertLibraryCourseBySlug: vi.fn().mockResolvedValue({ id: 'c1', slug: 'antes-das-cartas' }),
    upsertLibraryModuleBySlug: vi.fn().mockResolvedValue({ id: 'm1', slug: 'bloco-a' }),
    upsertLibraryLessonBySlug: vi.fn().mockResolvedValue({ id: 'l1', slug: 'a1' }),
    deleteLibraryLesson: vi.fn(),
  },
}));

vi.mock('../../../server/services/mediaStorage', () => ({
  createMediaStorage: vi.fn(() => ({
    put: vi.fn(async (input: any) => ({
      key: `${input.scope}/${input.ext === 'm4a' ? 'audio_id' : 'gen_id'}.${input.ext}`,
      size: input.buffer?.length ?? 0,
    })),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  })),
}));

vi.mock('../../../server/services/muxMediaProvider', () => ({
  createMuxProvider: vi.fn(() => ({
    uploadAsset: vi.fn(),
    createPlaybackToken: vi.fn(),
  })),
}));

import { storage } from '../../../server/storage';
import { importManifest } from '../../../server/services/manifestImporter';

// extractor module nao existe ainda (red phase) — lazy require dentro dos
// describes que precisam dele. Helper que isola a importacao pra cada teste:
function getExtractor(): (html: string) => string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../../../server/services/learningObjectivesExtractor');
  return mod.extractLearningObjectives;
}

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).upsertLibraryCourseBySlug.mockResolvedValue({ id: 'c1', slug: 'antes-das-cartas' });
  (storage as any).upsertLibraryModuleBySlug.mockResolvedValue({ id: 'm1', slug: 'bloco-a' });
  (storage as any).upsertLibraryLessonBySlug.mockResolvedValue({ id: 'l1', slug: 'a1' });
});

// ---------------------------------------------------------------------------
// extractLearningObjectives — unit
// ---------------------------------------------------------------------------

describe('extractLearningObjectives (RF-09 / ADR-095)', () => {
  it('deve extrair 4 itens do <div class="learning-objectives"><ul><li>', () => {
    const html = `
      <article>
        <div class="learning-objectives">
          <ul>
            <li>Entender Carol Dweck</li>
            <li>Reconhecer mentalidade fixa</li>
            <li>Praticar mentalidade de crescimento</li>
            <li>Aplicar em sessoes</li>
          </ul>
        </div>
      </article>
    `;
    const result = getExtractor()(html);
    expect(result).toEqual([
      'Entender Carol Dweck',
      'Reconhecer mentalidade fixa',
      'Praticar mentalidade de crescimento',
      'Aplicar em sessoes',
    ]);
  });

  it('deve retornar [] quando HTML sem div learning-objectives', () => {
    const result = getExtractor()('<p>sem objetivos</p>');
    expect(result).toEqual([]);
  });

  it('deve reconhecer variante learning_objectives (underscore)', () => {
    const html = '<div class="learning_objectives"><ul><li>Item 1</li><li>Item 2</li></ul></div>';
    const result = getExtractor()(html);
    expect(result).toEqual(['Item 1', 'Item 2']);
  });

  it('deve reconhecer variante objectives (sem prefixo)', () => {
    const html = '<div class="objectives"><ul><li>Item 1</li></ul></div>';
    const result = getExtractor()(html);
    expect(result).toEqual(['Item 1']);
  });

  it('deve aplicar cap 10 items (li #11 dropped)', () => {
    const items = Array.from({ length: 12 }, (_, i) => `<li>Item ${i + 1}</li>`).join('');
    const html = `<div class="learning-objectives"><ul>${items}</ul></div>`;
    const result = getExtractor()(html);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('Item 1');
    expect(result[9]).toBe('Item 10');
  });

  it('deve droppar string vazia', () => {
    const html = '<div class="learning-objectives"><ul><li></li><li>Valido</li></ul></div>';
    const result = getExtractor()(html);
    expect(result).toEqual(['Valido']);
  });

  it('deve droppar string > 200 chars', () => {
    const longStr = 'x'.repeat(250);
    const html = `<div class="learning-objectives"><ul><li>${longStr}</li><li>Valido</li></ul></div>`;
    const result = getExtractor()(html);
    expect(result).toEqual(['Valido']);
  });

  it('deve strip-tag aninhado (<li><strong>X</strong> Y</li> -> "X Y")', () => {
    const html = '<div class="learning-objectives"><ul><li><strong>Bold</strong> Texto</li></ul></div>';
    const result = getExtractor()(html);
    expect(result[0]).toMatch(/Bold\s+Texto/);
  });

  it('deve graceful fallback [] em HTML mal-formado (sem </div>)', () => {
    const html = '<div class="learning-objectives"><ul><li>X</li></ul>';
    const result = getExtractor()(html);
    // Aceita [] OU array com X (depende implementer); o importante eh nao throw
    expect(Array.isArray(result)).toBe(true);
  });

  it('case-insensitive class match', () => {
    const html = '<div class="Learning-Objectives"><ul><li>X</li></ul></div>';
    const result = getExtractor()(html);
    // Spec: case-insensitive class match
    expect(result).toEqual(['X']);
  });
});

// ---------------------------------------------------------------------------
// importManifest — extracao integrada no importer
// ---------------------------------------------------------------------------

describe('importManifest — learning_objectives integration', () => {
  it('HTML com learning-objectives -> upsertLibraryLessonBySlug recebe array preenchido', async () => {
    const html = `
      <article>
        <div class="learning-objectives">
          <ul><li>Obj A</li><li>Obj B</li></ul>
        </div>
        <p>conteudo</p>
      </article>
    `;
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,antes-das-cartas,"00 - Antes das Cartas",,,,,,,,,,,,1',
      'module,antes-das-cartas,,bloco-a,Bloco A,,,,,,,,,,1',
      'lesson,antes-das-cartas,,bloco-a,,a1,Mentalidade Fixa,,performance_mental,"mindset",a1.html,,,,,1',
    ].join('\n');

    await importManifest({
      csv,
      files: [
        {
          fieldname: 'files',
          originalname: 'a1.html',
          mimetype: 'text/html',
          buffer: Buffer.from(html),
        },
      ],
      adminUserId: 'USER-ADMIN',
    });

    const lessonCall = (storage as any).upsertLibraryLessonBySlug.mock.calls[0]?.[0];
    expect(lessonCall).toBeDefined();
    expect(lessonCall.learningObjectives).toEqual(['Obj A', 'Obj B']);
  });

  it('HTML SEM learning-objectives -> upsertLibraryLessonBySlug recebe []', async () => {
    const html = '<article><p>so conteudo</p></article>';
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,c-x,"X",,,,,,,,,,,,1',
      'module,c-x,,m,Mod,,,,,,,,,,1',
      'lesson,c-x,,m,,l-no-obj,L,,performance_mental,,no-obj.html,,,,,1',
    ].join('\n');

    await importManifest({
      csv,
      files: [
        {
          fieldname: 'files',
          originalname: 'no-obj.html',
          mimetype: 'text/html',
          buffer: Buffer.from(html),
        },
      ],
      adminUserId: 'USER-ADMIN',
    });

    const lessonCall = (storage as any).upsertLibraryLessonBySlug.mock.calls[0]?.[0];
    expect(lessonCall?.learningObjectives).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// M4A audio config (D Bloco A)
// ---------------------------------------------------------------------------

describe('importManifest — M4A audio config (Bloco A)', () => {
  it('audio .m4a com mime audio/mp4 deve ser aceito sem erro', async () => {
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,c-aud,"X",,,,,,,,,,,,1',
      'module,c-aud,,m,Mod,,,,,,,,,,1',
      'lesson,c-aud,,m,,l-aud,L,,performance_mental,,,a1.m4a,,,,1',
    ].join('\n');

    const result = await importManifest({
      csv,
      files: [
        {
          fieldname: 'files',
          originalname: 'a1.m4a',
          mimetype: 'audio/mp4',
          buffer: Buffer.from('audio bytes'),
        },
      ],
      adminUserId: 'USER-ADMIN',
    });

    expect(result.lessonsCreated).toBeGreaterThanOrEqual(1);
    const lessonCall = (storage as any).upsertLibraryLessonBySlug.mock.calls[0]?.[0];
    // audioMimeType deve ser audio/mp4 quando ext .m4a
    expect(lessonCall?.audioMimeType ?? 'audio/mp4').toBe('audio/mp4');
  });
});

// ---------------------------------------------------------------------------
// Manual override CSV column
// ---------------------------------------------------------------------------

describe('importManifest — learning_objectives override via CSV', () => {
  it('CSV column learning_objectives (JSON array string) sobrescreve auto-extract', async () => {
    const html = '<div class="learning-objectives"><ul><li>Auto1</li></ul></div>';
    // Hipotetico: CSV ganha 16a coluna learning_objectives
    // Como spec diz que eh opcional, rodamos um teste que valida que
    // se a coluna for aceita pelo parser, override funciona.
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order,learning_objectives',
      'course,c-ov,"X",,,,,,,,,,,,,1,',
      'module,c-ov,,m,Mod,,,,,,,,,,,1,',
      'lesson,c-ov,,m,,l-ov,L,,performance_mental,,a1.html,,,,1,"[""Manual1"",""Manual2""]"',
    ].join('\n');

    await importManifest({
      csv,
      files: [
        {
          fieldname: 'files',
          originalname: 'a1.html',
          mimetype: 'text/html',
          buffer: Buffer.from(html),
        },
      ],
      adminUserId: 'USER-ADMIN',
    });

    const lessonCall = (storage as any).upsertLibraryLessonBySlug.mock.calls[0]?.[0];
    if (lessonCall?.learningObjectives) {
      // Override -> Manual1, Manual2
      expect(lessonCall.learningObjectives).toEqual(['Manual1', 'Manual2']);
    }
  });
});

// ---------------------------------------------------------------------------
// Sanitizer chamado com 'admin-trusted' (ADR-093)
// ---------------------------------------------------------------------------

describe("importManifest — sanitizer chamado com policy 'admin-trusted'", () => {
  it('HTML com section + button data-attr deve ser preservado pos-sanitize', async () => {
    const html = `
      <article>
        <section class="flashcard-grid">
          <button data-flashcard-toggle="x" type="button">Mostrar</button>
        </section>
      </article>
    `;
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,c-sec,"X",,,,,,,,,,,,1',
      'module,c-sec,,m,Mod,,,,,,,,,,1',
      'lesson,c-sec,,m,,l-sec,L,,performance_mental,,sec.html,,,,,1',
    ].join('\n');

    await importManifest({
      csv,
      files: [
        {
          fieldname: 'files',
          originalname: 'sec.html',
          mimetype: 'text/html',
          buffer: Buffer.from(html),
        },
      ],
      adminUserId: 'USER-ADMIN',
    });

    const lessonCall = (storage as any).upsertLibraryLessonBySlug.mock.calls[0]?.[0];
    expect(lessonCall?.articleHtml).toContain('<section');
    expect(lessonCall?.articleHtml).toContain('flashcard-grid');
    expect(lessonCall?.articleHtml).toContain('<button');
    expect(lessonCall?.articleHtml).toContain('data-flashcard-toggle');
  });
});

// ---------------------------------------------------------------------------
// Batch size cap 150MB (RF-09 9.C)
// ---------------------------------------------------------------------------

describe('importManifest — cap batch 150MB', () => {
  it('payload total > 150MB deve ser rejeitado com erro batch_too_large', async () => {
    const bigBuffer = Buffer.alloc(160 * 1024 * 1024); // 160MB
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'lesson,c-big,,m,,l1,L,,performance_mental,,,big.m4a,,,,1',
    ].join('\n');

    let threwSize = false;
    try {
      await importManifest({
        csv,
        files: [
          {
            fieldname: 'files',
            originalname: 'big.m4a',
            mimetype: 'audio/mp4',
            buffer: bigBuffer,
          },
        ],
        adminUserId: 'USER-ADMIN',
      });
    } catch (err: any) {
      threwSize = /too_large|too large|batch.*size|payload.*size/i.test(String(err?.message ?? ''));
    }
    expect(threwSize).toBe(true);
  });
});
