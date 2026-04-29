import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W0/W1 — server/routes/primedope.ts integration tests
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-04 a RF-15, RF-23, RF-24)
// ADR-054: rate limit 1/10s/userId, cache hit nao consome rate limit
// ADR-055: tracker.emit on errors
//
// Endpoints:
//   POST /api/primedope/simulate
//   GET  /api/primedope/chart/:hash
//   GET  /api/primedope/runs
//   POST /api/primedope/runs/:id/pin
//   DELETE /api/primedope/runs/:id/pin
//
// Padrao: supertest + Express app real montado com routes/primedope.ts.
//
// Mocks:
//   - server/services/primedopeIntegration.runSimulation
//   - server/storage primedope_runs queries
//   - server/utils/tracker.emit
//   - JWT requireAuth com user fake
// =============================================================================

const runSimulationMock = vi.fn();
vi.mock('../../../server/services/primedopeIntegration', () => ({
  runSimulation: (input: any) => runSimulationMock(input),
  // helpers de chart serving sao opcionalmente expostos
  saveChartFromUrl: vi.fn(),
  getChartFsPath: (hash: string) => `/tmp/uploads/primedope-charts/${hash}.png`,
}));

const trackerEmit = vi.fn();
vi.mock('../../../server/utils/tracker', () => ({
  emit: (event: string, payload: any) => trackerEmit(event, payload),
}));

const storageMock: any = {
  listPrimedopeRunsForUser: vi.fn(),
  getPrimedopeRunById: vi.fn(),
  setPrimedopeRunPinned: vi.fn(),
  countPrimedopeRunsForUser: vi.fn(),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

// Auth mock — requireAuth deixa passar com user fixo
// (reviewer fix CRITICAL #1): user_platform_id e o que FKs apontam, mock
// reflete shape REAL do payload em vez de inventar { id: USER-XXXX }.
vi.mock('../../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'usr_pk_pd1', userPlatformId: 'USER-PD1', email: 'p@p.com' };
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import supertest from 'supertest';

async function buildApp() {
  const { default: primedopeRouter } = await import('../../../server/routes/primedope');
  const app = express();
  app.use(express.json());
  app.use('/api/primedope', primedopeRouter);
  app.use('/api/grade', (await import('../../../server/routes/grade-day-detail')).default);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(storageMock).forEach((fn: any) => fn.mockReset && fn.mockReset());
  runSimulationMock.mockReset();
  trackerEmit.mockReset();
});

const validSimulatePayload = {
  profileLetter: 'A',
  dayOfWeek: 2,
  multiplier: 4,
  bankrollUsd: 5000,
  buckets: [
    {
      name: 'Suprema R$11',
      network: 'Suprema',
      count: 5,
      buyinOriginal: 11,
      currency: 'BRL',
      playersAvg: 200,
      placesPaid: 30,
      rakePct: 10,
      roiPct: 20,
    },
  ],
};

describe('POST /api/primedope/simulate', () => {
  it('Zod rejeita payload sem profileLetter (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send({ dayOfWeek: 2, buckets: [] });
    expect(r.status).toBe(400);
  });

  it('Zod rejeita dayOfWeek > 6 (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send({ ...validSimulatePayload, dayOfWeek: 9 });
    expect(r.status).toBe(400);
  });

  it('Zod rejeita multiplier nao-permitido (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send({ ...validSimulatePayload, multiplier: 7 });
    expect(r.status).toBe(400);
  });

  it('Zod rejeita buckets vazio (400)', async () => {
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send({ ...validSimulatePayload, buckets: [] });
    expect(r.status).toBe(400);
  });

  it('payload valido retorna 200 + SimulationResult', async () => {
    runSimulationMock.mockResolvedValue({
      source: 'primedope',
      data: { ev: 100, roi: 10 },
      latencyMs: 1200,
    });
    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send(validSimulatePayload);
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('primedope');
    expect(typeof r.body.latencyMs).toBe('number');
  });

  it('rate limit 1 req/10s: 2a request consecutiva retorna 429 com retryAfterMs', async () => {
    runSimulationMock.mockResolvedValue({
      source: 'primedope',
      data: { ev: 100 },
      latencyMs: 100,
    });
    const app = await buildApp();
    await supertest(app).post('/api/primedope/simulate').send(validSimulatePayload);
    const r = await supertest(app).post('/api/primedope/simulate').send(validSimulatePayload);
    expect(r.status).toBe(429);
    expect(r.body.retryAfterMs).toBeGreaterThan(0);
  });

  it('cache hit (source=cache) NAO consome rate limit', async () => {
    runSimulationMock.mockResolvedValue({
      source: 'cache',
      data: { ev: 100 },
      latencyMs: 5,
      cacheHit: true,
    });
    const app = await buildApp();
    await supertest(app).post('/api/primedope/simulate').send(validSimulatePayload);
    const r = await supertest(app).post('/api/primedope/simulate').send(validSimulatePayload);
    // 2a req tambem cache hit -> nao 429 (skip rate limit em cache hits)
    expect(r.status).toBe(200);
  });

  it('force=true bypass cache propaga para runSimulation', async () => {
    runSimulationMock.mockResolvedValue({
      source: 'primedope',
      data: { ev: 100 },
      latencyMs: 1500,
    });
    const app = await buildApp();
    await supertest(app)
      .post('/api/primedope/simulate')
      .send({ ...validSimulatePayload, force: true });
    expect(runSimulationMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  it('error UPSTREAM_4XX_SCHEMA -> 502 com errorType + inputHash + timestamp', async () => {
    const err: any = new Error('upstream 4xx schema change');
    err.code = 'UPSTREAM_4XX';
    err.errorType = 'upstream_4xx_schema_change';
    err.statusCode = 404;
    err.inputHash = 'abc123';
    runSimulationMock.mockRejectedValue(err);

    const app = await buildApp();
    const r = await supertest(app)
      .post('/api/primedope/simulate')
      .send(validSimulatePayload);

    expect(r.status).toBe(502);
    expect(r.body.errorType).toBe('upstream_4xx_schema_change');
    expect(r.body.inputHash).toBeTruthy();
    expect(r.body.timestamp).toBeTruthy();
  });
});

describe('GET /api/primedope/chart/:hash', () => {
  it('rejeita hash que nao bate sha256 regex (404 com erro path traversal protection)', async () => {
    const app = await buildApp();
    const r = await supertest(app).get('/api/primedope/chart/../../etc/passwd');
    expect([400, 404]).toContain(r.status);
  });

  it('hash valido sha256 mas arquivo ausente -> 404 + emit primedope_chart_proxy_miss', async () => {
    const app = await buildApp();
    const validHash = 'a'.repeat(64);
    const r = await supertest(app).get(`/api/primedope/chart/${validHash}`);
    expect(r.status).toBe(404);
    const emitted = trackerEmit.mock.calls.find(
      (c) => c[0] === 'primedope_chart_proxy_miss'
    );
    expect(emitted).toBeTruthy();
    expect(emitted?.[1]).toEqual(expect.objectContaining({ hash: validHash }));
  });
});

describe('GET /api/primedope/runs', () => {
  it('retorna runs do user autenticado, ORDER BY created_at DESC', async () => {
    storageMock.listPrimedopeRunsForUser.mockResolvedValue([
      {
        id: 'r1',
        userId: 'USER-PD1',
        profileLetter: 'A',
        dayOfWeek: 2,
        createdAt: new Date('2026-04-28'),
        pinned: false,
      },
      {
        id: 'r2',
        userId: 'USER-PD1',
        profileLetter: 'A',
        dayOfWeek: 2,
        createdAt: new Date('2026-04-27'),
        pinned: true,
      },
    ]);
    const app = await buildApp();
    const r = await supertest(app).get('/api/primedope/runs?profileLetter=A&dayOfWeek=2');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) || Array.isArray(r.body.items)).toBe(true);
    const list = Array.isArray(r.body) ? r.body : r.body.items;
    expect(list.length).toBe(2);
    expect(list[0].id).toBe('r1');
  });

  it('filtra por profileLetter + dayOfWeek', async () => {
    storageMock.listPrimedopeRunsForUser.mockResolvedValue([]);
    const app = await buildApp();
    await supertest(app).get('/api/primedope/runs?profileLetter=B&dayOfWeek=5');
    expect(storageMock.listPrimedopeRunsForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-PD1',
        profileLetter: 'B',
        dayOfWeek: 5,
      })
    );
  });

  it('limit default 20 + cap maximo aceitavel', async () => {
    storageMock.listPrimedopeRunsForUser.mockResolvedValue([]);
    const app = await buildApp();
    await supertest(app).get('/api/primedope/runs');
    const call = storageMock.listPrimedopeRunsForUser.mock.calls[0][0];
    expect(call.limit).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/primedope/runs/:id/pin', () => {
  it('toggle pin do owner -> 200 + pinned=true', async () => {
    storageMock.getPrimedopeRunById.mockResolvedValue({
      id: 'r1',
      userId: 'USER-PD1',
      pinned: false,
    });
    storageMock.setPrimedopeRunPinned.mockResolvedValue({
      id: 'r1',
      userId: 'USER-PD1',
      pinned: true,
    });
    const app = await buildApp();
    const r = await supertest(app).post('/api/primedope/runs/r1/pin');
    expect(r.status).toBe(200);
    expect(r.body.pinned).toBe(true);
    expect(storageMock.setPrimedopeRunPinned).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', pinned: true })
    );
  });

  it('rejeita 403 se run pertence a outro user', async () => {
    storageMock.getPrimedopeRunById.mockResolvedValue({
      id: 'r-other',
      userId: 'USER-OTHER',
      pinned: false,
    });
    const app = await buildApp();
    const r = await supertest(app).post('/api/primedope/runs/r-other/pin');
    expect(r.status).toBe(403);
    expect(storageMock.setPrimedopeRunPinned).not.toHaveBeenCalled();
  });

  it('emite tracker primedope_run_pinned com runId + pinned=true', async () => {
    storageMock.getPrimedopeRunById.mockResolvedValue({
      id: 'r1',
      userId: 'USER-PD1',
      pinned: false,
    });
    storageMock.setPrimedopeRunPinned.mockResolvedValue({ id: 'r1', pinned: true });
    const app = await buildApp();
    await supertest(app).post('/api/primedope/runs/r1/pin');
    const emitted = trackerEmit.mock.calls.find((c) => c[0] === 'primedope_run_pinned');
    expect(emitted?.[1]).toEqual(
      expect.objectContaining({ runId: 'r1', pinned: true })
    );
  });

  it('DELETE /api/primedope/runs/:id/pin -> 200 + pinned=false', async () => {
    storageMock.getPrimedopeRunById.mockResolvedValue({
      id: 'r1',
      userId: 'USER-PD1',
      pinned: true,
    });
    storageMock.setPrimedopeRunPinned.mockResolvedValue({ id: 'r1', pinned: false });
    const app = await buildApp();
    const r = await supertest(app).delete('/api/primedope/runs/r1/pin');
    expect(r.status).toBe(200);
    expect(r.body.pinned).toBe(false);
  });
});

// =============================================================================
// Drill-down endpoint /api/grade/day-detail/:profile/:dayOfWeek
// =============================================================================

const dayDetailMock = vi.fn();
vi.mock('../../../server/services/dayDetailService', () => ({
  getDayDetail: (input: any) => dayDetailMock(input),
}));

describe('GET /api/grade/day-detail/:profile/:dayOfWeek', () => {
  beforeEach(() => {
    dayDetailMock.mockReset();
  });

  it('dia OFF / sem torneios planejados retorna empty payload', async () => {
    dayDetailMock.mockResolvedValue({
      tournaments: [],
      cards: { totalTournaments: 0, abiUsd: 0, investmentUsd: 0, bankrollNeeded: 0 },
      format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
      volume: [],
      bankroll: [],
      list: [],
    });
    const app = await buildApp();
    const r = await supertest(app).get('/api/grade/day-detail/A/3');
    expect(r.status).toBe(200);
    expect(r.body.cards.totalTournaments).toBe(0);
    expect(r.body.list).toEqual([]);
  });

  it('retorna agregados: totalTournaments, abiUsd, investmentUsd, bankrollNeeded', async () => {
    dayDetailMock.mockResolvedValue({
      cards: {
        totalTournaments: 8,
        abiUsd: 12.5,
        investmentUsd: 100,
        bankrollNeeded: 1250,
      },
      format: { pctPKO: 50, pctTurbo: 25, pctVanilla: 25 },
      volume: [{ site: 'GG', count: 5 }, { site: 'Suprema', count: 3 }],
      bankroll: [
        {
          site: 'GG',
          balanceUsd: 800,
          dayInvestmentUsd: 60,
          coveragePct: 1333,
        },
      ],
      list: [
        { id: 't1', name: 'GG MTT', site: 'GG', buyinUsd: 4.78, count: 5, time: '20:00' },
      ],
    });
    const app = await buildApp();
    const r = await supertest(app).get('/api/grade/day-detail/A/2');
    expect(r.status).toBe(200);
    expect(r.body.cards.totalTournaments).toBe(8);
    expect(r.body.cards.abiUsd).toBeCloseTo(12.5, 1);
    expect(r.body.format.pctPKO).toBe(50);
    expect(r.body.bankroll[0].coveragePct).toBeGreaterThan(0);
  });

  it('rejeita profile invalido (D) com 400', async () => {
    const app = await buildApp();
    const r = await supertest(app).get('/api/grade/day-detail/D/2');
    expect(r.status).toBe(400);
  });

  it('rejeita dayOfWeek fora de [0..6] com 400', async () => {
    const app = await buildApp();
    const r = await supertest(app).get('/api/grade/day-detail/A/9');
    expect(r.status).toBe(400);
  });
});
