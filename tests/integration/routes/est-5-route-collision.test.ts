import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// EST-5 / ADR-226 — guard de colisao de rota + endpoints (RED phase)
//
// Espelha tests/integration/routes/est-6-route-collision.test.ts. A convencao do
// projeto testa handlers direto (sem montar Express), o que torna INVISIVEL o
// shadowing cross-modulo. Este teste MONTA o app de verdade: registra um stub
// generico /api/coach/:x ANTES de registerCoachWeeklyReviewRoutes e prova que:
//   - POST /api/coach/weekly-review/start                     -> handler weekly-review
//   - GET  /api/coach/weekly-review/2026-06-08                -> handler weekly-review
//     (e NAO o stub /api/coach/:x nem /api/coach/reports/:id)
//   - POST /api/coach/weekly-review/2026-06-08/confirm-upload -> handler weekly-review
//   - :weekStartDate malformado -> 400
//   - tier free no start -> 403
//   - review inexistente -> 404
//   - confirm transicao invalida -> 409
//   - sem next-leak no injectedStorage (3o arg — lesson #34)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/routes/coachWeeklyReview.ts -> registerCoachWeeklyReviewRoutes(app, requireAuth)
//
// O orquestrador é mockado por path (este teste cobre ROTEAMENTO, nao logica).
// =============================================================================

const ORCH = {
  createWeeklyReview: vi.fn(),
  getWeeklyReview: vi.fn(),
  confirmUpload: vi.fn(),
};

vi.mock('../../../server/coach/weeklyReview/weeklyReviewOrchestrator', () => ORCH);

function fakeReview(weekStartDate: string, status = 'awaiting_upload') {
  return {
    id: 'wr_1',
    userId: 'USER-0001',
    weekStartDate,
    status,
    recapContent: { schemaVersion: 1, markdown: 'recap', hasData: true },
    analysisContent: null,
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
  // registradas ANTES — prova de que weekly-review NAO é shadowado.
  app.get('/api/coach/reports/:id', (req, res) => {
    res.status(200).json({ __handler: 'reports', id: req.params.id });
  });
  app.get('/api/coach/:x', (req, res) => {
    res.status(200).json({ __handler: 'coach_catchall', x: req.params.x });
  });

  const { registerCoachWeeklyReviewRoutes } = await import(
    '../../../server/routes/coachWeeklyReview'
  );
  registerCoachWeeklyReviewRoutes(app, requireAuthStub);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  ORCH.createWeeklyReview.mockResolvedValue({ review: fakeReview('2026-06-08') });
  ORCH.getWeeklyReview.mockResolvedValue(fakeReview('2026-06-08'));
  ORCH.confirmUpload.mockResolvedValue({
    review: fakeReview('2026-06-08', 'planning'),
    uploadDetected: false,
    source: 'explicit',
  });
});

describe('EST-5 — rotas weekly-review nao sao shadowadas', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = await buildApp();
  });

  it('POST /api/coach/weekly-review/start alcanca o handler (nao o catch-all)', async () => {
    const res = await request(app).post('/api/coach/weekly-review/start').send({});
    expect(res.status).toBe(200);
    expect(res.body?.__handler).toBeUndefined();
    expect(res.body?.review).toBeDefined();
  });

  it('GET /api/coach/weekly-review/2026-06-08 alcanca o handler (nao reports/:id nem catch-all)', async () => {
    const res = await request(app).get('/api/coach/weekly-review/2026-06-08');
    expect(res.status).toBe(200);
    expect(res.body?.__handler).not.toBe('reports');
    expect(res.body?.__handler).not.toBe('coach_catchall');
    expect(res.body?.review?.weekStartDate).toBe('2026-06-08');
  });

  it('GET inexistente -> 404 weekly_review_not_found', async () => {
    ORCH.getWeeklyReview.mockResolvedValue(null);
    const res = await request(app).get('/api/coach/weekly-review/2026-06-08');
    expect(res.status).toBe(404);
  });

  it('GET com :weekStartDate malformado -> 400 (nao chama o orquestrador)', async () => {
    const res = await request(app).get('/api/coach/weekly-review/08-06-2026');
    expect(res.status).toBe(400);
    expect(ORCH.getWeeklyReview).not.toHaveBeenCalled();
  });

  it('POST .../confirm-upload caminho feliz -> 200 { review, uploadDetected, source }', async () => {
    const res = await request(app)
      .post('/api/coach/weekly-review/2026-06-08/confirm-upload')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body?.review).toBeDefined();
    expect(['planning', 'deep_analysis_done']).toContain(res.body.review.status);
    expect(res.body).toHaveProperty('uploadDetected');
    expect(res.body).toHaveProperty('source');
    expect(ORCH.confirmUpload).toHaveBeenCalled();
  });

  it('POST .../confirm-upload com :weekStartDate malformado -> 400', async () => {
    const res = await request(app)
      .post('/api/coach/weekly-review/08-06-2026/confirm-upload')
      .send({});
    expect(res.status).toBe(400);
    expect(ORCH.confirmUpload).not.toHaveBeenCalled();
  });

  it('POST .../confirm-upload em review inexistente -> 404', async () => {
    const err: any = new Error('weekly_review_not_found');
    err.code = 'weekly_review_not_found';
    ORCH.confirmUpload.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/coach/weekly-review/2026-06-08/confirm-upload')
      .send({});
    expect(res.status).toBe(404);
  });

  it('POST .../confirm-upload com transicao invalida -> 409', async () => {
    const err: any = new Error('invalid_weekly_review_transition');
    err.code = 'invalid_weekly_review_transition';
    ORCH.confirmUpload.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/coach/weekly-review/2026-06-08/confirm-upload')
      .send({});
    expect(res.status).toBe(409);
  });

  it('POST /start chama o orquestrador SEM vazar next como injectedStorage (lesson #34)', async () => {
    await request(app).post('/api/coach/weekly-review/start').send({ weekStartDate: '2026-06-08' });
    const call = ORCH.createWeeklyReview.mock.calls[0];
    const opts = call[2] ?? {};
    expect(typeof opts.injectedStorage).not.toBe('function');
  });
});

describe('EST-5 — gate de tier no start (free -> 403)', () => {
  it('createWeeklyReview que rejeita por tier free retorna 403 sem 500', async () => {
    const app = await buildApp();
    const err: any = new Error('tier_not_eligible');
    err.code = 'tier_not_eligible';
    ORCH.createWeeklyReview.mockRejectedValueOnce(err);
    const res = await request(app).post('/api/coach/weekly-review/start').send({});
    expect(res.status).toBe(403);
  });
});
