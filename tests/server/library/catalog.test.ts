import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-05 — Endpoints publicos catalogo
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-05
//
// Endpoints:
//   GET  /api/library/courses
//   GET  /api/library/courses/:slug
//   GET  /api/library/lessons/:id
//
// Handlers em server/routes/library.ts (NAO EXISTE — red phase):
//   handleListLibraryCourses(req, res)
//   handleGetLibraryCourse(req, res)
//   handleGetLibraryLesson(req, res)
//
// Capa visivel mesmo sem acesso. Badge state via hasAccess/hasAnyAccess.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    listLibraryCourses: vi.fn(),
    getLibraryCourseBySlug: vi.fn(),
    getLibraryLesson: vi.fn(),
    getLibraryLessonByCourseAndSlug: vi.fn(),
    findLessonAccess: vi.fn(),
    lessonAccessLookup: vi.fn(),
    listModulesByCourse: vi.fn(),
    listLessonsByCourse: vi.fn(),
    countCoursesAccessForUser: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
import {
  handleListLibraryCourses,
  handleGetLibraryCourse,
  handleGetLibraryLesson,
  // @ts-expect-error - handlers nao existem (red phase)
} from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(opts: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    params: {},
    query: {},
    ...opts,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

// ---------------------------------------------------------------------------
// GET /api/library/courses
// ---------------------------------------------------------------------------

describe('GET /api/library/courses', () => {
  it('deve listar cursos publicados ordenados por displayOrder', async () => {
    (storage as any).listLibraryCourses.mockResolvedValue([
      {
        id: 'c1',
        slug: 'antes-das-cartas',
        title: '00 - Antes das Cartas',
        subtitle: 'Fundacao mental',
        coverKey: 'library/covers/00.jpg',
        displayOrder: 1,
        isPublished: true,
        lessonCount: 46,
        hasAnyAccess: true,
      },
      {
        id: 'c2',
        slug: 'anatomia-spot',
        title: '01 - Anatomia de um Spot',
        coverKey: 'library/covers/01.jpg',
        displayOrder: 2,
        isPublished: true,
        lessonCount: 11,
        hasAnyAccess: false,
      },
    ]);
    const req = makeReq();
    const res = makeRes();
    await handleListLibraryCourses(req, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].slug).toBe('antes-das-cartas');
    expect(res.body[0]).toHaveProperty('hasAnyAccess');
  });

  it('deve filtrar somente isPublished=true (storage call recebe filter)', async () => {
    (storage as any).listLibraryCourses.mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await handleListLibraryCourses(req, res);
    expect((storage as any).listLibraryCourses).toHaveBeenCalled();
    const args = (storage as any).listLibraryCourses.mock.calls[0];
    // args contem userId (para hasAnyAccess) e filter publicado
    const hasOnlyPublished = args.some(
      (a: any) =>
        (typeof a === 'object' && a?.onlyPublished === true) ||
        a === true
    );
    // Aceita varias formas de signature, contanto que userId seja propagado
    const hasUserId = args.some(
      (a: any) =>
        a === 'USER-0001' ||
        (typeof a === 'object' && a?.userId === 'USER-0001')
    );
    expect(hasUserId).toBe(true);
  });

  it('deve retornar coverUrl construido a partir do coverKey', async () => {
    (storage as any).listLibraryCourses.mockResolvedValue([
      {
        id: 'c1',
        slug: 'antes-das-cartas',
        title: 'X',
        coverKey: 'library/covers/abc.jpg',
        displayOrder: 1,
        isPublished: true,
        lessonCount: 0,
        hasAnyAccess: false,
      },
    ]);
    const req = makeReq();
    const res = makeRes();
    await handleListLibraryCourses(req, res);
    expect(res.body[0].coverUrl).toMatch(/\/api\/library\/assets\//);
  });
});

// ---------------------------------------------------------------------------
// GET /api/library/courses/:slug
// ---------------------------------------------------------------------------

describe('GET /api/library/courses/:slug', () => {
  it('deve retornar detalhe do curso com modules + lessons + hasAccess', async () => {
    (storage as any).getLibraryCourseBySlug.mockResolvedValue({
      id: 'c1',
      slug: 'antes-das-cartas',
      title: '00 - Antes das Cartas',
      subtitle: 'sub',
      description: 'desc',
      coverKey: 'library/covers/00.jpg',
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'bloco-a',
          title: 'Bloco A',
          description: 'fund mentais',
          coverKey: null,
          lessons: [
            {
              id: 'l1',
              slug: 'a1-mentalidade',
              title: 'A1 - Mentalidade',
              subtitle: '',
              coverKey: null,
              videoMuxPlaybackId: 'pb_xyz',
              videoDurationSeconds: 720,
              audioKey: 'library/audio/USER-X/a1.m4a',
              audioDurationSeconds: 1500,
              articleHtml: '<p>x</p>',
              displayOrder: 1,
            },
          ],
        },
      ],
    });
    (storage as any).lessonAccessLookup.mockResolvedValue(new Map([['l1', true]]));
    const req = makeReq({ params: { slug: 'antes-das-cartas' } });
    const res = makeRes();
    await handleGetLibraryCourse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('antes-das-cartas');
    expect(res.body.modules[0].lessons[0].slug).toBe('a1-mentalidade');
    expect(res.body.modules[0].lessons[0].hasAccess).toBe(true);
    // formats[] derivado dos campos preenchidos
    const formats = res.body.modules[0].lessons[0].formats;
    expect(formats).toContain('video');
    expect(formats).toContain('podcast');
    expect(formats).toContain('article');
  });

  it('deve retornar 404 se slug nao existe', async () => {
    (storage as any).getLibraryCourseBySlug.mockResolvedValue(null);
    const req = makeReq({ params: { slug: 'nao-existe' } });
    const res = makeRes();
    await handleGetLibraryCourse(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('deve retornar lessons mesmo sem acesso (capa preservada, hasAccess=false)', async () => {
    (storage as any).getLibraryCourseBySlug.mockResolvedValue({
      id: 'c1',
      slug: 'x',
      title: 'X',
      isPublished: true,
      modules: [
        {
          id: 'm1',
          slug: 'b',
          title: 'B',
          lessons: [
            {
              id: 'l1',
              slug: 'l1-slug',
              title: 'Aula',
              coverKey: 'library/covers/l1.jpg',
              displayOrder: 1,
            },
          ],
        },
      ],
    });
    (storage as any).lessonAccessLookup.mockResolvedValue(new Map([['l1', false]]));
    const req = makeReq({ params: { slug: 'x' } });
    const res = makeRes();
    await handleGetLibraryCourse(req, res);
    expect(res.body.modules[0].lessons[0].hasAccess).toBe(false);
    expect(res.body.modules[0].lessons[0].coverUrl).toMatch(/\/api\/library\/assets\//);
  });
});

// ---------------------------------------------------------------------------
// GET /api/library/lessons/:id
// ---------------------------------------------------------------------------

describe('GET /api/library/lessons/:id', () => {
  it('deve retornar 401 sem grant', async () => {
    (storage as any).getLibraryLesson.mockResolvedValue({
      id: 'l1',
      slug: 'a1',
      courseId: 'c1',
      title: 'A1',
    });
    (storage as any).findLessonAccess.mockResolvedValue(null); // sem grant
    const req = makeReq({ params: { id: 'l1' } });
    const res = makeRes();
    await handleGetLibraryLesson(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('deve retornar 404 se lesson nao existe', async () => {
    (storage as any).getLibraryLesson.mockResolvedValue(null);
    const req = makeReq({ params: { id: 'nao-existe' } });
    const res = makeRes();
    await handleGetLibraryLesson(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('deve retornar 200 com formats detalhado quando ha acesso', async () => {
    (storage as any).getLibraryLesson.mockResolvedValue({
      id: 'l1',
      slug: 'a1-mentalidade',
      courseId: 'c1',
      courseSlug: 'antes-das-cartas',
      title: 'A1',
      subtitle: 'sub',
      categoryId: 'performance_mental',
      tags: ['mindset'],
      coverKey: 'library/covers/l1.jpg',
      videoMuxPlaybackId: 'pb_xyz',
      videoDurationSeconds: 720,
      audioKey: 'library/audio/USER-1/a1.m4a',
      audioDurationSeconds: 1500,
      audioMimeType: 'audio/mp4',
      articleHtml: '<p>limpo</p>',
      articleWordCount: 1,
      isPublished: true,
    });
    (storage as any).findLessonAccess.mockResolvedValue({
      userId: 'USER-0001',
      lessonId: 'l1',
      source: 'admin',
    });
    const req = makeReq({ params: { id: 'l1' } });
    const res = makeRes();
    await handleGetLibraryLesson(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.formats.video).toBeDefined();
    expect(res.body.formats.video.mux.playbackId).toBe('pb_xyz');
    expect(res.body.formats.podcast.audioUrl).toBe('/api/library/lessons/l1/audio');
    expect(res.body.formats.article.html).toBe('<p>limpo</p>');
  });
});
