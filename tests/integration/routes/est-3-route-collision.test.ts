import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Guard de colisao de rota — Sprint EST-3 (reviewer HIGH-2 + sibling collision)
//
// A convencao do projeto testa handlers direto (sem montar Express), o que
// torna INVISIVEL o shadowing cross-modulo: o legado `GET /api/study-sessions/:id`
// (studies.ts) eh registrado ANTES de registerStudySessionsRoutes (routes/index.ts),
// entao qualquer rota EST-3 de 1 segmento sob /api/study-sessions/* casaria com
// `:id` e nunca alcancaria o handler v2 (=> 404). Isso quebrou duas vezes:
//   1) GET /api/study-sessions/:id (detalhe v2)  -> movido p/ /:id/detail
//   2) GET /api/study-sessions/stat-analysis      -> movido p/ /stat-analysis/by-theme
//
// Este teste MONTA o app com um stub do `:id` legado registrado ANTES e prova
// que as rotas EST-3 alcancam seus handlers (nao o legado). Pega a classe toda.
// =============================================================================

vi.mock('../../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001' };
    next();
  },
}));

vi.mock('../../../server/services/statAnalysisImageStorage', () => ({
  statImageStorage: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), exists: vi.fn() },
  rollbackStatImage: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getStudyThemeById: vi.fn(async () => ({ id: 'theme_1', userId: 'USER-0001' })),
    getStatAnalysisEntries: vi.fn(async () => [{ statId: 'vpip', entryCount: 0, sessions: [] }]),
    getStudySessionV2ById: vi.fn(async () => ({ id: 'sess_1', userId: 'USER-0001', mode: 'stat_analysis', statAnalysisEntries: [] })),
    createStudySessionV2: vi.fn(async (row: any) => ({ id: 'sess_new', ...row })),
    updateStudySessionV2: vi.fn(async () => ({ id: 'sess_1', notes: 'x' })),
  },
}));

// bumpStudyStreak roda dentro de try/catch no handler; stuba pra nao tocar DB.
vi.mock('../../../server/services/studyStreak', () => ({
  bumpStudyStreak: vi.fn(async () => undefined),
  getStudyHabit: vi.fn(async () => ({})),
}));

async function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub do legado: GET /api/study-sessions/:id registrado ANTES (ordem real do
  // routes/index.ts onde registerStudiesRoutes roda antes de registerStudySessionsRoutes).
  app.get('/api/study-sessions/:id', (req, res) => {
    res.status(200).json({ __handler: 'legacy', id: req.params.id });
  });
  const { registerStudySessionsRoutes } = await import('../../../server/routes/study-sessions');
  registerStudySessionsRoutes(app);
  return app;
}

describe('EST-3 — rotas v2 nao sao shadowadas pelo GET /:id legado', () => {
  let app: express.Express;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('GET /api/study-sessions/stat-analysis/by-theme alcanca o handler v2 (nao o legado :id)', async () => {
    const res = await request(app).get('/api/study-sessions/stat-analysis/by-theme?themeId=theme_1');
    expect(res.status).toBe(200);
    // Se tivesse caido no legado, o body teria __handler:'legacy'.
    expect(res.body?.__handler).not.toBe('legacy');
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/study-sessions/:id/detail alcanca o handler v2 (nao o legado :id)', async () => {
    const res = await request(app).get('/api/study-sessions/sess_1/detail');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('legacy');
    expect(res.body?.id).toBe('sess_1');
  });

  it('GET /api/study-sessions/:id (1 segmento) AINDA cai no legado — back-compat preservado', async () => {
    const res = await request(app).get('/api/study-sessions/anything');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).toBe('legacy');
  });

  // EST-3 estendeu create/patch p/ aceitar injectedStorage (3o arg). Sem wrapper
  // na rota, o `next` do Express vaza como injectedStorage e o handler 500a
  // (store=next, store.X is not a function). Guard pra esse next-leak.
  it('POST /api/study-sessions alcanca o storage (sem next-leak no injectedStorage)', async () => {
    const res = await request(app)
      .post('/api/study-sessions')
      .send({ mode: 'other', source: 'manual_post_hoc', durationMinutes: 30, themeId: 'theme_1' });
    expect(res.status).toBe(201);
    expect(res.body?.id).toBe('sess_new');
  });

  it('PATCH /api/study-sessions/:id alcanca o storage (sem next-leak no injectedStorage)', async () => {
    const res = await request(app)
      .patch('/api/study-sessions/sess_1')
      .send({ notes: 'x' });
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('sess_1');
  });
});
