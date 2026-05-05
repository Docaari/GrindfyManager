/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-06: Endpoints admin /api/admin/fx/*
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-06
 *
 * Endpoints esperados:
 *   POST /api/admin/fx/refresh       — force run cron
 *   GET  /api/admin/fx/latest        — ultima rate por currency
 *   GET  /api/admin/fx/history       — paginated history
 *
 * Permission: 'admin:fx' (registrar em shared/permissions.ts).
 * Rate limit: 10 req/min (bankrollLimiter ou adminLimiter dedicado).
 *
 * Padrao: handlers exportados de server/routes/adminFx.ts:
 *   handlePostFxRefresh(req, res)
 *   handleGetFxLatest(req, res)
 *   handleGetFxHistory(req, res)
 *
 * Status RED: arquivo nao existe. Implementer cria server/routes/adminFx.ts
 * + registra em server/routes.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================
const { runFxRatesRefreshMock, getLatestSystemRatesMock, getRateHistoryMock } = vi.hoisted(() => ({
  runFxRatesRefreshMock: vi.fn(),
  getLatestSystemRatesMock: vi.fn(),
  getRateHistoryMock: vi.fn(),
}));

vi.mock('../../../server/jobs/refreshFxRates', () => ({
  runFxRatesRefresh: runFxRatesRefreshMock,
}));

vi.mock('../../../server/services/fx/fxRatesPersistence', () => ({
  getLatestSystemRates: getLatestSystemRatesMock,
  getRateHistory: getRateHistoryMock,
  fxRatesPersistence: {
    getLatestSystemRates: getLatestSystemRatesMock,
    getRateHistory: getRateHistoryMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-ADMIN',
      email: 'ricardo.agnolo@hotmail.com', // super-admin
      subscriptionPlan: 'admin',
    },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

async function loadHandlers() {
  return await import('../../../server/routes/adminFx');
}

// =============================================================================
// POST /api/admin/fx/refresh
// =============================================================================
describe('POST /api/admin/fx/refresh — RF-06', () => {
  it('admin valido + run sucesso → 200 + metrics', async () => {
    runFxRatesRefreshMock.mockResolvedValue({
      runId: 'abc1234567',
      status: 'ok',
      inserted: 2,
      skipped: 0,
      currencies_fetched: ['BRL', 'EUR'],
      currencies_failed: [],
      duration_ms: 450,
    });

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostFxRefresh(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.inserted).toBe(2);
    expect(res.body.runId).toBeTruthy();
    expect(res.body.currencies_updated ?? res.body.currencies_fetched).toEqual(
      expect.arrayContaining(['BRL', 'EUR']),
    );
  });

  it('sem auth (req.user undefined) → 401', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostFxRefresh(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('user sem permission admin:fx → 403', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostFxRefresh(makeReq({
      user: {
        userPlatformId: 'USER-NOPERM',
        email: 'random@test.com',
        subscriptionPlan: 'trial',
      },
    }) as any, res);
    expect(res.statusCode).toBe(403);
  });

  it('runFxRatesRefresh throws → 500 com mensagem', async () => {
    runFxRatesRefreshMock.mockRejectedValue(new Error('cron exploded'));
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handlePostFxRefresh(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// GET /api/admin/fx/latest
// =============================================================================
describe('GET /api/admin/fx/latest — RF-06', () => {
  it('retorna BRL + EUR com source + fetchedAt', async () => {
    getLatestSystemRatesMock.mockResolvedValue({
      BRL: { currency: 'BRL', date: '2026-05-05', ratePerUsd: 5.1234, source: 'bcb_ptax', fetchedAt: new Date('2026-05-05T17:00:00Z') },
      EUR: { currency: 'EUR', date: '2026-05-05', ratePerUsd: 0.9234, source: 'frankfurter', fetchedAt: new Date('2026-05-05T17:00:00Z') },
    });

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxLatest(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.BRL).toBeDefined();
    expect(res.body.BRL.ratePerUsd).toBeCloseTo(5.1234, 4);
    expect(res.body.BRL.source).toBe('bcb_ptax');
    expect(res.body.EUR).toBeDefined();
    expect(res.body.EUR.ratePerUsd).toBeCloseTo(0.9234, 4);
  });

  it('sem auth → 401', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxLatest(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('sem permission → 403', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxLatest(makeReq({
      user: {
        userPlatformId: 'USER-NOPERM',
        email: 'foo@test.com',
        subscriptionPlan: 'trial',
      },
    }) as any, res);
    expect(res.statusCode).toBe(403);
  });
});

// =============================================================================
// GET /api/admin/fx/history
// =============================================================================
describe('GET /api/admin/fx/history — RF-06', () => {
  it('currency=BRL days=30 retorna 30 rows DESC', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      currency: 'BRL',
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      ratePerUsd: 5 + i * 0.001,
      source: 'bcb_ptax',
      fetchedAt: new Date(),
    }));
    getRateHistoryMock.mockResolvedValue(rows);

    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      query: { currency: 'BRL', days: '30' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.currency).toBe('BRL');
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBe(30);
    expect(getRateHistoryMock).toHaveBeenCalledWith('BRL', 30, 0);
  });

  it('currency invalido (CNY fora do escopo v1) → 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      query: { currency: 'CNY', days: '30' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('days > 365 → 400 ou clamp para 365', async () => {
    getRateHistoryMock.mockResolvedValue([]);
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      query: { currency: 'BRL', days: '400' },
    }) as any, res);

    // Aceita 400 (validation error) OR 200 com clamp 365
    if (res.statusCode === 200) {
      // se clampa, getRateHistory foi chamado com 365
      const args = getRateHistoryMock.mock.calls[0];
      expect(args[1]).toBeLessThanOrEqual(365);
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  it('currency obrigatorio: ausente → 400', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      query: { days: '30' },
    }) as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('offset paginacao passa para storage', async () => {
    getRateHistoryMock.mockResolvedValue([]);
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      query: { currency: 'BRL', days: '30', offset: '60' },
    }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(getRateHistoryMock).toHaveBeenCalledWith('BRL', 30, 60);
  });

  it('sem auth → 401', async () => {
    const handlers = await loadHandlers();
    const res = makeRes();
    await handlers.handleGetFxHistory(makeReq({
      user: undefined,
      query: { currency: 'BRL', days: '30' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});
