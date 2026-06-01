import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// EST-6 / ADR-224 #2 — guard de colisao de rota (RED phase)
//
// A convencao do projeto testa handlers direto (sem montar Express), o que torna
// INVISIVEL o shadowing cross-modulo (o EST-3 sofreu disso). Este teste MONTA o
// app de verdade: registra um stub de rota /api/coach/:x ANTES de
// registerCoachPlanningRoutes e prova que:
//   - POST /api/coach/planning/start          alcanca o handler de planning
//   - GET  /api/coach/planning/2026-06-08      alcanca o handler de planning
//     (e NAO o stub /api/coach/:x nem /api/coach/reports/:id)
//   - :step invalido -> 400
//   - :weekStartDate malformado -> 400
//   - sem next-leak no injectedStorage (3o arg do handler — lesson #34)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/routes/coachPlanning.ts -> registerCoachPlanningRoutes(app, requireAuth)
//
// O orquestrador eh mockado por path (este teste cobre ROTEAMENTO, nao logica).
// =============================================================================

const ORCH = {
  startPlanning: vi.fn(),
  getPlanningSession: vi.fn(),
  proposeStep: vi.fn(),
  confirmStep: vi.fn(),
  skipStep: vi.fn(),
};

vi.mock('../../../server/coach/planning/weeklyPlanningOrchestrator', () => ORCH);

function fakeSession(weekStartDate: string) {
  return {
    id: 'wps_1',
    userId: 'USER-0001',
    weekStartDate,
    status: 'in_progress',
    source: 'coach_manual',
    steps: {
      grind: { status: 'pending' },
      study: { status: 'pending' },
      lessons: { status: 'pending' },
      themes: { status: 'pending' },
    },
  };
}

const requireAuthStub = (req: any, _res: any, next: any) => {
  req.user = { userPlatformId: 'USER-0001' };
  next();
};

async function buildApp() {
  const app = express();
  app.use(express.json());

  // Stub do "legado": rota generica /api/coach/:x e /api/coach/reports/:id
  // registradas ANTES, como prova de que planning NAO eh shadowado.
  app.get('/api/coach/reports/:id', (req, res) => {
    res.status(200).json({ __handler: 'reports', id: req.params.id });
  });
  app.get('/api/coach/:x', (req, res) => {
    res.status(200).json({ __handler: 'coach_catchall', x: req.params.x });
  });

  const { registerCoachPlanningRoutes } = await import(
    '../../../server/routes/coachPlanning'
  );
  registerCoachPlanningRoutes(app, requireAuthStub);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  ORCH.startPlanning.mockResolvedValue({ session: fakeSession('2026-06-08') });
  ORCH.getPlanningSession.mockResolvedValue(fakeSession('2026-06-08'));
  ORCH.proposeStep.mockResolvedValue({ preview: { proposed: [] }, step: 'grind', status: 'proposed' });
  ORCH.confirmStep.mockResolvedValue({ session: fakeSession('2026-06-08'), stepResult: {} });
  ORCH.skipStep.mockResolvedValue({ session: fakeSession('2026-06-08') });
});

describe('EST-6 — rotas planning nao sao shadowadas', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = await buildApp();
  });

  it('POST /api/coach/planning/start alcanca o handler de planning (nao o catch-all)', async () => {
    const res = await request(app).post('/api/coach/planning/start').send({});
    expect(res.status).toBe(200);
    expect(res.body?.__handler).toBeUndefined(); // nao caiu em stub
    expect(res.body?.session).toBeDefined();
    expect(res.body.session.steps.grind.status).toBe('pending');
  });

  it('GET /api/coach/planning/2026-06-08 alcanca o handler de planning (nao reports/:id nem catch-all)', async () => {
    const res = await request(app).get('/api/coach/planning/2026-06-08');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('reports');
    expect(res.body?.__handler).not.toBe('coach_catchall');
    expect(res.body?.session?.weekStartDate).toBe('2026-06-08');
  });

  it('GET /api/coach/planning/:weekStartDate 404 quando a sessao nao existe', async () => {
    ORCH.getPlanningSession.mockResolvedValue(null);
    const res = await request(app).get('/api/coach/planning/2026-06-08');
    expect(res.status).toBe(404);
  });

  it('GET com :weekStartDate malformado -> 400 (nao chama o orquestrador)', async () => {
    const res = await request(app).get('/api/coach/planning/08-06-2026');
    expect(res.status).toBe(400);
    expect(ORCH.getPlanningSession).not.toHaveBeenCalled();
  });

  it('POST .../step/grind/propose -> 200 status proposed', async () => {
    const res = await request(app)
      .post('/api/coach/planning/2026-06-08/step/grind/propose')
      .send({ profile: 'A' });
    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('proposed');
    expect(ORCH.proposeStep).toHaveBeenCalled();
  });

  it('POST .../step/INVALIDO/propose -> 400 (step fora do enum)', async () => {
    const res = await request(app)
      .post('/api/coach/planning/2026-06-08/step/warmup/propose')
      .send({});
    expect(res.status).toBe(400);
    expect(ORCH.proposeStep).not.toHaveBeenCalled();
  });

  it('POST .../step/grind/confirm -> 200 retorna session', async () => {
    const res = await request(app)
      .post('/api/coach/planning/2026-06-08/step/grind/confirm')
      .send({ profile: 'A' });
    expect(res.status).toBe(200);
    expect(res.body?.session).toBeDefined();
    expect(ORCH.confirmStep).toHaveBeenCalled();
  });

  it('POST .../step/INVALIDO/confirm -> 400', async () => {
    const res = await request(app)
      .post('/api/coach/planning/2026-06-08/step/foo/confirm')
      .send({});
    expect(res.status).toBe(400);
    expect(ORCH.confirmStep).not.toHaveBeenCalled();
  });

  it('POST .../step/study/skip -> 200 (passo skipped)', async () => {
    ORCH.skipStep.mockResolvedValue({
      session: {
        ...fakeSession('2026-06-08'),
        steps: { ...fakeSession('2026-06-08').steps, study: { status: 'skipped' } },
      },
    });
    const res = await request(app)
      .post('/api/coach/planning/2026-06-08/step/study/skip')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body?.session?.steps?.study?.status).toBe('skipped');
  });

  it('POST /api/coach/planning/start chama o orquestrador SEM vazar next como injectedStorage (lesson #34)', async () => {
    await request(app).post('/api/coach/planning/start').send({ weekStartDate: '2026-06-08' });
    // startPlanning(userId, weekStartDate, opts). opts.injectedStorage NAO pode ser
    // a funcao next do Express. Default: undefined (prod usa storage real).
    const call = ORCH.startPlanning.mock.calls[0];
    const opts = call[2] ?? {};
    expect(typeof opts.injectedStorage).not.toBe('function');
  });
});

describe('EST-6 — gate de tier no start (free -> 403)', () => {
  it('startPlanning que rejeita por tier free retorna 403 sem 500', async () => {
    const app = await buildApp();
    const err: any = new Error('tier_not_eligible');
    err.code = 'tier_not_eligible';
    ORCH.startPlanning.mockRejectedValueOnce(err);
    const res = await request(app).post('/api/coach/planning/start').send({});
    expect(res.status).toBe(403);
  });
});
