import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-06 — Progress GET + PATCH
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-06 + D5 + D12
// ADR: Docs/architecture/decisions/074-library-progress-cross-format-sync.md
//
// Endpoints:
//   GET   /api/library/lessons/:id/progress
//   PATCH /api/library/lessons/:id/progress
//
// Handlers em server/routes/library.ts (NAO EXISTEM):
//   handleGetLibraryProgress(req, res)
//   handlePatchLibraryProgress(req, res)
//
// D5: sync por SEGUNDOS absolutos. Se posicao > totalDuration do destino,
//     fallback abre no inicio (resolvido client-side mas testado aqui no
//     calculo helper).
// D12: upsert atomico, completedAt em 95%, throttle 5s servidor -> 429.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    findLessonAccess: vi.fn(),
    getLibraryProgressForLesson: vi.fn(),
    upsertLibraryProgress: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
import {
  handleGetLibraryProgress,
  handlePatchLibraryProgress,
  computeStartPositionForFormatSwitch,
  // @ts-expect-error - exports nao existem (red phase)
} from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).findLessonAccess.mockResolvedValue({
    userId: 'USER-0001',
    lessonId: 'l1',
    source: 'admin',
  });
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
  res.set = vi.fn();
  return res;
}

// ---------------------------------------------------------------------------
// GET /progress
// ---------------------------------------------------------------------------

describe('GET /api/library/lessons/:id/progress', () => {
  it('deve retornar progresso por formato', async () => {
    (storage as any).getLibraryProgressForLesson.mockResolvedValue([
      { format: 'video', lastPositionSeconds: 540, totalDurationSeconds: 1320, completedAt: null },
      { format: 'podcast', lastPositionSeconds: 720, totalDurationSeconds: 1500, completedAt: null },
    ]);
    const req = makeReq({ params: { id: 'l1' } });
    const res = makeRes();
    await handleGetLibraryProgress(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.video).toBeDefined();
    expect(res.body.podcast).toBeDefined();
    expect(res.body.video.lastPositionSeconds).toBe(540);
    expect(res.body.podcast.lastPositionSeconds).toBe(720);
  });

  it('deve omitir formato sem progresso', async () => {
    (storage as any).getLibraryProgressForLesson.mockResolvedValue([
      { format: 'article', lastPositionSeconds: 300, totalDurationSeconds: 720, completedAt: null },
    ]);
    const req = makeReq({ params: { id: 'l1' } });
    const res = makeRes();
    await handleGetLibraryProgress(req, res);
    expect(res.body.article).toBeDefined();
    expect(res.body.video).toBeUndefined();
    expect(res.body.podcast).toBeUndefined();
  });

  it('deve retornar 401 sem grant', async () => {
    (storage as any).findLessonAccess.mockResolvedValue(null);
    const req = makeReq({ params: { id: 'l1' } });
    const res = makeRes();
    await handleGetLibraryProgress(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /progress — upsert + throttle + 95% completedAt
// ---------------------------------------------------------------------------

describe('PATCH /api/library/lessons/:id/progress', () => {
  it('deve upsert e retornar { updated: true, completed: false }', async () => {
    (storage as any).upsertLibraryProgress.mockResolvedValue({
      updated: true,
      completed: false,
      lastUpdatedAt: new Date(),
    });
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'podcast', lastPositionSeconds: 60, totalDurationSeconds: 1500 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.completed).toBe(false);
  });

  it('deve marcar completedAt quando >= 95% (D12)', async () => {
    (storage as any).upsertLibraryProgress.mockResolvedValue({
      updated: true,
      completed: true,
      lastUpdatedAt: new Date(),
    });
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'video', lastPositionSeconds: 1300, totalDurationSeconds: 1320 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.body.completed).toBe(true);
    const arg = (storage as any).upsertLibraryProgress.mock.calls[0][0];
    expect(arg.lastPositionSeconds).toBe(1300);
    expect(arg.totalDurationSeconds).toBe(1320);
  });

  it('deve enforce throttle 5s server-side (Retry-After)', async () => {
    (storage as any).upsertLibraryProgress.mockResolvedValue({
      throttled: true,
      retryAfterSeconds: 5,
    });
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'video', lastPositionSeconds: 100 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.statusCode).toBe(429);
    // Retry-After header
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Retry-After': '5' })
    );
  });

  it('deve rejeitar format invalido (400)', async () => {
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'pdf', lastPositionSeconds: 0 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deve rejeitar lastPositionSeconds negativo (400)', async () => {
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'video', lastPositionSeconds: -1 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deve retornar 401 sem grant', async () => {
    (storage as any).findLessonAccess.mockResolvedValue(null);
    const req = makeReq({
      params: { id: 'l1' },
      body: { format: 'video', lastPositionSeconds: 100 },
    });
    const res = makeRes();
    await handlePatchLibraryProgress(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// computeStartPositionForFormatSwitch — D5 sync absoluto + fallback inicio
// ---------------------------------------------------------------------------

describe('computeStartPositionForFormatSwitch (D5)', () => {
  it('deve usar segundos absolutos quando posicao cabe no formato destino', () => {
    const result = computeStartPositionForFormatSwitch({
      sourceLastPositionSeconds: 720,
      destinationTotalDurationSeconds: 1320,
    });
    expect(result).toBe(720);
  });

  it('deve fallback para 0 quando posicao excede totalDuration destino (D5)', () => {
    const result = computeStartPositionForFormatSwitch({
      sourceLastPositionSeconds: 1500,
      destinationTotalDurationSeconds: 720,
    });
    expect(result).toBe(0);
  });

  it('deve retornar 0 quando source nao tem progresso', () => {
    const result = computeStartPositionForFormatSwitch({
      sourceLastPositionSeconds: undefined as any,
      destinationTotalDurationSeconds: 1320,
    });
    expect(result).toBe(0);
  });

  it('deve retornar 0 quando totalDuration destino indefinido', () => {
    const result = computeStartPositionForFormatSwitch({
      sourceLastPositionSeconds: 100,
      destinationTotalDurationSeconds: undefined as any,
    });
    expect(result).toBe(0);
  });

  it('deve aceitar exatamente igual a totalDuration (boundary)', () => {
    const result = computeStartPositionForFormatSwitch({
      sourceLastPositionSeconds: 1320,
      destinationTotalDurationSeconds: 1320,
    });
    expect(result).toBe(1320);
  });
});
