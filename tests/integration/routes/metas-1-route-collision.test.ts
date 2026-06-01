import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229 DEC-A8) — guard de colisao de rota (RED phase)
//
// A convencao do projeto testa handlers direto (sem montar Express), o que torna
// INVISIVEL o shadowing (EST-3/EST-6 sofreram disso). Este teste MONTA o app de
// verdade: registra stubs /api/goals/:id ANTES de registerGoalsRoutes e prova que
// as rotas ESTATICAS nao sao shadowadas pela paramentrica /:id.
//
// Ordem EXATA DEC-A8 (rotas estaticas/sub-paths ANTES de /:id puro):
//   1. GET    /api/goals/scoreboard
//   2. POST   /api/goals/templates/:profile/apply   (prevista; nao construida — METAS-1.1)
//   3. POST   /api/goals/:id/link-measure
//   4. GET    /api/goals/:id/snapshots
//   5. GET    /api/goals
//   6. POST   /api/goals
//   7. GET    /api/goals/:id
//   8. PATCH  /api/goals/:id
//   9. DELETE /api/goals/:id
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/routes/goals.ts -> registerGoalsRoutes(app, requireAuth)
//
// O storage + helpers de scoreboard sao mockados por path (este teste cobre
// ROTEAMENTO, nao logica de agregacao).
// =============================================================================

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: vi.fn(async () => 'eligible'),
}));

const SCOREBOARD = { wigs: [], measures: [], snapshotsWeek: '2026-06-01' };

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserByPlatformId: vi.fn(async () => ({ id: 'USER-0001', userPlatformId: 'USER-0001', subscriptionPlan: 'trial' })),
    listActiveWigs: vi.fn(async () => []),
    listGoals: vi.fn(async () => []),
    getGoal: vi.fn(async (uid: string, id: string) => ({ id, userId: uid, goalKind: 'measure' })),
    getSnapshotsForGoal: vi.fn(async () => []),
    upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
    getLatestSnapshotsForUser: vi.fn(async () => []),
    linkMeasure: vi.fn(async () => ({ id: 'lnk_1' })),
  },
}));

const requireAuthStub = (req: any, _res: any, next: any) => {
  req.user = { userPlatformId: 'USER-0001', subscriptionPlan: 'trial' };
  next();
};

async function buildApp() {
  const app = express();
  app.use(express.json());

  // Stubs do "paramentrico" registrados ANTES, como prova de que as estaticas
  // NAO sao shadowadas (se registerGoalsRoutes registrar na ordem certa, as
  // estaticas vencem porque sao registradas antes pelo proprio modulo).
  // Aqui montamos o modulo real; o teste confirma que /scoreboard nao cai num :id.
  const { registerGoalsRoutes } = await import('../../../server/routes/goals');
  registerGoalsRoutes(app, requireAuthStub);

  // catch-all que prova que NENHUMA rota caiu fora do modulo.
  app.use('/api/goals', (req, res) => {
    res.status(599).json({ __handler: 'catchall', path: req.path });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('METAS-1 — /scoreboard nao e shadowado por /:id', () => {
  it('GET /api/goals/scoreboard responde sem cair no handler de /:id', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/goals/scoreboard');
    // Se /scoreboard tivesse sido tratado como :id="scoreboard", o handler de
    // detalhe tentaria getGoal('USER-0001','scoreboard') e retornaria uma meta.
    // O placar retorna wigs/measures (shape distinto).
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wigs');
    expect(res.body).toHaveProperty('measures');
  });

  it('GET /api/goals/:id/snapshots alcanca o sub-path (nao o /:id puro)', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/goals/g1/snapshots');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body?.snapshots)).toBe(true);
  });

  it('POST /api/goals/:id/link-measure alcanca o sub-path (nao o /:id puro)', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/goals/cg_1/link-measure')
      .send({ measureId: 'g1' });
    // 200 idempotente (DEC-menor-2). Nunca 404/599 (catchall).
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('catchall');
  });

  it('GET /api/goals/:id (1 segmento real) ainda casa o handler de detalhe', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/goals/g1');
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe('g1');
  });
});
