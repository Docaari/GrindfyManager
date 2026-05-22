/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.6 (disconnect UX)
 * Endpoint: POST /api/audio/spotify/disconnect
 *
 * ADR-190.
 *
 * Handler: handlePostSpotifyDisconnect(req, res, deps?)
 *
 * Comportamento:
 *  - Le cookie spotify_session → userId.
 *  - storage.markSpotifyDisconnected(userId, reason='user_initiated').
 *  - res.clearCookie('spotify_session').
 *  - Retorna 204.
 *  - Idempotente: ja desconectado → 204 mesmo assim.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    markSpotifyDisconnected: vi.fn(),
    getSpotifyToken: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'active' },
    cookies: { spotify_session: 'fake-signed-jwt' },
    headers: {},
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, cookies: [] as any[] };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.send = (d?: any) => { res.body = d; return res; };
  res.end = () => res;
  res.clearCookie = (name: string, opts?: any) => {
    res.cookies.push({ name, opts: { ...opts, cleared: true } });
    return res;
  };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('POST /api/audio/spotify/disconnect (RF-01.6 / ADR-190)', () => {
  it('happy path: marca disconnected + clearCookie + 204', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      disconnectedAt: null,
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyDisconnect(makeReq() as any, res, storageMock);

    expect(res.statusCode).toBe(204);
    expect(storageMock.markSpotifyDisconnected).toHaveBeenCalledWith(
      'USER-0001',
      'user_initiated',
    );
    const cleared = res.cookies.find((c: any) => c.name === 'spotify_session' && c.opts?.cleared);
    expect(cleared).toBeDefined();
  });

  it('sem user autenticado → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyDisconnect(
      makeReq({ user: undefined }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(401);
  });

  it('idempotente: user ja desconectado → 204 mesmo assim + clearCookie', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      disconnectedAt: new Date(),
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyDisconnect(makeReq() as any, res, storageMock);
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c: any) => c.opts?.cleared)).toBeDefined();
  });

  it('user sem spotify_tokens row → 204 (idempotente)', async () => {
    storageMock.getSpotifyToken.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyDisconnect(makeReq() as any, res, storageMock);
    expect(res.statusCode).toBe(204);
  });
});
