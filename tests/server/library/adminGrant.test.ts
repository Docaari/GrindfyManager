import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-04 — Admin Grant Access endpoint
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-04 + ADR-073
//
// Endpoint: POST /api/admin/library/grant-access
// Handler: server/routes/adminLibrary.ts (NAO EXISTE — red phase)
//   handleAdminGrantAccess(req, res)
//
// Body: { userId, lessonIds[], source, expiresAt? }
// Response 200: { granted, alreadyHadAccess, errors[] }
// Caps: lessonIds.length <= 500
// Idempotente via composite unique (userId, lessonId)
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    // F5 fix: handler usa getUserById (existing) ao inves do stub
    // redundante getUserByPlatformId. Mock mantem o nome esperado.
    getUserById: vi.fn(),
    grantLessonAccess: vi.fn(),
    bulkGrantLessonAccess: vi.fn(),
    findLessonAccess: vi.fn(),
    getLibraryLesson: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
// @ts-expect-error - handler nao existe (red phase)
import { handleAdminGrantAccess } from '../../../server/routes/adminLibrary';

beforeEach(() => {
  vi.clearAllMocks();
  (storage as any).getUserById.mockResolvedValue({
    userPlatformId: 'USER-0099',
    email: 'alpha@test.com',
  });
  (storage as any).bulkGrantLessonAccess.mockResolvedValue({
    granted: 3,
    alreadyHadAccess: 0,
    errors: [],
  });
});

function makeReq(body: any, user: any = { userPlatformId: 'USER-0001', role: 'admin' }) {
  return { user, body, params: {}, query: {} };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
  };
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

describe('POST /api/admin/library/grant-access (RF-04)', () => {
  it('deve grant N aulas e retornar { granted, alreadyHadAccess, errors }', async () => {
    (storage as any).bulkGrantLessonAccess.mockResolvedValue({
      granted: 3,
      alreadyHadAccess: 0,
      errors: [],
    });
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds: ['lesson_1', 'lesson_2', 'lesson_3'],
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.granted).toBe(3);
    expect(res.body.alreadyHadAccess).toBe(0);
  });

  it('deve ser idempotente — re-grant retorna alreadyHadAccess++', async () => {
    (storage as any).bulkGrantLessonAccess.mockResolvedValue({
      granted: 1,
      alreadyHadAccess: 2,
      errors: [],
    });
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds: ['lesson_1', 'lesson_2', 'lesson_3'],
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.alreadyHadAccess).toBe(2);
    expect(res.body.granted).toBe(1);
  });

  it('deve retornar 404 se user nao existe', async () => {
    (storage as any).getUserById.mockResolvedValue(null);
    const req = makeReq({
      userId: 'USER-NEXISTS',
      lessonIds: ['lesson_1'],
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('deve rejeitar source fora do enum (400)', async () => {
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds: ['lesson_1'],
      source: 'free_trial',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deve aceitar source purchase/bundle/subscription', async () => {
    for (const source of ['purchase', 'bundle', 'subscription']) {
      const req = makeReq({
        userId: 'USER-0099',
        lessonIds: ['lesson_1'],
        source,
      });
      const res = makeRes();
      await handleAdminGrantAccess(req, res);
      expect(res.statusCode).toBe(200);
    }
  });

  it('deve enforce cap de 500 lessons (rejeita 501)', async () => {
    const lessonIds = Array.from({ length: 501 }, (_, i) => `lesson_${i}`);
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds,
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(400);
    const msg = JSON.stringify(res.body || {});
    expect(msg).toMatch(/500|cap|limit|too_many/i);
  });

  it('deve aceitar exatamente 500 lessons', async () => {
    const lessonIds = Array.from({ length: 500 }, (_, i) => `lesson_${i}`);
    (storage as any).bulkGrantLessonAccess.mockResolvedValue({
      granted: 500,
      alreadyHadAccess: 0,
      errors: [],
    });
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds,
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('deve persistir grantedBy = req.user.userPlatformId', async () => {
    const req = makeReq(
      {
        userId: 'USER-0099',
        lessonIds: ['lesson_1'],
        source: 'admin',
      },
      { userPlatformId: 'USER-ADMIN', role: 'admin' }
    );
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect((storage as any).bulkGrantLessonAccess).toHaveBeenCalled();
    const callArg = (storage as any).bulkGrantLessonAccess.mock.calls[0][0];
    expect(callArg.grantedBy).toBe('USER-ADMIN');
  });

  it('deve passar expiresAt quando fornecido', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds: ['lesson_1'],
      source: 'subscription',
      expiresAt,
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    const callArg = (storage as any).bulkGrantLessonAccess.mock.calls[0][0];
    expect(callArg.expiresAt).toBeDefined();
  });

  it('deve rejeitar lessonIds vazio (400)', async () => {
    const req = makeReq({
      userId: 'USER-0099',
      lessonIds: [],
      source: 'admin',
    });
    const res = makeRes();
    await handleAdminGrantAccess(req, res);
    expect(res.statusCode).toBe(400);
  });
});
