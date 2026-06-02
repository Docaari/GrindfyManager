import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint MDA-1 RF-03 (CRUD)
// POST / GET by-theme / GET :id / PATCH / DELETE /api/mda-reads
//
// Spec: Docs/specs/sprint-mda-1-2026-06-01.md (RF-03, §"Cenarios de Teste Derivados")
// ADR : Docs/architecture/decisions/230-mda-1-reference-cards-nn-tagging.md (D-1/D-3/D-5/D-6)
//
// Handlers (NOVOS) em server/routes/mda.ts:
//   handleCreateMdaRead(req, res, injectedStorage?)
//   handleListMdaReadsByTheme(req, res, injectedStorage?)
//   handleGetMdaRead(req, res, injectedStorage?)
//   handleUpdateMdaRead(req, res, injectedStorage?)
//   handleDeleteMdaRead(req, res, injectedStorage?)
//
// Lesson #34: handler aceita injectedStorage como 3o arg (sem vi.mock('../storage')).
// Lesson #3: mock segue o shape REAL do storage (getStudyThemeById -> {id,userId};
//   getMdaReadById -> read + themeIds; createMdaRead -> read criado).
// =============================================================================

// Mock do storage de imagem dedicado (modulo NOVO — red phase) para nao explodir
// no import do modulo de rotas (que importa mdaImageStorage no topo).
vi.mock('../../../server/services/mdaImageStorage', () => ({
  mdaImageStorage: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), exists: vi.fn() },
  rollbackMdaImage: vi.fn(),
}));

// @ts-expect-error - handlers ainda nao existem (red phase)
import {
  handleCreateMdaRead,
  handleListMdaReadsByTheme,
  handleGetMdaRead,
  handleUpdateMdaRead,
  handleDeleteMdaRead,
} from '../../../server/routes/mda';

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: any) => { res.headers[k.toLowerCase()] = v; return res; };
  return res;
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    // temas pertencem ao user
    getStudyThemeById: vi.fn(async (id: string) => ({ id, userId: 'USER-0001' })),
    createMdaRead: vi.fn(async (input: any) => ({ id: 'read_NEW', themeIds: input.themeIds, ...input })),
    getMdaReadById: vi.fn(async () => ({
      id: 'read_1', userId: 'USER-0001', title: 'x', statId: 'vpip',
      themeIds: ['t1', 't2'],
      images: [{ id: 'img_1', key: 'USER-0001/read_1/a.png', caption: 'c' }],
    })),
    getMdaReadsByTheme: vi.fn(async () => ([
      {
        id: 'read_1', userId: 'USER-0001', title: 'x', statId: 'vpip',
        tendencyText: 'pop overfolda turn',
        images: [{ id: 'img_1', key: 'USER-0001/read_1/a.png', caption: 'c' }],
      },
    ])),
    updateMdaRead: vi.fn(async (_id: string, _u: string, patch: any) => ({ id: 'read_1', ...patch })),
    softDeleteMdaRead: vi.fn(async () => ({ keys: ['USER-0001/read_1/a.png'] })),
    ...overrides,
  };
}

const validBody = {
  title: 'BTN vs BB SRP — pop overfolda turn',
  spotContext: 'BTN abre, BB defende',
  filters: 'SRP, flop 2-tone',
  tendencyText: 'Sobre-bluff barrel.',
  statId: 'vpip',
  themeIds: ['t1', 't2'],
};

beforeEach(() => { vi.clearAllMocks(); });

// =============================================================================
// POST /api/mda-reads
// =============================================================================

describe('MDA-1 POST /api/mda-reads — create', () => {
  it('201/200 com payload valido -> createMdaRead chamado, retorna read com id', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ body: validBody }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(storage.createMdaRead).toHaveBeenCalledTimes(1);
    expect(res.body.id).toBe('read_NEW');
  });

  it('400 quando themeIds:[] (Zod min 1)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ body: { ...validBody, themeIds: [] } }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createMdaRead).not.toHaveBeenCalled();
  });

  it('400 quando title ausente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    const { title, ...noTitle } = validBody;
    await handleCreateMdaRead(makeReq({ body: noTitle }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createMdaRead).not.toHaveBeenCalled();
  });

  it('400/403 quando algum themeId nao pertence ao user (ownership)', async () => {
    const storage = makeStorage({
      // t2 nao pertence ao user
      getStudyThemeById: vi.fn(async (id: string) =>
        id === 't2' ? { id, userId: 'USER-9999' } : { id, userId: 'USER-0001' }),
    });
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ body: validBody }), res, storage);
    expect([400, 403]).toContain(res.statusCode);
    expect(storage.createMdaRead).not.toHaveBeenCalled();
  });

  it('400 INVALID_STAT_ID quando statId nao eh catalog nem custom_*', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ body: { ...validBody, statId: 'nope_invalid_xyz' } }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createMdaRead).not.toHaveBeenCalled();
  });

  it('201 aceita statId custom_* (validado por shape)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ body: { ...validBody, statId: 'custom_meu_stat-1' } }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
  });

  it('400 quando 21 themeIds (cap 20)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(
      makeReq({ body: { ...validBody, themeIds: Array.from({ length: 21 }, (_v, i) => `t${i}`) } }),
      res, storage,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.createMdaRead).not.toHaveBeenCalled();
  });

  it('401 sem usuario autenticado', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateMdaRead(makeReq({ user: undefined, body: validBody }), res, storage);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// GET /api/mda-reads/by-theme?themeId=
// =============================================================================

describe('MDA-1 GET /api/mda-reads/by-theme', () => {
  it('200 retorna reads do tema com URLs de imagem (NAO keys cruas)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListMdaReadsByTheme(makeReq({ query: { themeId: 't1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const img = res.body[0].images[0];
    // Handler converte key -> URL servivel; key crua NAO vaza.
    expect(typeof img.url === 'string' || typeof img.imageUrl === 'string').toBe(true);
    expect(img.key ?? undefined).toBeUndefined();
  });

  it('400 quando themeId ausente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListMdaReadsByTheme(makeReq({ query: {} }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.getMdaReadsByTheme).not.toHaveBeenCalled();
  });

  it('404 quando o tema eh de outro user (NAO vaza existencia)', async () => {
    const storage = makeStorage({
      getStudyThemeById: vi.fn(async () => ({ id: 't1', userId: 'USER-9999' })),
    });
    const res = makeRes();
    await handleListMdaReadsByTheme(makeReq({ query: { themeId: 't1' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
    expect(storage.getMdaReadsByTheme).not.toHaveBeenCalled();
  });
});

// =============================================================================
// GET /api/mda-reads/:id
// =============================================================================

describe('MDA-1 GET /api/mda-reads/:id', () => {
  it('200 retorna o read + themeIds + URLs de imagem', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleGetMdaRead(makeReq({ params: { id: 'read_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('read_1');
    expect(res.body.themeIds).toEqual(expect.arrayContaining(['t1', 't2']));
    const img = res.body.images[0];
    expect(typeof img.url === 'string' || typeof img.imageUrl === 'string').toBe(true);
    expect(img.key ?? undefined).toBeUndefined();
  });

  it('404 quando read eh de outro user / nao existe', async () => {
    const storage = makeStorage({ getMdaReadById: vi.fn(async () => null) });
    const res = makeRes();
    await handleGetMdaRead(makeReq({ params: { id: 'read_X' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
  });
});

// =============================================================================
// PATCH /api/mda-reads/:id
// =============================================================================

describe('MDA-1 PATCH /api/mda-reads/:id', () => {
  it('200 re-tagueia (themeIds:[t2]) + edita campos', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUpdateMdaRead(
      makeReq({ params: { id: 'read_1' }, body: { title: 'novo', themeIds: ['t2'] } }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateMdaRead).toHaveBeenCalledTimes(1);
    const patch = storage.updateMdaRead.mock.calls[0][2];
    expect(patch.themeIds).toEqual(['t2']);
    expect(patch.title).toBe('novo');
  });

  it('400 quando body tem campo desconhecido (.strict())', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUpdateMdaRead(
      makeReq({ params: { id: 'read_1' }, body: { campoDesconhecido: 1 } }),
      res, storage,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateMdaRead).not.toHaveBeenCalled();
  });

  it('400/403 quando re-tagueia para tema de outro user', async () => {
    const storage = makeStorage({
      getStudyThemeById: vi.fn(async () => ({ id: 't9', userId: 'USER-9999' })),
    });
    const res = makeRes();
    await handleUpdateMdaRead(
      makeReq({ params: { id: 'read_1' }, body: { themeIds: ['t9'] } }),
      res, storage,
    );
    expect([400, 403]).toContain(res.statusCode);
    expect(storage.updateMdaRead).not.toHaveBeenCalled();
  });

  it('404 quando o read nao pertence ao user', async () => {
    const storage = makeStorage({
      getMdaReadById: vi.fn(async () => null),
      updateMdaRead: vi.fn(async () => null),
    });
    const res = makeRes();
    await handleUpdateMdaRead(
      makeReq({ params: { id: 'read_X' }, body: { title: 'x' } }),
      res, storage,
    );
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// DELETE /api/mda-reads/:id
// =============================================================================

describe('MDA-1 DELETE /api/mda-reads/:id — soft delete', () => {
  it('200 soft delete chama softDeleteMdaRead', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleDeleteMdaRead(makeReq({ params: { id: 'read_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.softDeleteMdaRead).toHaveBeenCalledWith('read_1', 'USER-0001');
  });

  it('404 quando o read nao pertence ao user', async () => {
    const storage = makeStorage({
      getMdaReadById: vi.fn(async () => null),
      softDeleteMdaRead: vi.fn(async () => null),
    });
    const res = makeRes();
    await handleDeleteMdaRead(makeReq({ params: { id: 'read_X' } }), res, storage);
    expect(res.statusCode).toBe(404);
  });
});
