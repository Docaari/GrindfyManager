// Sprint MP3.1 Wave A / M1 — Zod per-item validation tests.
// Cobre rejeicoes que o validator manual antigo deixava passar:
//   - track ausente (queue item sem nested track)
//   - track.trackId vazio ou > 128 chars
//   - track.title > 200 chars (anti-DoS payload)
//   - track.source fora enum
//   - shuffledOrder com id > 64 chars
//   - extra props strict (Zod strict)

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

const validTrack = {
  trackId: 't1',
  source: 'library' as const,
  title: 'Track A',
  durationSeconds: 600,
};

const validItem = {
  id: 'q1',
  track: validTrack,
  addedAt: 1700000000000,
};

const validBody = {
  queue: [validItem],
  repeatMode: 'off' as const,
  shuffleEnabled: false,
  shuffledOrder: null,
  version: 1,
};

describe('POST /api/audio/queue Zod strict (MP3.1 M1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getAudioQueueSnapshot.mockResolvedValue(null);
    storageMock.upsertAudioQueueSnapshot.mockResolvedValue({ version: 1 });
  });

  it('happy path nested track -> 200', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostAudioQueue(
      makeReq(validBody) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(200);
  });

  it('queue item sem track nested -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{ id: 'q1', addedAt: 1700000000000 }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/queue\./);
  });

  it('track.title > 200 chars -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{
        ...validItem,
        track: { ...validTrack, title: 'a'.repeat(201) },
      }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('track.source fora enum -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{
        ...validItem,
        track: { ...validTrack, source: 'youtube' as any },
      }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('track.trackId vazio -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{ ...validItem, track: { ...validTrack, trackId: '' } }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('queue item.id > 64 chars -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{ ...validItem, id: 'a'.repeat(65) }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('addedAt negativo -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = {
      ...validBody,
      queue: [{ ...validItem, addedAt: -1 }],
    };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('version negativa -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = { ...validBody, version: -5 };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('extra prop strict (audioQueueBodySchema) -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad: any = { ...validBody, unexpected: 'field' };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('shuffledOrder com id > 64 chars -> 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = { ...validBody, shuffledOrder: ['a'.repeat(65)] };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
  });

  it('payload com body.issues array (detalhes top 5 do Zod)', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    const bad = { ...validBody, version: 'not-a-number' as any };
    await handlers.handlePostAudioQueue(
      makeReq(bad) as any,
      res as any,
      { storage: storageMock } as any,
    );
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});
