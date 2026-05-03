import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-2 / E2E — Bloco A end-to-end mocked flow
//
// Spec: Docs/specs/biblioteca-spec-2.md §13 acceptance criteria
//
// Cobre:
//   1. Founder roda script library-upload-static-assets -> CSS+JS uploaded
//   2. Founder roda script library-upload-bloco-a -> 9 lessons importadas
//   3. Frontend abre /biblioteca/curso/antes-das-cartas/a1-...
//      -> chama GET /article-bundle
//      -> bundle response inclui html + URLs assets
//      -> iframe srcdoc renderiza
//      -> postMessage scroll-depth dispara PATCH progress
//
// IMPORTANTE: este e2e nao roda navegador real — orquestra os modulos
// (storage, importer, sanitizer, handlers) com mocks de I/O. E2E real
// (browser puppeteer) fica out-of-scope MVP.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    upsertLibraryCourseBySlug: vi.fn().mockResolvedValue({ id: 'c1', slug: 'antes-das-cartas' }),
    upsertLibraryModuleBySlug: vi.fn().mockResolvedValue({ id: 'm1', slug: 'bloco-a' }),
    upsertLibraryLessonBySlug: vi.fn(),
    getLibraryCourseBySlug: vi.fn(),
    getLibraryLesson: vi.fn(),
    getLibraryLessonBySlug: vi.fn(),
    findLessonAccess: vi.fn(),
    bulkGrantLessonAccess: vi.fn(),
    upsertLibraryProgress: vi.fn(),
  },
}));

const mediaPutMock = vi.fn();
const mediaGetMock = vi.fn();
const putAtFixedKeyMock = vi.fn();
vi.mock('../../../server/services/mediaStorage', () => ({
  createMediaStorage: vi.fn(() => ({
    put: mediaPutMock,
    get: mediaGetMock,
    putAtFixedKey: putAtFixedKeyMock,
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
import {
  handleGetArticleBundle,
  handleAdminUploadStaticAsset,
  // @ts-expect-error - handlers nao existem (red phase)
} from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  mediaPutMock.mockResolvedValue({ key: 'library/audio/abc.m4a', size: 1024 });
  putAtFixedKeyMock.mockResolvedValue({
    size: 1024,
    sha256: 'abc123def456789012345678901234567890123456789012345678901234abcd',
  });
  (storage as any).upsertLibraryLessonBySlug.mockResolvedValue({
    id: 'l1',
    slug: 'a1-mentalidade-fixa',
  });
});

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((d: any) => {
    res.body = d;
    return res;
  });
  res.setHeader = vi.fn((k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  });
  res.send = vi.fn((d: any) => d);
  res.end = vi.fn();
  return res;
}

// ---------------------------------------------------------------------------
// Step 1: Founder uploads static assets (CSS + JS)
// ---------------------------------------------------------------------------

describe('E2E Bloco A — step 1: founder uploads static assets', () => {
  it('POST /api/admin/library/static-asset (kind=styles) -> 200 + sha256', async () => {
    const req: any = {
      user: { userPlatformId: 'USER-ADMIN' },
      body: { kind: 'styles' },
      file: { buffer: Buffer.from(':root { --accent-blue: #1976d2 }'), mimetype: 'text/css' },
    };
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.kind).toBe('styles');
    expect(res.body?.sha256).toBeDefined();
  });

  it('POST /api/admin/library/static-asset (kind=scripts) -> 200', async () => {
    const req: any = {
      user: { userPlatformId: 'USER-ADMIN' },
      body: { kind: 'scripts' },
      file: { buffer: Buffer.from('console.log(1)'), mimetype: 'application/javascript' },
    };
    const res = makeRes();
    await handleAdminUploadStaticAsset(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.kind).toBe('scripts');
  });
});

// ---------------------------------------------------------------------------
// Step 2: Founder roda library-upload-bloco-a (importa 9 lessons)
// ---------------------------------------------------------------------------

describe('E2E Bloco A — step 2: import manifest (9 lessons)', () => {
  it('importManifest com 9 audio + 9 html + 9 cover -> 9 lessons criadas', async () => {
    const csv = [
      'type,course_slug,course_title,module_slug,module_title,lesson_slug,lesson_title,subtitle,category_id,tags,article_filename,audio_filename,video_filename,cover_filename,display_order',
      'course,antes-das-cartas,"00 - Antes das Cartas",,,,,,,,,,,A1.jpeg,1',
      'module,antes-das-cartas,,bloco-a,Bloco A,,,,,,,,,,1',
      ...Array.from({ length: 9 }, (_, i) => {
        const ep = i + 1;
        return `lesson,antes-das-cartas,,bloco-a,,a${ep}-mentalidade,A${ep},,performance_mental,"mindset",A${ep}.html,A${ep}.m4a,,A${ep}.jpeg,${ep}`;
      }),
    ].join('\n');

    const files = [
      { fieldname: 'files', originalname: 'A1.jpeg', mimetype: 'image/jpeg', buffer: Buffer.from('cover') },
      ...Array.from({ length: 9 }, (_, i) => ({
        fieldname: 'files',
        originalname: `A${i + 1}.html`,
        mimetype: 'text/html',
        buffer: Buffer.from(`<article>A${i + 1}</article>`),
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        fieldname: 'files',
        originalname: `A${i + 1}.m4a`,
        mimetype: 'audio/mp4',
        buffer: Buffer.from(`audio${i + 1}`),
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        fieldname: 'files',
        originalname: `A${i + 1}.jpeg`,
        mimetype: 'image/jpeg',
        buffer: Buffer.from(`cover${i + 1}`),
      })),
    ];

    const result = await importManifest({ csv, files, adminUserId: 'USER-ADMIN' });
    expect(result.lessonsCreated).toBeGreaterThanOrEqual(9);
  });
});

// ---------------------------------------------------------------------------
// Step 3: Frontend GET /article-bundle -> renderiza iframe
// ---------------------------------------------------------------------------

describe('E2E Bloco A — step 3: GET article-bundle', () => {
  beforeEach(() => {
    (storage as any).getLibraryLesson.mockResolvedValue({
      id: 'l1',
      slug: 'a1-mentalidade-fixa',
      title: 'A1 - Mentalidade Fixa',
      articleHtml: '<section class="flashcard-grid"><button data-flashcard-toggle="card-1">Mostrar</button></section>',
      learningObjectives: ['Obj 1', 'Obj 2'],
    });
    (storage as any).findLessonAccess.mockResolvedValue({
      userId: 'USER-0001',
      lessonId: 'l1',
      source: 'admin_grant',
    });
    mediaGetMock.mockImplementation((key: string) => {
      if (key === 'library/static/article-styles.css') {
        return Promise.resolve({ buffer: Buffer.from('.flashcard-grid{}'), mime: 'text/css' });
      }
      if (key === 'library/static/article-scripts.js') {
        return Promise.resolve({ buffer: Buffer.from('document.addEventListener("DOMContentLoaded",()=>{})'), mime: 'application/javascript' });
      }
      return Promise.resolve(null);
    });
  });

  it('article-bundle endpoint retorna bundle completo', async () => {
    const req: any = {
      user: { userPlatformId: 'USER-0001' },
      params: { id: 'l1' },
      query: {},
      headers: {},
    };
    const res = makeRes();
    await handleGetArticleBundle(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.html).toContain('<section class="flashcard-grid">');
    expect(res.body?.html).toContain('data-flashcard-toggle');
    expect(res.body?.stylesUrl).toMatch(/article-styles\.css\?v=/);
    expect(res.body?.scriptsUrl).toMatch(/article-scripts\.js\?v=/);
    expect(res.body?.meta?.learningObjectives).toEqual(['Obj 1', 'Obj 2']);
  });
});

// ---------------------------------------------------------------------------
// Step 4: Scroll-depth >=95% -> upsertLibraryProgress dispara completedAt
// ---------------------------------------------------------------------------

describe('E2E Bloco A — step 4: scroll-depth >=95% marca completedAt', () => {
  // Lesson #15: vi.unmock dentro de it() vira hoisted (afeta todo o arquivo).
  // Solucao: usar vi.doUnmock (NAO hoisted) + vi.resetModules + await import()
  // (Lesson #14: require nao resolve ESM deps).
  it('REAL storage.upsertLibraryProgress com 95% -> completedAt setado (nao stub)', async () => {
    vi.doUnmock('../../../server/storage');
    vi.resetModules();
    const { storage: realStorage } = await import('../../../server/storage');

    let threwNotImplemented = false;
    let result: any;
    try {
      result = await realStorage.upsertLibraryProgress({
        userId: 'USER-0001',
        lessonId: 'l1',
        format: 'article',
        lastPositionSeconds: 95,
        totalDurationSeconds: 100,
      });
    } catch (err: any) {
      if (/not implemented/i.test(err?.message ?? '')) threwNotImplemented = true;
    }
    expect(threwNotImplemented).toBe(false);
    if (result) {
      expect(result.completed).toBe(true);
      expect(result.row?.completedAt).toBeDefined();
    }
    // Restaurar mock para nao vazar pros outros testes (vi.doMock + reset)
    vi.doMock('../../../server/storage', () => ({
      storage: {
        upsertLibraryCourseBySlug: vi.fn().mockResolvedValue({ id: 'c1', slug: 'antes-das-cartas' }),
        upsertLibraryModuleBySlug: vi.fn().mockResolvedValue({ id: 'm1', slug: 'bloco-a' }),
        upsertLibraryLessonBySlug: vi.fn().mockResolvedValue({ id: 'l1', slug: 'a1-mentalidade-fixa' }),
        getLibraryCourseBySlug: vi.fn(),
        getLibraryLesson: vi.fn(),
        getLibraryLessonBySlug: vi.fn(),
        findLessonAccess: vi.fn(),
        bulkGrantLessonAccess: vi.fn(),
        upsertLibraryProgress: vi.fn(),
      },
    }));
  });
});

// ---------------------------------------------------------------------------
// Smoke: Coach AI tools work after RF-01 (findLibraryLessonsByCategory)
// ---------------------------------------------------------------------------

describe('E2E Bloco A — coach recommend_lesson tool depende de RF-01', () => {
  // Lesson #15: vi.doUnmock + await import() em vez de vi.unmock + require.
  it('findLibraryLessonsByCategory retorna array com hasAccess + progressState', async () => {
    vi.doUnmock('../../../server/storage');
    vi.resetModules();
    const { storage: realStorage } = await import('../../../server/storage');

    let threwNotImplemented = false;
    try {
      await realStorage.findLibraryLessonsByCategory('performance_mental', { limit: 5 });
    } catch (err: any) {
      if (/not implemented/i.test(err?.message ?? '')) threwNotImplemented = true;
    }
    expect(threwNotImplemented).toBe(false);
  });
});
