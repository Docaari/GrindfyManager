import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// ADR-241 — relatorio diario do calendario de metas + serie planejado×executado.
// Cobre os handlers novos em server/routes/goals.ts:
//   - PUT  /api/goals/daily-logs/:date  (tier-gated, valida schema, upsert)
//   - GET  /api/goals/daily-logs/:date  (log do dia + metas ativas naquele dia)
//   - GET  /api/goals/daily-logs        (range — calendario)
//   - GET  /api/goals/:id/series        (snapshots -> [{weekStartDate,expected,executed}])
// Storage + getReportTier mockados por path (handler/validacao, nao storage real).
// =============================================================================

const h = vi.hoisted(() => ({ getReportTier: vi.fn() }));
vi.mock('../../../server/coach/reportEligibility', () => ({ getReportTier: h.getReportTier }));

const storageMock: any = {
  getUserByPlatformId: vi.fn(async () => ({ id: 'USER-0001', userPlatformId: 'USER-0001', subscriptionPlan: 'trial' })),
  upsertGoalDailyLog: vi.fn(async (uid: string, date: string, payload: any) => ({ id: 'log_1', userId: uid, logDate: date, ...payload })),
  getGoalDailyLog: vi.fn(async () => null),
  listGoalDailyLogsInRange: vi.fn(async () => [{ id: 'log_1', logDate: '2026-06-10', note: 'oi' }]),
  listGoals: vi.fn(async () => []),
  listActiveWigs: vi.fn(async () => []),
  getSnapshotsForGoal: vi.fn(async () => []),
};
vi.mock('../../../server/storage', () => ({ storage: storageMock }));

function makeReq(plan = 'trial') {
  return (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001', subscriptionPlan: plan };
    next();
  };
}

async function buildApp(plan = 'trial') {
  const { registerGoalsRoutes } = await import('../../../server/routes/goals');
  const app = express();
  app.use(express.json());
  registerGoalsRoutes(app, makeReq(plan));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  storageMock.getGoalDailyLog.mockResolvedValue(null);
  storageMock.listGoals.mockResolvedValue([]);
  storageMock.listActiveWigs.mockResolvedValue([]);
  storageMock.getSnapshotsForGoal.mockResolvedValue([]);
});

describe('PUT /api/goals/daily-logs/:date', () => {
  it('free tier -> 403', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('expired');
    const res = await request(app).put('/api/goals/daily-logs/2026-06-10').send({ note: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('tier_not_eligible');
  });

  it('data invalida -> 400 invalid_date', async () => {
    const app = await buildApp();
    const res = await request(app).put('/api/goals/daily-logs/06-2026-10').send({ note: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_date');
  });

  it('body invalido (chave extra .strict) -> 400 invalid_daily_log', async () => {
    const app = await buildApp();
    const res = await request(app).put('/api/goals/daily-logs/2026-06-10').send({ pnl: 999 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_daily_log');
  });

  it('valido (trial) -> 200 + upsert chamado com a data da URL', async () => {
    const app = await buildApp();
    const res = await request(app)
      .put('/api/goals/daily-logs/2026-06-10')
      .send({ note: 'foco bom', tournamentsPlayed: 12, studyHours: 1.5, measuresExercised: [{ measureId: 'g_1' }] });
    expect(res.status).toBe(200);
    expect(storageMock.upsertGoalDailyLog).toHaveBeenCalledTimes(1);
    const [uid, date, payload] = storageMock.upsertGoalDailyLog.mock.calls[0];
    expect(uid).toBe('USER-0001');
    expect(date).toBe('2026-06-10');
    expect(payload.tournamentsPlayed).toBe(12);
    expect(payload.measuresExercised).toEqual([{ measureId: 'g_1' }]);
  });
});

describe('GET /api/goals/daily-logs (range)', () => {
  it('range invalido -> 400', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/goals/daily-logs?from=xx&to=2026-06-30');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_range');
  });

  it('range valido -> 200 logs', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/goals/daily-logs?from=2026-06-01&to=2026-06-30');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(storageMock.listGoalDailyLogsInRange).toHaveBeenCalledWith('USER-0001', '2026-06-01', '2026-06-30');
  });
});

describe('GET /api/goals/daily-logs/:date', () => {
  it('retorna log + metas ATIVAS no dia (filtra por janela start/deadline)', async () => {
    storageMock.listGoals.mockResolvedValue([
      { id: 'in', title: 'dentro', cadence: 'daily', startDate: '2026-06-01', deadline: '2026-07-01', targetValue: 5 },
      { id: 'out', title: 'fora', cadence: 'daily', startDate: '2026-07-01', deadline: '2026-08-01', targetValue: 5 },
    ]);
    const app = await buildApp();
    const res = await request(app).get('/api/goals/daily-logs/2026-06-15');
    expect(res.status).toBe(200);
    const ids = res.body.activeGoals.map((g: any) => g.id);
    expect(ids).toContain('in');
    expect(ids).not.toContain('out');
  });
});

describe('GET /api/goals/consistency', () => {
  it('200 com shape de consistencia (streak + dias preenchidos)', async () => {
    storageMock.listGoalDailyLogsInRange.mockResolvedValue([
      { logDate: '2026-06-10', note: 'x' },
      { logDate: '2026-06-11', tournamentsPlayed: 3 },
    ]);
    const app = await buildApp();
    const res = await request(app).get('/api/goals/consistency');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentStreak');
    expect(res.body).toHaveProperty('daysFilledThisWeek');
    expect(res.body).toHaveProperty('daysFilledThisMonth');
    expect(typeof res.body.currentStreak).toBe('number');
  });

  it('log vazio (sem conteudo) NAO conta como preenchido', async () => {
    storageMock.listGoalDailyLogsInRange.mockResolvedValue([
      { logDate: '2026-06-10', note: '', tournamentsPlayed: 0, measuresExercised: [] },
    ]);
    const app = await buildApp();
    const res = await request(app).get('/api/goals/consistency');
    expect(res.status).toBe(200);
    expect(res.body.daysFilledThisMonth).toBe(0);
  });
});

describe('GET /api/goals/:id/series', () => {
  it('projeta snapshots -> serie ordenada por semana com expected/executed', async () => {
    storageMock.getSnapshotsForGoal.mockResolvedValue([
      { weekStartDate: '2026-06-08', expectedValue: '200', currentValue: '150', compliancePct: '75', status: 'behind' },
      { weekStartDate: '2026-06-01', expectedValue: '100', currentValue: '120', compliancePct: null, status: 'ahead' },
    ]);
    const app = await buildApp();
    const res = await request(app).get('/api/goals/g_1/series');
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(2);
    expect(res.body.series[0].weekStartDate).toBe('2026-06-01'); // ordenado asc
    expect(res.body.series[0].expected).toBe(100);
    expect(res.body.series[0].executed).toBe(120);
    expect(res.body.series[1].expected).toBe(200);
  });
});
