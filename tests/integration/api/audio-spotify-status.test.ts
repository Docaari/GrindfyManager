/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.6 (status endpoint consumido pelo SpotifyConnectionPanel)
 *
 * Endpoint: GET /api/audio/spotify/status
 *
 * Handler: handleGetSpotifyStatus(req, res, deps?)
 *
 * Comportamento:
 *  - Le row spotify_tokens do user via storage.getSpotifyToken(userId).
 *  - SE nao ha row OR disconnected_at != null → { connected: false }
 *  - SE conectado → { connected: true, displayName, productTier?, connectedAt }
 *  - NUNCA expoe refresh_token nem access_token_hash.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getSpotifyToken: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    cookies: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('GET /api/audio/spotify/status (RF-01.6)', () => {
  it('user conectado → { connected: true, displayName, productTier }', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      displayName: 'Player1',
      spotifyUserId: 'sp_1',
      disconnectedAt: null,
      connectedAt: new Date('2026-05-22T10:00:00Z'),
      refreshTokenEncrypted: 'cipher_dont_leak',
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyStatus(makeReq() as any, res, storageMock);
    expect(res.statusCode).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.displayName).toBe('Player1');
    // PII: NAO expoe ciphertext nem refresh_token
    expect(JSON.stringify(res.body)).not.toContain('cipher_dont_leak');
  });

  it('user desconectado (disconnectedAt set) → { connected: false }', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      disconnectedAt: new Date(),
      displayName: 'X',
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyStatus(makeReq() as any, res, storageMock);
    expect(res.body.connected).toBe(false);
  });

  it('user sem row → { connected: false }', async () => {
    storageMock.getSpotifyToken.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyStatus(makeReq() as any, res, storageMock);
    expect(res.body.connected).toBe(false);
  });

  it('sem user → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyStatus(
      makeReq({ user: undefined }) as any,
      res,
      storageMock,
    );
    expect(res.statusCode).toBe(401);
  });
});
