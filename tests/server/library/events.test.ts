import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-06 — POST /api/library/events
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-06 + D11
//
// Endpoint: POST /api/library/events
// Handler: server/routes/library.ts (NAO EXISTE):
//   handleCreateLibraryEvent(req, res)
//
// Body: { lessonId, eventType, format?, positionSeconds?, metadata? }
// Auth: requireAuth + lesson access
// Rate limit: 60/min/user
// Server-side timestamp (ignora client). Fire-and-forget 202.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    findLessonAccess: vi.fn(),
    createLibraryEvent: vi.fn(),
    countLibraryEventsForUserInWindow: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
// @ts-expect-error - handler nao existe (red phase)
import { handleCreateLibraryEvent } from '../../../server/routes/library';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).findLessonAccess.mockResolvedValue({
    userId: 'USER-0001',
    lessonId: 'l1',
    source: 'admin',
  });
  (storage as any).countLibraryEventsForUserInWindow.mockResolvedValue(0);
  (storage as any).createLibraryEvent.mockResolvedValue({ id: 'evt_1' });
});

function makeReq(body: any, user: any = { userPlatformId: 'USER-0001' }) {
  return { user, body, params: {}, query: {} };
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

describe('POST /api/library/events', () => {
  it('deve retornar 202 (Accepted, fire-and-forget)', async () => {
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'view',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(202);
  });

  it('deve gravar evento com format/positionSeconds/metadata', async () => {
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'play',
      format: 'podcast',
      positionSeconds: 120,
      metadata: { playbackRate: 1.5 },
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect((storage as any).createLibraryEvent).toHaveBeenCalled();
    const arg = (storage as any).createLibraryEvent.mock.calls[0][0];
    expect(arg.lessonId).toBe('l1');
    expect(arg.eventType).toBe('play');
    expect(arg.format).toBe('podcast');
    expect(arg.positionSeconds).toBe(120);
    expect(arg.metadata).toEqual({ playbackRate: 1.5 });
    expect(arg.userId).toBe('USER-0001');
  });

  it('deve usar timestamp server-side (ignora client timestamp hint)', async () => {
    const clientTs = new Date('2020-01-01').toISOString();
    const before = Date.now();
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'play',
      format: 'video',
      positionSeconds: 0,
      eventTimestamp: clientTs, // hint do cliente — server ignora
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    const arg = (storage as any).createLibraryEvent.mock.calls[0][0];
    if (arg.eventTimestamp) {
      const ts = new Date(arg.eventTimestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before - 1000);
    }
  });

  it('deve retornar 401 sem grant para a lesson', async () => {
    (storage as any).findLessonAccess.mockResolvedValue(null);
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'view',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(401);
    expect((storage as any).createLibraryEvent).not.toHaveBeenCalled();
  });

  it('deve enforce rate limit 60/min/user (61o request -> 429)', async () => {
    (storage as any).countLibraryEventsForUserInWindow.mockResolvedValue(60);
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'play',
      format: 'podcast',
      positionSeconds: 30,
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(429);
  });

  it('deve aceitar evento na borda 60/min (59 prev + 1 now ok)', async () => {
    (storage as any).countLibraryEventsForUserInWindow.mockResolvedValue(59);
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'pause',
      format: 'video',
      positionSeconds: 90,
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(202);
  });

  it('deve rejeitar eventType invalido (400)', async () => {
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'rocket_launch',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deve aceitar evento sem positionSeconds nem format (view)', async () => {
    const req = makeReq({
      lessonId: 'l1',
      eventType: 'view',
    });
    const res = makeRes();
    await handleCreateLibraryEvent(req, res);
    expect(res.statusCode).toBe(202);
  });
});
