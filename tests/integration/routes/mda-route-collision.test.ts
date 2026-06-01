import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Guard de colisao de rota — Sprint MDA-1 (espelha est-3-route-collision)
//
// A convencao do projeto testa handlers direto (sem montar Express), o que torna
// INVISIVEL o shadowing: se o GET /api/mda-reads/:id (1 segmento) for registrado
// ANTES dos sub-paths de imagem (/:id/images/:imageId), o `:id` casaria com
// `images` e o handler de serve nunca seria alcancado (=> resposta errada).
//
// Este teste MONTA o app com registerMdaRoutes + um stub legado do `:id`
// registrado ANTES (simula a pior ordem) e prova que:
//   1) os sub-paths de imagem alcancam seus handlers dedicados (nao o :id);
//   2) NAO ha next-leak no injectedStorage (lesson #34) — POST/PATCH/DELETE
//      alcancam o storage sem o `next` do Express vazar como 3o arg.
// Pega a classe toda de erro, como o guard do EST-3.
// =============================================================================

vi.mock('../../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001' };
    next();
  },
}));

// Storage de imagem dedicado (modulo NOVO — red phase).
vi.mock('../../../server/services/mdaImageStorage', () => ({
  mdaImageStorage: {
    put: vi.fn(async () => ({ key: 'USER-0001/read_1/new.png', size: 16 })),
    get: vi.fn(async () => ({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' })),
    delete: vi.fn(async () => true),
    exists: vi.fn(),
  },
  rollbackMdaImage: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getStudyThemeById: vi.fn(async (id: string) => ({ id, userId: 'USER-0001' })),
    createMdaRead: vi.fn(async (input: any) => ({ id: 'read_NEW', ...input })),
    getMdaReadById: vi.fn(async () => ({
      id: 'read_1', userId: 'USER-0001', title: 'x', themeIds: ['t1'],
      images: [{ id: 'img_1', key: 'USER-0001/read_1/a.png', caption: 'c' }],
    })),
    getMdaReadsByTheme: vi.fn(async () => []),
    updateMdaRead: vi.fn(async (_id: string, _u: string, patch: any) => ({ id: 'read_1', ...patch })),
    softDeleteMdaRead: vi.fn(async () => ({ keys: [] })),
    getMdaReadImageKey: vi.fn(async () => 'USER-0001/read_1/img.png'),
    removeMdaReadImage: vi.fn(async () => ({ oldKey: 'USER-0001/read_1/a.png' })),
  },
}));

async function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub do "legado": GET /api/mda-reads/:id registrado ANTES (pior ordem). Se a
  // rota de imagem nao for um sub-path dedicado registrado antes, cairia aqui.
  app.get('/api/mda-reads/:id', (req, res) => {
    res.status(200).json({ __handler: 'legacy', id: req.params.id });
  });
  const { registerMdaRoutes } = await import('../../../server/routes/mda');
  registerMdaRoutes(app);
  return app;
}

// App SEM o stub legado externo. O namespace /api/mda-reads eh NOVO (nao existe
// nenhuma rota legada /api/mda-reads/:id, diferente de /api/study-sessions/:id no
// EST-3). Logo, o guard de by-theme (1 segmento) NAO eh sobre um legado externo —
// eh sobre a ordenacao INTERNA de registerMdaRoutes: `by-theme` deve ser
// registrado ANTES do `:id` generico, senao o proprio GET /:id do modulo o
// shadowa. Este app prova exatamente isso.
async function buildAppNoLegacy() {
  const app = express();
  app.use(express.json());
  const { registerMdaRoutes } = await import('../../../server/routes/mda');
  registerMdaRoutes(app);
  return app;
}

describe('MDA-1 — sub-paths de imagem nao sao shadowados pelo GET /:id', () => {
  let app: express.Express;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('GET /api/mda-reads/:id/images/:imageId alcanca o handler de serve (nao o :id legado)', async () => {
    const res = await request(app).get('/api/mda-reads/read_1/images/img_1');
    expect(res.status).toBe(200);
    // Se tivesse caido no legado, o body teria __handler:'legacy'.
    expect(res.body?.__handler).not.toBe('legacy');
  });

  // by-theme (1 segmento) NAO pode ser testado contra o stub legado externo: o
  // `:id` legado (registrado antes) SEMPRE intercepta um path de 1 segmento, o que
  // tornaria a premissa impossivel. O namespace /api/mda-reads e NOVO — nao ha
  // legado real. O guard de valor para by-theme e a ordenacao INTERNA do modulo:
  // `by-theme` registrado ANTES do `:id` generico de registerMdaRoutes. Montamos
  // um app SEM stub legado e provamos que by-theme alcanca seu handler dedicado
  // (array), e nao o GET /:id interno (que retornaria um read unico, nao array).
  it('GET /api/mda-reads/by-theme alcanca o handler by-theme (ordem interna antes do :id)', async () => {
    const appNoLegacy = await buildAppNoLegacy();
    const res = await request(appNoLegacy).get('/api/mda-reads/by-theme?themeId=t1');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('legacy');
    // by-theme retorna ARRAY; o GET /:id interno retornaria 1 read (objeto), entao
    // um array prova que `by-theme` nao foi shadowado pelo `:id` (param id='by-theme').
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/mda-reads/:id (1 segmento) cai no stub legado — back-compat preservado', async () => {
    const res = await request(app).get('/api/mda-reads/anything');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).toBe('legacy');
  });

  // Sem wrapper (req,res)=>handler(req,res), o `next` do Express vaza como o 3o
  // arg injectedStorage e o handler 500a (store=next, store.X is not a function).
  it('POST /api/mda-reads alcanca o storage (sem next-leak no injectedStorage)', async () => {
    const res = await request(app)
      .post('/api/mda-reads')
      .send({ title: 'x', themeIds: ['t1'] });
    expect([200, 201]).toContain(res.status);
    expect(res.body?.id).toBe('read_NEW');
  });

  it('PATCH /api/mda-reads/:id alcanca o storage (sem next-leak no injectedStorage)', async () => {
    const res = await request(app)
      .patch('/api/mda-reads/read_1')
      .send({ title: 'novo' });
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('read_1');
  });

  it('DELETE /api/mda-reads/:id/images/:imageId alcanca o storage (sem next-leak)', async () => {
    const res = await request(app).delete('/api/mda-reads/read_1/images/img_1');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('legacy');
  });
});
