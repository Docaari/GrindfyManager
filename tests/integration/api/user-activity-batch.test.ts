/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-04.2 / ADR-191
 * Endpoint: POST /api/user-activity/batch
 *
 * Aceita batch sendBeacon de eventos (cap 10 por chamada).
 * Body: { events: [{ action, feature?, duration?, page, metadata }] }
 * Resposta: { accepted: N }
 *
 * Handler: handlePostUserActivityBatch(req, res, deps?)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    logUserActivity: vi.fn(),
    logUserActivityBatch: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';
  storageMock.logUserActivityBatch.mockResolvedValue({ inserted: 1 });
  storageMock.logUserActivity.mockResolvedValue(undefined);
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'active' },
    headers: { 'x-forwarded-for': '127.0.0.1' },
    cookies: {},
    body: { events: [] },
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.end = () => res;
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/userActivity');
}

const VALID_EVENT = {
  action: 'audio_driver_active',
  feature: 'spotify',
  duration: 60,
  page: 'mini_player',
  metadata: { driver: 'spotify', trackId: 'spotify:track:abc' },
};

describe('POST /api/user-activity/batch (RF-04.2 / ADR-191)', () => {
  it('happy path: 3 eventos → 200 com accepted=3', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [VALID_EVENT, VALID_EVENT, VALID_EVENT] } }) as any,
      res,
      storageMock,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(3);
    expect(storageMock.logUserActivityBatch).toHaveBeenCalledTimes(1);
    const passed = storageMock.logUserActivityBatch.mock.calls[0][0];
    expect(Array.isArray(passed)).toBe(true);
    expect(passed.length).toBe(3);
    expect(passed[0].userId).toBe('USER-0001');
  });

  it('cap 10 eventos: 11 itens → 400', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const events = Array(11).fill(VALID_EVENT);
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(400);
    expect(storageMock.logUserActivityBatch).not.toHaveBeenCalled();
  });

  it('sem user → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostUserActivityBatch(
      makeReq({ user: undefined, body: { events: [VALID_EVENT] } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(401);
  });

  it('events array vazio → 200 + accepted=0 (no-op)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [] } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.accepted).toBe(0);
    expect(storageMock.logUserActivityBatch).not.toHaveBeenCalled();
  });

  it('event sem action → 400', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const bad = { ...VALID_EVENT } as any;
    delete bad.action;
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [bad] } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(400);
  });

  it('event sem page → 400', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const bad = { ...VALID_EVENT } as any;
    delete bad.page;
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [bad] } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(400);
  });

  it('metadata muito grande (>10KB JSON) → 400', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const huge = { ...VALID_EVENT, metadata: { x: 'a'.repeat(11000) } };
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [huge] } }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(400);
  });

  it('NUNCA persiste email cru em metadata (PII strip)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const evil = {
      ...VALID_EVENT,
      metadata: { email: 'leak@evil.com', displayName: 'Cleartext User' },
    };
    await handler.handlePostUserActivityBatch(
      makeReq({ body: { events: [evil] } }) as any,
      res,
      storageMock,
    );

    if (storageMock.logUserActivityBatch.mock.calls.length > 0) {
      const passed = storageMock.logUserActivityBatch.mock.calls[0][0];
      // implementer pode strip ou reject — em ambos os casos o cleartext nao chega ao storage.
      const persisted = JSON.stringify(passed);
      expect(persisted).not.toContain('leak@evil.com');
      expect(persisted).not.toContain('Cleartext User');
    } else {
      // alternativa: reject 400
      expect(res.statusCode).toBe(400);
    }
  });
});
