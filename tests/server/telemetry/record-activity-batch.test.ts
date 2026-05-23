// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-01 — POST /api/user-activity aceita batch
//
// ADR-191: handler ja aceita single body. ADR-207 generaliza.
// RF-01 spec: lib client posta tanto single ({event}) quanto batch ({events: [...]}).
//
// Cobertura:
//   - handlePostUserActivity (rota single) aceita body { action, ..., metadata }
//     E ALSO body { events: [...] } (auto-detect array → encaminha pro batch).
//   - handlePostUserActivityBatch (rota /batch) ja existente — re-valida cap 10.
//   - PII strip server-side cobre keys de ADR-207 §3 (email, displayName, phone,
//     cpf, payment_card, address).
//
// Lessons: #34 (handler 3o arg injectedStorage).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    logUserActivity: vi.fn(),
    logUserActivityBatch: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({ storage: storageMock }));

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.logUserActivity.mockResolvedValue(undefined);
  storageMock.logUserActivityBatch.mockResolvedValue({ inserted: 1 });
});

function makeReq(body: any) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'active' },
    headers: { 'x-forwarded-for': '127.0.0.1' },
    cookies: {},
    body,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.end = () => res;
  return res;
}

describe('POST /api/user-activity (RF-01 single+batch auto-detect)', () => {
  it('aceita body single { action, metadata } legacy', async () => {
    const mod: any = await import('../../../server/routes/userActivity');
    const handler = mod.handlePostUserActivity ?? mod.handleLogUserActivity;
    expect(typeof handler).toBe('function');

    const req = makeReq({
      action: 'audio.play',
      feature: 'mini_player',
      page: 'mini_player',
      metadata: { track_id: 'tr1' },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBeLessThan(400);
    expect(storageMock.logUserActivity).toHaveBeenCalled();
  });

  it('strip PII (email, phone, cpf, payment_card, address, display_name) server-side', async () => {
    const mod: any = await import('../../../server/routes/userActivity');
    const handler = mod.handlePostUserActivity ?? mod.handleLogUserActivity;

    const req = makeReq({
      action: 'audio.play',
      page: 'mini_player',
      metadata: {
        track_id: 'tr1',
        email: 'x@x.com',
        phone: '+5500000000',
        cpf: '12345678900',
        payment_card: '4111',
        address: 'Rua X',
        display_name: 'X',
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(storageMock.logUserActivity).toHaveBeenCalled();
    const persisted = storageMock.logUserActivity.mock.calls[0][0];
    const meta = persisted?.metadata ?? persisted?.meta ?? {};
    for (const k of ['email', 'phone', 'cpf', 'payment_card', 'address', 'display_name']) {
      expect(meta[k]).toBeUndefined();
    }
    expect(meta.track_id).toBe('tr1');
  });
});

describe('POST /api/user-activity/batch (RF-01)', () => {
  it('aceita batch com 10 eventos', async () => {
    const mod: any = await import('../../../server/routes/userActivity');
    const handler = mod.handlePostUserActivityBatch;
    expect(typeof handler).toBe('function');

    const events = Array.from({ length: 10 }, (_, i) => ({
      action: 'audio.play',
      page: 'mini_player',
      metadata: { track_id: `tr${i}`, v: 1 },
    }));
    const req = makeReq({ events });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBeLessThan(400);
    expect(storageMock.logUserActivityBatch).toHaveBeenCalled();
  });

  it('rejeita batch > 10 eventos (cap)', async () => {
    const mod: any = await import('../../../server/routes/userActivity');
    const handler = mod.handlePostUserActivityBatch;

    const events = Array.from({ length: 11 }, () => ({
      action: 'audio.play',
      page: 'mini_player',
      metadata: {},
    }));
    const req = makeReq({ events });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
