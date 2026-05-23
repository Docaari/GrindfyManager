// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-05 — POST /api/library/lessons/:id/progress
//
// Spec: Docs/specs/sprint-mp-validation.md RF-05 §Implementation Notes
// "sendBeacon usa POST. Server precisa aceitar ambos. Opcao simples:
//   app.post('/api/library/lessons/:id/progress', requireAuth,
//            handlePatchLibraryProgress)"
//
// Cobertura:
//   - Handler `handlePatchLibraryProgress` aceita tambem requests POST
//     (verb-agnostic) — mesmo payload, mesma logica de UPSERT.
//   - Re-uso do mesmo handler (sem duplicacao de lógica).
//
// Lessons: #34 (handler 3o arg injectedStorage), #32 (db fallback).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    findLessonAccess: vi.fn(),
    upsertLibraryProgress: vi.fn(),
    getLibraryProgressForLesson: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({ storage: storageMock }));

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.findLessonAccess.mockResolvedValue({
    userId: 'USER-0001',
    lessonId: 'lesson-aaa',
    source: 'admin',
  });
  storageMock.upsertLibraryProgress.mockResolvedValue({
    completed: false,
    watchedPct: 25,
    rateLimited: false,
  });
});

function makeReq(opts: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: 'lesson-aaa' },
    body: {
      format: 'video',
      lastPositionSeconds: 75,
      totalDurationSeconds: 300,
    },
    method: 'POST',
    ...opts,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  res.set = vi.fn();
  res.end = vi.fn();
  return res;
}

describe('POST /api/library/lessons/:id/progress (sendBeacon path)', () => {
  it('handler aceita verbo POST e chama upsertLibraryProgress', async () => {
    const mod: any = await import('../../../server/routes/library');
    expect(typeof mod.handlePatchLibraryProgress).toBe('function');

    const req = makeReq();
    const res = makeRes();
    await mod.handlePatchLibraryProgress(req, res);

    expect(storageMock.upsertLibraryProgress).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('rota POST e PATCH compartilham mesma logica (sem duplicacao)', async () => {
    const mod: any = await import('../../../server/routes/library');
    const handler = mod.handlePatchLibraryProgress;

    const reqPatch = makeReq({ method: 'PATCH' });
    const reqPost = makeReq({ method: 'POST' });
    const res1 = makeRes();
    const res2 = makeRes();

    await handler(reqPatch, res1);
    await handler(reqPost, res2);

    expect(storageMock.upsertLibraryProgress).toHaveBeenCalledTimes(2);
    // Mesma resposta independente do verbo.
    expect(res1.statusCode).toBe(res2.statusCode);
  });

  it('registra rota POST em registerLibraryRoutes (defesa-em-profundidade)', async () => {
    const mod: any = await import('../../../server/routes/library-register');
    expect(typeof mod.registerLibraryRoutes).toBe('function');

    const calls: Array<{ verb: string; path: string }> = [];
    const fakeApp: any = {
      get: (p: string) => calls.push({ verb: 'GET', path: p }),
      post: (p: string) => calls.push({ verb: 'POST', path: p }),
      patch: (p: string) => calls.push({ verb: 'PATCH', path: p }),
      put: (p: string) => calls.push({ verb: 'PUT', path: p }),
      delete: (p: string) => calls.push({ verb: 'DELETE', path: p }),
      use: () => {},
    };

    try {
      mod.registerLibraryRoutes(fakeApp);
    } catch {
      // Pode falhar em deps lazy; o que importa eh termos a chamada POST.
    }

    const hasPost = calls.some(
      (c) => c.verb === 'POST' && c.path === '/api/library/lessons/:id/progress',
    );
    expect(hasPost).toBe(true);
  });
});
