/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 7 — RF-03 (POST) + RF-04 (DELETE)
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-03, §RF-04
 * ADRs : 116 (schema)
 * Pad. : tests/api/home-coach-recommendation.test.ts (handlers exportados +
 *        mocks de storage; sem montar Express).
 *
 * Cobertura POST /api/focus-stats:
 *   - 401 sem userPlatformId
 *   - 400 quando body sem statId / studyThemeId (Zod)
 *   - 400 quando month formato invalido
 *   - 400 quando month futuro
 *   - 400 quando month passado
 *   - 400 quando statId nao existe em HUD_STAT_CATALOG (INVALID_STAT_ID)
 *   - 404 quando studyThemeId nao pertence ao user (THEME_NOT_FOUND)
 *   - 409 quando user ja tem 3 marcacoes nesse mes (LIMIT_REACHED)
 *   - 409 quando UNIQUE (user, statId, month) duplica (STAT_ALREADY_FOCUSED)
 *   - 201 + payload do registro criado
 *
 * Cobertura DELETE /api/focus-stats/:id:
 *   - 401 sem userPlatformId
 *   - 404 quando id nao existe (deletar idempotente: 404 segundo dispatch)
 *   - 404 quando id pertence a outro user (NAO 403, evita vazamento)
 *   - 200 + ok:true quando delete bem-sucedido
 *
 * Lessons aplicadas:
 *   #3 mock storage shape REAL
 *   #5 vi.fn() ok aqui
 *
 * Status RED: handlers `handleCreateFocusStat`/`handleDeleteFocusStat` NAO
 * existem. Modulo `server/routes/focus-stats.ts` (ou similar) sera criado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock storage
// =============================================================================
vi.mock('../../server/storage', () => ({
  storage: {
    listUserFocusStats: vi.fn(),
    countUserFocusStats: vi.fn(),
    createUserFocusStat: vi.fn(),
    deleteUserFocusStat: vi.fn(),
    getStudyThemeById: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

async function loadHandlers() {
  return await import('../../server/routes/focus-stats');
}

// =============================================================================
// Helpers req/res
// =============================================================================
function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-OWNER' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-15T10:00:00Z'));
});

// =============================================================================
// POST /api/focus-stats — auth
// =============================================================================
describe('POST /api/focus-stats — auth', () => {
  it('401 sem userPlatformId', async () => {
    const req = makeReq({ user: undefined, body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' } });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST — Zod validation
// =============================================================================
describe('POST /api/focus-stats — body validation', () => {
  it('400 sem statId', async () => {
    const req = makeReq({ body: { studyThemeId: 'th-1' } });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 sem studyThemeId', async () => {
    const req = makeReq({ body: { statId: 'cbet_flop_ip' } });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando month=invalid', async () => {
    const req = makeReq({ body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1', month: 'invalid' } });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando month futuro (2026-12)', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(0);
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1', month: '2026-12' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error ?? res.body?.message ?? '')).toMatch(/FUTURE|future/);
  });

  it('400 quando month passado (2026-04, hoje eh 2026-05)', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(0);
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1', month: '2026-04' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error ?? res.body?.message ?? '')).toMatch(/PAST|past/);
  });
});

// =============================================================================
// POST — INVALID_STAT_ID
// =============================================================================
describe('POST /api/focus-stats — statId invalido', () => {
  it('400 INVALID_STAT_ID quando statId nao existe em HUD_STAT_CATALOG', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(0);
    const req = makeReq({
      body: { statId: 'codigo_jamais_existira_xyz', studyThemeId: 'th-1' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(400);
    expect(String(res.body?.error ?? res.body?.message ?? '')).toMatch(/STAT|stat/i);
    expect(storage.createUserFocusStat).not.toHaveBeenCalled();
  });
});

// =============================================================================
// POST — THEME_NOT_FOUND
// =============================================================================
describe('POST /api/focus-stats — theme ownership', () => {
  it('404 THEME_NOT_FOUND quando tema nao existe', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue(null);
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-none' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(404);
    expect(storage.createUserFocusStat).not.toHaveBeenCalled();
  });

  it('404 THEME_NOT_FOUND quando tema pertence a outro user (NAO 403)', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({
      id: 'th-1',
      userId: 'USER-OUTRO',
      name: 'X',
    });
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(404);
    expect(storage.createUserFocusStat).not.toHaveBeenCalled();
  });
});

// =============================================================================
// POST — LIMIT_REACHED
// =============================================================================
describe('POST /api/focus-stats — limite 3', () => {
  it('409 LIMIT_REACHED quando user ja tem 3 marcacoes no mes', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(3);
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(409);
    expect(String(res.body?.error ?? res.body?.message ?? '')).toMatch(/LIMIT|limit/i);
    expect(storage.createUserFocusStat).not.toHaveBeenCalled();
  });
});

// =============================================================================
// POST — STAT_ALREADY_FOCUSED
// =============================================================================
describe('POST /api/focus-stats — UNIQUE duplicate', () => {
  it('409 STAT_ALREADY_FOCUSED quando storage lanca code STAT_ALREADY_FOCUSED', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(1);
    (storage.createUserFocusStat as any).mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'STAT_ALREADY_FOCUSED' }),
    );
    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(409);
    expect(String(res.body?.error ?? res.body?.message ?? '')).toMatch(/ALREADY|already/i);
  });
});

// =============================================================================
// POST — happy path 201
// =============================================================================
describe('POST /api/focus-stats — happy path', () => {
  it('201 + payload do registro criado quando tudo valido', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(0);
    (storage.createUserFocusStat as any).mockResolvedValue({
      id: 'ufs-newid',
      userId: 'USER-OWNER',
      statId: 'cbet_flop_ip',
      studyThemeId: 'th-1',
      month: '2026-05',
      createdAt: new Date('2026-05-15T10:00:00Z'),
      updatedAt: new Date('2026-05-15T10:00:00Z'),
    });

    const req = makeReq({
      body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' },
    });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('ufs-newid');
    expect(res.body.statId).toBe('cbet_flop_ip');
    expect(res.body.studyThemeId).toBe('th-1');
    expect(res.body.month).toBe('2026-05');
    expect(storage.createUserFocusStat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-OWNER',
        statId: 'cbet_flop_ip',
        studyThemeId: 'th-1',
        month: '2026-05',
      }),
    );
  });

  it('com 1 ou 2 marcacoes existentes -> 201', async () => {
    (storage.getStudyThemeById as any).mockResolvedValue({ id: 'th-1', userId: 'USER-OWNER', name: 'X' });
    (storage.countUserFocusStats as any).mockResolvedValue(2);
    (storage.createUserFocusStat as any).mockResolvedValue({
      id: 'ufs-3',
      userId: 'USER-OWNER',
      statId: 'cbet_flop_ip',
      studyThemeId: 'th-1',
      month: '2026-05',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const req = makeReq({ body: { statId: 'cbet_flop_ip', studyThemeId: 'th-1' } });
    const res = makeRes();
    const { handleCreateFocusStat } = await loadHandlers();
    await handleCreateFocusStat(req, res);
    expect(res.statusCode).toBe(201);
  });
});

// =============================================================================
// DELETE /api/focus-stats/:id — auth
// =============================================================================
describe('DELETE /api/focus-stats/:id — auth', () => {
  it('401 sem userPlatformId', async () => {
    const req = makeReq({ user: undefined, params: { id: 'ufs-1' } });
    const res = makeRes();
    const { handleDeleteFocusStat } = await loadHandlers();
    await handleDeleteFocusStat(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// DELETE — not found
// =============================================================================
describe('DELETE /api/focus-stats/:id — 404', () => {
  it('404 quando id nao existe (storage retorna false)', async () => {
    (storage.deleteUserFocusStat as any).mockResolvedValue(false);
    const req = makeReq({ params: { id: 'ufs-none' } });
    const res = makeRes();
    const { handleDeleteFocusStat } = await loadHandlers();
    await handleDeleteFocusStat(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('404 quando id pertence a outro user (delete WHERE userId=? retorna false)', async () => {
    // storage.deleteUserFocusStat aplica ownership internamente:
    // se row pertence a outro user, retorna false (sem 403)
    (storage.deleteUserFocusStat as any).mockResolvedValue(false);
    const req = makeReq({ params: { id: 'ufs-do-outro' } });
    const res = makeRes();
    const { handleDeleteFocusStat } = await loadHandlers();
    await handleDeleteFocusStat(req, res);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// DELETE — happy path
// =============================================================================
describe('DELETE /api/focus-stats/:id — happy path', () => {
  it('200 + ok:true quando delete bem-sucedido', async () => {
    (storage.deleteUserFocusStat as any).mockResolvedValue(true);
    const req = makeReq({ params: { id: 'ufs-1' } });
    const res = makeRes();
    const { handleDeleteFocusStat } = await loadHandlers();
    await handleDeleteFocusStat(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(storage.deleteUserFocusStat).toHaveBeenCalledWith('ufs-1', 'USER-OWNER');
  });

  it('idempotente: 2x delete = primeira 200, segunda 404', async () => {
    (storage.deleteUserFocusStat as any)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { handleDeleteFocusStat } = await loadHandlers();

    const req1 = makeReq({ params: { id: 'ufs-1' } });
    const res1 = makeRes();
    await handleDeleteFocusStat(req1, res1);
    expect(res1.statusCode).toBe(200);

    const req2 = makeReq({ params: { id: 'ufs-1' } });
    const res2 = makeRes();
    await handleDeleteFocusStat(req2, res2);
    expect(res2.statusCode).toBe(404);
  });
});
