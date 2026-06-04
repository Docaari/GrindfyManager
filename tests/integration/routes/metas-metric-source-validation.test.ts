import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// ADR-241 — validacao das metricas de resultado + fonte selecionavel.
//   - profit/roi/itm/abi como MEDIDA -> lead_not_controllable (so WIG).
//   - <metrica>@grind nao-capaz (roi/abi/itm) -> lead_no_data_source / wig_no_data_source.
//   - profit@grind como WIG -> 201.
// =============================================================================

const h = vi.hoisted(() => ({ getReportTier: vi.fn() }));
vi.mock('../../../server/coach/reportEligibility', () => ({ getReportTier: h.getReportTier }));

const storageMock: any = {
  getUserByPlatformId: vi.fn(async () => ({ id: 'USER-0001', userPlatformId: 'USER-0001', subscriptionPlan: 'trial' })),
  countActiveWigs: vi.fn(async () => 0),
  countActiveMeasures: vi.fn(async () => 0),
  createWig: vi.fn(async (uid: string, input: any) => ({ careerGoalId: 'cg_1', userId: uid, ...input })),
  createGoal: vi.fn(async (input: any) => ({ id: 'g_1', status: 'active', goalKind: 'measure', ...input })),
};
vi.mock('../../../server/storage', () => ({ storage: storageMock }));

function makeReq(plan = 'trial') {
  return (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001', subscriptionPlan: plan };
    next();
  };
}
async function buildApp() {
  const { registerGoalsRoutes } = await import('../../../server/routes/goals');
  const app = express();
  app.use(express.json());
  registerGoalsRoutes(app, makeReq());
  return app;
}

const baseMeasure = {
  kind: 'measure',
  goalType: 'process',
  category: 'volume_grind',
  title: 'x',
  targetValue: 10,
  unit: 'sessions',
  cadence: 'weekly',
  horizon: 'week',
};
const baseWig = {
  kind: 'wig',
  goalType: 'performance',
  category: 'financial_brm',
  title: 'De X para Y',
  targetValue: 33,
  baselineValue: 22,
  unit: 'usd',
  horizon: 'quarter',
  targetDeadline: '2026-12-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  storageMock.countActiveWigs.mockResolvedValue(0);
  storageMock.countActiveMeasures.mockResolvedValue(0);
});

describe('metricas de resultado como MEDIDA sao recusadas (so WIG)', () => {
  for (const sm of ['profit', 'roi_pct', 'itm_pct', 'abi', 'profit@grind']) {
    it(`${sm} -> 422 lead_not_controllable`, async () => {
      const app = await buildApp();
      const res = await request(app).post('/api/goals').send({ ...baseMeasure, sourceMetric: sm });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('lead_not_controllable');
      expect(storageMock.createGoal).not.toHaveBeenCalled();
    });
  }

  it('volume@grind como MEDIDA e aceito (controlavel) -> 201', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/goals').send({ ...baseMeasure, sourceMetric: 'volume@grind' });
    expect(res.status).toBe(201);
    expect(storageMock.createGoal).toHaveBeenCalledTimes(1);
  });
});

describe('fonte @grind so vale para profit/volume', () => {
  it('roi_pct@grind como WIG -> 422 wig_no_data_source', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/goals').send({ ...baseWig, sourceMetric: 'roi_pct@grind' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('wig_no_data_source');
  });

  it('profit@grind como WIG -> 201', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/goals').send({ ...baseWig, sourceMetric: 'profit@grind' });
    expect(res.status).toBe(201);
    expect(storageMock.createWig).toHaveBeenCalledTimes(1);
    // sourceMetric encodado chega ao storage tal qual.
    expect(storageMock.createWig.mock.calls[0][1].sourceMetric).toBe('profit@grind');
  });
});
