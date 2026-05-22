// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Mini Player 3 / RF-05.5 / RF-05.6 - POST/GET /api/audio/queue
//
// Spec: Docs/specs/sprint-mini-player-3.md RF-05.5 + 8.1 + 8.2 + ADR-193
//
// Target: server/routes/audioQueue.ts (NOVO)
//
// Contract:
//   - POST /api/audio/queue
//       Auth JWT. Body: { queue: QueueItemPersist[], repeatMode, shuffleEnabled, shuffledOrder, version }
//       Persist em audio_queue_snapshots (UPSERT por user_id PK).
//       Last-write-wins por version: server tem version >= client.version -> 409 com row atual.
//       OK -> 200 { accepted: true, version }
//   - GET /api/audio/queue
//       Auth JWT. Retorna row atual ou 404 se nao existe.
//
// Handler signature: handlePostAudioQueue(req, res, { storage } = {}) e
// handleGetAudioQueue(req, res, { storage } = {}) — lazy storage (lesson #34).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getAudioQueueSnapshot: vi.fn(),
    upsertAudioQueueSnapshot: vi.fn(),
  },
}));

function makeReq(body: any = {}, userId = 'USER-0001') {
  return {
    user: { userPlatformId: userId },
    body,
    headers: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

async function loadHandlers() {
  return await import('../../../server/routes/audioQueue');
}

const sampleQueueItem = {
  id: 'q1',
  trackId: 't1',
  source: 'library',
  title: 'Track A',
  durationSeconds: 600,
  addedAt: Date.now(),
};

describe('POST /api/audio/queue (RF-05.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: persiste snapshot e retorna { accepted: true, version }', async () => {
    storageMock.getAudioQueueSnapshot.mockResolvedValue(null);
    storageMock.upsertAudioQueueSnapshot.mockResolvedValue({ version: 5 });

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq({
        queue: [sampleQueueItem],
        repeatMode: 'all',
        shuffleEnabled: true,
        shuffledOrder: ['q1'],
        version: 5,
      }) as any,
      res as any,
      { storage: storageMock } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.version).toBe(5);
    expect(storageMock.upsertAudioQueueSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        repeatMode: 'all',
        shuffleEnabled: true,
        shuffledOrder: ['q1'],
        version: 5,
      }),
    );
  });

  it('last-write-wins: server version >= client version -> 409 com row atual', async () => {
    storageMock.getAudioQueueSnapshot.mockResolvedValue({
      userId: 'USER-0001',
      queue: [],
      repeatMode: 'off',
      shuffleEnabled: false,
      shuffledOrder: null,
      version: 10,
      updatedAt: new Date(),
    });

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq({
        queue: [sampleQueueItem],
        repeatMode: 'all',
        shuffleEnabled: false,
        shuffledOrder: null,
        version: 5, // <= server -> rejected
      }) as any,
      res as any,
      { storage: storageMock } as any,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.version).toBe(10);
    expect(storageMock.upsertAudioQueueSnapshot).not.toHaveBeenCalled();
  });

  it('payload invalido (queue nao-array) -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq({
        queue: 'not-array',
        repeatMode: 'off',
        shuffleEnabled: false,
        shuffledOrder: null,
        version: 1,
      }) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('repeatMode invalido -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq({
        queue: [],
        repeatMode: 'BOGUS',
        shuffleEnabled: false,
        shuffledOrder: null,
        version: 1,
      }) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('cap 50: queue.length > 50 -> 400', async () => {
    const big = Array.from({ length: 51 }, (_, i) => ({ ...sampleQueueItem, id: `q${i}` }));
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq({
        queue: big,
        repeatMode: 'off',
        shuffleEnabled: false,
        shuffledOrder: null,
        version: 1,
      }) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('sem userId no req.user -> 401', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const req: any = {
      user: undefined,
      body: { queue: [], repeatMode: 'off', shuffleEnabled: false, shuffledOrder: null, version: 1 },
    };
    await handlers.handlePostAudioQueue(req, res as any, { storage: storageMock } as any);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/audio/queue (RF-05.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: retorna snapshot existente', async () => {
    storageMock.getAudioQueueSnapshot.mockResolvedValue({
      userId: 'USER-0001',
      queue: [sampleQueueItem],
      repeatMode: 'all',
      shuffleEnabled: true,
      shuffledOrder: ['q1'],
      version: 7,
      updatedAt: new Date('2026-05-22T10:00:00Z'),
    });

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetAudioQueue(
      makeReq() as any,
      res as any,
      { storage: storageMock } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe(7);
    expect(res.body.queue).toHaveLength(1);
    expect(res.body.repeatMode).toBe('all');
    expect(res.body.shuffleEnabled).toBe(true);
  });

  it('sem row -> 404', async () => {
    storageMock.getAudioQueueSnapshot.mockResolvedValue(null);
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetAudioQueue(
      makeReq() as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(404);
  });

  it('sem userId -> 401', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const req: any = { user: undefined };
    await handlers.handleGetAudioQueue(req, res as any, { storage: storageMock } as any);
    expect(res.statusCode).toBe(401);
  });
});
