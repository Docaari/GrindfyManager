import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — validacao de criacao + tier + scoreboard (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/routes/goals.ts -> registerGoalsRoutes(app, requireAuth)
//
// Cobre (cenarios de teste derivados da spec):
//   - erros NOMEADOS no body: wig_deadline_too_short, wig_active_limit,
//     wig_must_be_lag, lead_active_limit, lead_underspecified,
//     lead_not_controllable, lead_no_data_source, baseline_immutable.
//   - tier (DEC-A2): free/expired -> 403 em POST/PATCH/DELETE/link-measure;
//     GET /api/goals e /scoreboard respondem para todos (read-only).
//   - scoreboard: current/target/expectedNow/status por meta; WIG draft (sem
//     medida vinculada) AUSENTE do placar; geracao on-read UPSERT idempotente.
//
// AMBIGUIDADE documentada (ADR vs diagrama):
//   - O fluxograma create-goal-flow.mermaid usa 422 para erros de doutrina e 403
//     para tier; o texto do ADR/spec diz "erro nomeado 4xx" e para baseline_immutable
//     diz explicitamente 400. Para nao travar, asserto:
//       * tier negado -> 403 (cravado: ADR DEC-A2 + flowchart).
//       * baseline_immutable -> 400 (cravado: ADR DEC-menor-1 "retorna 400").
//       * demais erros de doutrina -> status 4xx (>=400 e <500) + CODE nomeado no body
//         (robusto a 400 vs 422; o codigo nomeado e o contrato congelado).
//
// Convencao: getReportTier mockado por path; storage mockado por path (o teste
// cobre o handler/validacao, nao a logica de storage).
// =============================================================================

const h = vi.hoisted(() => ({
  getReportTier: vi.fn(),
}));

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: h.getReportTier,
}));

// Storage mockado — counts e aggregate controlados por teste.
const storageMock: any = {
  getUserByPlatformId: vi.fn(async () => ({ id: 'USER-0001', userPlatformId: 'USER-0001', subscriptionPlan: 'trial' })),
  countActiveWigs: vi.fn(async () => 0),
  countActiveMeasures: vi.fn(async () => 0),
  createWig: vi.fn(async (uid: string, input: any) => ({ id: 'cg_1', userId: uid, status: 'draft', ...input })),
  createGoal: vi.fn(async (input: any) => ({ id: 'g_1', status: 'active', goalKind: 'measure', ...input })),
  getGoal: vi.fn(async (uid: string, id: string) => ({ id, userId: uid, goalKind: 'measure', status: 'active' })),
  getWig: vi.fn(async (uid: string, id: string) => ({ careerGoalId: id, userId: uid, status: 'active' })),
  updateGoal: vi.fn(async () => ({ id: 'g_1' })),
  archiveGoal: vi.fn(async () => undefined),
  linkMeasure: vi.fn(async () => ({ id: 'lnk_1' })),
  listActiveWigs: vi.fn(async () => []),
  listGoals: vi.fn(async () => []),
  getLatestSnapshotsForUser: vi.fn(async () => []),
  upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
};

vi.mock('../../../server/storage', () => ({ storage: storageMock }));

// Agregacao on-read mockada (placar): valor previsivel.
vi.mock('../../../server/coach/goals/aggregateCurrentValue', () => ({
  aggregateCurrentValue: vi.fn(async () => ({ value: 50, dataSufficiency: 'ok' })),
}));

function makeReq(plan = 'trial') {
  return (req: any, _res: any, next: any) => {
    req.user = { userPlatformId: 'USER-0001', subscriptionPlan: plan };
    next();
  };
}

async function buildApp(plan = 'trial') {
  const app = express();
  app.use(express.json());
  const { registerGoalsRoutes } = await import('../../../server/routes/goals');
  registerGoalsRoutes(app, makeReq(plan));
  return app;
}

// WIG valida base (deadline >= +90 dias de hoje). Usa data bem no futuro.
const VALID_WIG = {
  goalType: 'performance',
  category: 'financial_brm',
  title: 'De $5k para $20k',
  sourceMetric: 'bankroll_usd',
  baselineValue: 5000,
  targetValue: 20000,
  unit: 'usd',
  horizon: 'quarter',
  targetDeadline: '2099-12-01', // bem > +90d
  kind: 'wig',
};

const VALID_MEASURE = {
  goalType: 'process',
  category: 'study',
  title: 'Estudar 300min/semana',
  sourceMetric: 'study_minutes_week',
  targetValue: 300,
  unit: 'minutes',
  cadence: 'weekly',
  horizon: 'quarter',
  kind: 'measure',
};

function expectNamedError(res: any, code: string) {
  expect(res.status, `status 4xx para ${code}`).toBeGreaterThanOrEqual(400);
  expect(res.status, `status < 500 para ${code}`).toBeLessThan(500);
  const body = res.body ?? {};
  const found = body.code ?? body.error ?? body.message ?? '';
  expect(String(found), `erro nomeado ${code} no body`).toContain(code);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  storageMock.countActiveWigs.mockResolvedValue(0);
  storageMock.countActiveMeasures.mockResolvedValue(0);
});

// -----------------------------------------------------------------------------
// Tier gating (DEC-A2)
// -----------------------------------------------------------------------------
describe('METAS-1 — tier gating (DEC-A2)', () => {
  it('tier free -> 403 em POST /api/goals', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).post('/api/goals').send(VALID_MEASURE);
    expect(res.status).toBe(403);
  });

  it('tier free -> 403 em PATCH /api/goals/:id', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).patch('/api/goals/g_1').send({ title: 'novo' });
    expect(res.status).toBe(403);
  });

  it('tier free -> 403 em DELETE /api/goals/:id', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).delete('/api/goals/g_1');
    expect(res.status).toBe(403);
  });

  it('tier free -> 403 em POST /api/goals/:id/link-measure', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).post('/api/goals/cg_1/link-measure').send({ measureId: 'g_1' });
    expect(res.status).toBe(403);
  });

  it('tier free -> GET /api/goals responde 200 (read-only para todos)', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(200);
  });

  it('tier free -> GET /api/goals/scoreboard responde 200 (read-only para todos)', async () => {
    h.getReportTier.mockResolvedValue('free');
    const app = await buildApp('free');
    const res = await request(app).get('/api/goals/scoreboard');
    expect(res.status).toBe(200);
  });
});

// -----------------------------------------------------------------------------
// Validacao de criacao — WIG (RF-01)
// -----------------------------------------------------------------------------
describe('METAS-1 — validacao WIG (RF-01)', () => {
  it('deadline < +90 dias -> wig_deadline_too_short (cita D9)', async () => {
    const app = await buildApp('trial');
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // +10 dias
      .toISOString()
      .slice(0, 10);
    const res = await request(app).post('/api/goals').send({ ...VALID_WIG, targetDeadline: soon });
    expectNamedError(res, 'wig_deadline_too_short');
  });

  it('3a WIG ativa -> wig_active_limit', async () => {
    storageMock.countActiveWigs.mockResolvedValue(2); // ja tem 2 -> a 3a estoura
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send(VALID_WIG);
    expectNamedError(res, 'wig_active_limit');
  });

  it('WIG goalType=process -> wig_must_be_lag (processo e D2)', async () => {
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send({ ...VALID_WIG, goalType: 'process' });
    expectNamedError(res, 'wig_must_be_lag');
  });
});

// -----------------------------------------------------------------------------
// Validacao de criacao — medida (RF-03/04)
// -----------------------------------------------------------------------------
describe('METAS-1 — validacao medida (RF-03/04)', () => {
  it('4a medida ativa -> lead_active_limit', async () => {
    storageMock.countActiveMeasures.mockResolvedValue(3); // ja tem 3 -> a 4a estoura
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send(VALID_MEASURE);
    expectNamedError(res, 'lead_active_limit');
  });

  it('medida sem targetValue/unit/cadence -> lead_underspecified (cita C7)', async () => {
    const app = await buildApp('trial');
    const { targetValue, unit, cadence, ...semCampos } = VALID_MEASURE as any;
    const res = await request(app).post('/api/goals').send(semCampos);
    expectNamedError(res, 'lead_underspecified');
  });

  it('sourceMetric nao-controlavel (win_a_tournament) -> lead_not_controllable (A2/D9)', async () => {
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send({ ...VALID_MEASURE, sourceMetric: 'win_a_tournament' });
    expectNamedError(res, 'lead_not_controllable');
  });

  it('sourceMetric profit_short_term -> lead_not_controllable (outcome bias)', async () => {
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send({ ...VALID_MEASURE, sourceMetric: 'profit_short_term' });
    expectNamedError(res, 'lead_not_controllable');
  });

  it('sourceMetric fora do mapa RF-05 (mas nao na recusada) -> lead_no_data_source', async () => {
    const app = await buildApp('trial');
    const res = await request(app).post('/api/goals').send({ ...VALID_MEASURE, sourceMetric: 'metrica_inexistente_xyz' });
    expectNamedError(res, 'lead_no_data_source');
  });
});

// -----------------------------------------------------------------------------
// PATCH baseline imutavel (DEC-menor-1) — cravado 400
// -----------------------------------------------------------------------------
describe('METAS-1 — PATCH baseline imutavel (DEC-menor-1)', () => {
  it('PATCH com baselineValue -> 400 baseline_immutable', async () => {
    const app = await buildApp('trial');
    const res = await request(app).patch('/api/goals/g_1').send({ baselineValue: 1 });
    expect(res.status).toBe(400);
    const found = res.body?.code ?? res.body?.error ?? res.body?.message ?? '';
    expect(String(found)).toContain('baseline_immutable');
  });
});

// -----------------------------------------------------------------------------
// PATCH validacao de schema (MEDIUM-2) — FIX-WAVE
// Hoje handlePatchGoal NAO valida o body contra patchGoalSchema (.strict() + enum
// de status); um status fora do enum passa cru pro storage (updateGoal seta
// status='lixo' -> CHECK do pg explode 500 OU grava lixo). O contrato (DEC-menor-1
// + patchGoalSchema em shared/goals.ts) exige rejeitar com 4xx nomeado.
// -----------------------------------------------------------------------------
describe('METAS-1 — PATCH validacao de schema (MEDIUM-2)', () => {
  it('PATCH com status fora do enum ("lixo") -> 400/422 (nao 500, nao passa cru)', async () => {
    const app = await buildApp('trial');
    const res = await request(app).patch('/api/goals/g_1').send({ status: 'lixo' });
    expect(res.status, 'status invalido deve ser rejeitado na fronteira HTTP (4xx)').toBeGreaterThanOrEqual(400);
    expect(res.status, 'nunca 500 (validacao de schema antes do storage)').toBeLessThan(500);
    // updateGoal NUNCA deve ser chamado com status invalido.
    const calledWithBadStatus = storageMock.updateGoal.mock.calls.some(
      (c: any[]) => c?.[2]?.status === 'lixo',
    );
    expect(calledWithBadStatus, 'updateGoal nao pode receber status="lixo" cru').toBe(false);
  });

  it('PATCH com status valido ("achieved") -> 200 (caminho feliz preservado)', async () => {
    const app = await buildApp('trial');
    const res = await request(app).patch('/api/goals/g_1').send({ status: 'achieved' });
    expect(res.status).toBe(200);
  });

  it('PATCH de medida com targetDeadline -> NAO seta coluna inexistente em goals (suposicao: ignorado OU 4xx)', async () => {
    // SUPOSICAO documentada (ADR/DEC-menor-1): targetDeadline so vale pra WIG
    // (career_goals). Em `goals` (medida) a coluna NAO existe. O fix aceitavel:
    //   (a) rejeitar 4xx, OU (b) aceitar e IGNORAR (nao repassar targetDeadline ao
    //   updateGoal de medida). O que NAO pode: repassar targetDeadline pro updateGoal
    //   de medida (geraria UPDATE de coluna inexistente -> 500 em prod).
    const app = await buildApp('trial');
    const res = await request(app).patch('/api/goals/g_1').send({ targetDeadline: '2027-01-01' });
    if (res.status >= 400) {
      expect(res.status).toBeLessThan(500); // se rejeita, e 4xx (nao 500)
    } else {
      expect(res.status).toBe(200);
      const passedDeadline = storageMock.updateGoal.mock.calls.some(
        (c: any[]) => c?.[2]?.targetDeadline !== undefined,
      );
      expect(
        passedDeadline,
        'updateGoal de medida NAO deve receber targetDeadline (coluna inexistente em goals)',
      ).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
// Scoreboard (RF-06/07) — pace + status + WIG draft ausente
// -----------------------------------------------------------------------------
describe('METAS-1 — scoreboard (RF-06/07)', () => {
  it('cada meta no placar expoe current/target/expectedNow/status', async () => {
    storageMock.listGoals.mockResolvedValue([
      {
        id: 'g_1',
        userId: 'USER-0001',
        goalKind: 'measure',
        status: 'active',
        sourceMetric: 'study_minutes_week',
        targetValue: '300',
        baselineValue: '0',
        horizon: 'quarter',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        targetDeadline: '2026-12-01',
      },
    ]);
    const app = await buildApp('trial');
    const res = await request(app).get('/api/goals/scoreboard');
    expect(res.status).toBe(200);
    const measures = res.body?.measures ?? [];
    expect(measures.length).toBeGreaterThan(0);
    const m = measures[0];
    expect(m).toHaveProperty('current');
    expect(m).toHaveProperty('target');
    expect(m).toHaveProperty('expectedNow');
    expect(m).toHaveProperty('status');
  });

  it('WIG draft (sem medida vinculada) NAO aparece no placar (RF-02)', async () => {
    // listActiveWigs so retorna WIG-4DX ativas (com goal_wig_meta). Uma draft
    // (sem medida) nao e "active" -> nao deve ser listada.
    storageMock.listActiveWigs.mockResolvedValue([]); // nenhuma WIG ativa
    const app = await buildApp('trial');
    const res = await request(app).get('/api/goals/scoreboard');
    expect(res.status).toBe(200);
    expect(res.body?.wigs ?? []).toHaveLength(0);
  });

  it('GET /scoreboard 2x na mesma semana -> upsertGoalSnapshot idempotente (UPSERT, nao duplica)', async () => {
    storageMock.listGoals.mockResolvedValue([
      {
        id: 'g_1',
        userId: 'USER-0001',
        goalKind: 'measure',
        status: 'active',
        sourceMetric: 'study_minutes_week',
        targetValue: '300',
        baselineValue: '0',
        horizon: 'quarter',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        targetDeadline: '2026-12-01',
      },
    ]);
    const app = await buildApp('trial');
    await request(app).get('/api/goals/scoreboard');
    await request(app).get('/api/goals/scoreboard');
    // upsert chamado em ambas as leituras; o ON CONFLICT garante 1 row/semana.
    expect(storageMock.upsertGoalSnapshot).toHaveBeenCalled();
    // a chave de semana passada deve ser YYYY-MM-DD (UTC via ymdUtc), nunca BRT-shiftada.
    const firstCall = storageMock.upsertGoalSnapshot.mock.calls[0]?.[0];
    expect(firstCall?.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
