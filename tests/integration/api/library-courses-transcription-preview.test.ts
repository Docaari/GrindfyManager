// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-04.2 - GET /api/library/courses/:slug com
// transcriptionPreview por lesson.
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-04.2 + 8.2 + D7
//
// Target: server/routes/library.ts (estende handleGetLibraryCourse)
//
// Contract:
//   - storage.getLibraryCourseBySlug retorna lessons com transcription_preview
//     opcional (coluna nova da migration 0078). Handler espelha em response
//     como `lesson.transcriptionPreview` (null se ausente).
//   - Test verifica que o handler INCLUI `transcriptionPreview` no JSON.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getLibraryCourseBySlug: vi.fn(),
    lessonAccessLookup: vi.fn(),
    getLibraryProgressByLessonIds: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

function makeReq(slug = 'curso-mtt') {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { slug },
    headers: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/library');
}

describe('GET /api/library/courses/:slug — transcriptionPreview (RF-04.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.lessonAccessLookup.mockResolvedValue(new Map([['L1', true], ['L2', true]]));
    storageMock.getLibraryProgressByLessonIds.mockResolvedValue([]);
  });

  it('response inclui transcriptionPreview por lesson (RF-04.2)', async () => {
    storageMock.getLibraryCourseBySlug.mockResolvedValue({
      id: 'C1',
      slug: 'curso-mtt',
      title: 'Curso MTT',
      isPublished: true,
      modules: [
        {
          id: 'M1',
          slug: 'm1',
          title: 'Modulo 1',
          lessons: [
            {
              id: 'L1',
              slug: 'l1',
              title: 'Mindset',
              displayOrder: 0,
              audioKey: 'audio/L1',
              audioDurationSeconds: 720,
              transcriptionPreview: 'Neste video, vamos cobrir 3-bet OOP na BB vs CO em zoom 100bb...',
            },
            {
              id: 'L2',
              slug: 'l2',
              title: 'Tilt',
              displayOrder: 1,
              audioKey: 'audio/L2',
              audioDurationSeconds: 600,
              transcriptionPreview: null,
            },
          ],
        },
      ],
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetLibraryCourse(makeReq() as any, res as any);

    expect(res.statusCode).toBe(200);
    const lessons = res.body.modules[0].lessons;
    const l1 = lessons.find((l: any) => l.id === 'L1');
    const l2 = lessons.find((l: any) => l.id === 'L2');
    expect(l1.transcriptionPreview).toBe(
      'Neste video, vamos cobrir 3-bet OOP na BB vs CO em zoom 100bb...',
    );
    expect(l2.transcriptionPreview).toBeNull();
  });

  it('lesson sem campo transcription_preview na storage row -> preview = null', async () => {
    storageMock.getLibraryCourseBySlug.mockResolvedValue({
      id: 'C1',
      slug: 'curso-mtt',
      title: 'Curso MTT',
      isPublished: true,
      modules: [
        {
          id: 'M1',
          slug: 'm1',
          title: 'Modulo 1',
          lessons: [
            {
              id: 'L1',
              slug: 'l1',
              title: 'Sem preview',
              displayOrder: 0,
              audioKey: 'audio/L1',
              audioDurationSeconds: 720,
              // Sem transcriptionPreview field.
            },
          ],
        },
      ],
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetLibraryCourse(makeReq() as any, res as any);

    expect(res.statusCode).toBe(200);
    const l1 = res.body.modules[0].lessons[0];
    expect(l1.transcriptionPreview).toBeNull();
  });
});
