/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint FX-1 — RF-07: GET /api/fx/current (user-level)
 *
 * Spec: Docs/specs/sprint-fx-1.md §RF-07
 *
 * Endpoint authenticated (qualquer user logado, nao requer admin):
 *   GET /api/fx/current
 *   Response: {
 *     rates: { BRL, EUR },  -- resolved pela cascata user > system > wallets > fallback
 *     source: 'user' | 'system' | 'wallets' | 'fallback' | 'mixed',
 *     fetchedAt: ISO date  -- timestamp do system rate (ou now() se fallback)
 *   }
 *
 * Handler exportado em server/routes/fx.ts:
 *   handleGetFxCurrent(req, res)
 *
 * Status RED: arquivo nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveExchangeRatesMock } = vi.hoisted(() => ({
  resolveExchangeRatesMock: vi.fn(),
}));

vi.mock('../../../server/services/fxResolver', () => ({
  resolveExchangeRates: resolveExchangeRatesMock,
  fxResolver: { resolveExchangeRates: resolveExchangeRatesMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001',
      email: 'user@test.com',
      subscriptionPlan: 'active',
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

async function loadHandler() {
  return await import('../../../server/routes/fx');
}

describe('GET /api/fx/current — RF-07', () => {
  it('user autenticado retorna rates + source resolvidos pela cascata', async () => {
    resolveExchangeRatesMock.mockResolvedValue({
      rates: { USD: 1, BRL: 5.1234, EUR: 0.9234 },
      source: 'system',
      resolvedAt: new Date('2026-05-05T17:05:00Z'),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetFxCurrent(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rates.BRL).toBeCloseTo(5.1234, 4);
    expect(res.body.rates.EUR).toBeCloseTo(0.9234, 4);
    expect(res.body.source).toBe('system');
    expect(res.body.fetchedAt).toBeTruthy();

    expect(resolveExchangeRatesMock).toHaveBeenCalledWith('USER-0001');
  });

  it('user com override → source=user', async () => {
    resolveExchangeRatesMock.mockResolvedValue({
      rates: { USD: 1, BRL: 5.5, EUR: 0.95 },
      source: 'user',
      resolvedAt: new Date(),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetFxCurrent(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('user');
    expect(res.body.rates.BRL).toBeCloseTo(5.5, 2);
  });

  it('sem auth → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetFxCurrent(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('resolveExchangeRates throws → 500', async () => {
    resolveExchangeRatesMock.mockRejectedValue(new Error('resolver crashed'));
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetFxCurrent(makeReq() as any, res);
    expect(res.statusCode).toBe(500);
  });

  it('response inclui USD=1 nas rates', async () => {
    resolveExchangeRatesMock.mockResolvedValue({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetFxCurrent(makeReq() as any, res);
    expect(res.body.rates.USD).toBe(1);
  });
});
