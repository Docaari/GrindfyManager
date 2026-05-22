/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.4 (token refresh proativo)
 * Endpoint: POST /api/audio/spotify/refresh
 *
 * ADR-190.
 *
 * Handler: handlePostSpotifyRefresh(req, res, deps?)
 *
 * Comportamento:
 *  - Le cookie spotify_session (httpOnly assinado JWT) → userId.
 *  - SELECT spotify_tokens WHERE user_id = userId AND disconnected_at IS NULL.
 *  - Decrypt refresh_token via spotifyTokenCrypto.decryptRefreshToken.
 *  - POST https://accounts.spotify.com/api/token grant_type=refresh_token.
 *  - Atualiza access_token_hash + expires_at + last_refresh_at na tabela.
 *  - SE Spotify devolveu refresh_token NOVO: rotation → re-encrypt + UPDATE.
 *  - Retorna { accessToken, expiresIn } JSON.
 *  - Falhas: incrementa refresh_failure_count; ao chegar a 3, marca disconnected_at + 401.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, fetchMock, encryptMock, decryptMock } = vi.hoisted(() => ({
  storageMock: {
    getSpotifyToken: vi.fn(),
    upsertSpotifyToken: vi.fn(),
    markSpotifyDisconnected: vi.fn(),
    incrementRefreshFailureCount: vi.fn(),
    resetRefreshFailureCount: vi.fn(),
    updateRefreshSuccess: vi.fn(),
  },
  fetchMock: vi.fn(),
  encryptMock: vi.fn(),
  decryptMock: vi.fn(),
}));

vi.mock('../../../server/services/spotifyTokenCrypto', () => ({
  encryptRefreshToken: encryptMock,
  decryptRefreshToken: decryptMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'test_client_id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test_client_secret';
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';

  decryptMock.mockReturnValue('decrypted_refresh_token');
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'active' },
    headers: {},
    // spotify_session valid signed JWT — handler le do cookie; injetamos via stub field
    cookies: { spotify_session: 'fake-signed-jwt-for-test' },
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, cookies: [] as any[] };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.cookie = (name: string, value: string, opts: any) => {
    res.cookies.push({ name, value, opts });
    return res;
  };
  res.clearCookie = (name: string, opts?: any) => {
    res.cookies.push({ name, value: '', opts: { ...opts, cleared: true } });
    return res;
  };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('POST /api/audio/spotify/refresh (RF-01.4 / ADR-190)', () => {
  it('happy path: retorna accessToken + expiresIn novos', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'old-cipher',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      expiresAt: new Date(Date.now() + 60_000),
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new_access_xyz',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe('new_access_xyz');
    expect(res.body.expiresIn).toBe(3600);
    expect(storageMock.updateRefreshSuccess).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ expiresAt: expect.any(Date) }),
    );
  });

  it('rotation: Spotify devolveu refresh_token novo → re-encrypt + storage update', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'old-cipher',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    encryptMock.mockReturnValue({
      ciphertext: 'NEW-cipher',
      iv: 'NEW-iv',
      authTag: 'NEW-tag',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new_access',
        refresh_token: 'NEW_refresh',
        expires_in: 3600,
      }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(encryptMock).toHaveBeenCalledWith('NEW_refresh');
    expect(storageMock.upsertSpotifyToken).toHaveBeenCalledWith(
      expect.objectContaining({ refreshTokenEncrypted: 'NEW-cipher' }),
    );
  });

  it('cookie ausente → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq({ cookies: {} }) as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );
    expect(res.statusCode).toBe(401);
  });

  it('user nao tem spotify_tokens row → 404', async () => {
    storageMock.getSpotifyToken.mockResolvedValue(null);
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );
    expect(res.statusCode).toBe(404);
  });

  it('user ja desconectado (disconnected_at set) → 401', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      disconnectedAt: new Date(),
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      refreshFailureCount: 0,
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );
    expect(res.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Sprint Mini Player 3 — RF-01 (semantica nova `invalid_grant` -> disconnect)
  // ADRs: D1 + Q-M (body.error === 'invalid_grant' apos resp.json())
  // -------------------------------------------------------------------------
  it('Spotify refresh endpoint 400 invalid_grant -> mark disconnected + 401 + clearCookie (RF-01 / D1)', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(401);
    expect(storageMock.markSpotifyDisconnected).toHaveBeenCalledWith(
      'USER-0001',
      'invalid_grant',
    );
    // Fast-path NAO incrementa failure_count.
    expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled();
    // Cookie clearCookie chamado (res.clearCookie -> cleared:true marker).
    const cleared = res.cookies.find(
      (c: any) => c.name === 'spotify_session' && c.opts?.cleared,
    );
    expect(cleared).toBeDefined();
  });

  it('Spotify refresh endpoint 502 transient (sem invalid_grant) -> path generico: incrementa + 502 (RF-01 regressao)', async () => {
    // Path generico continua incrementando e devolvendo 502.
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    storageMock.incrementRefreshFailureCount.mockResolvedValue(1);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'server_error' }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(502);
    expect(storageMock.incrementRefreshFailureCount).toHaveBeenCalledWith('USER-0001');
    expect(storageMock.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('Spotify refresh 400 sem body JSON parseavel -> cai no path generico (RF-01 edge)', async () => {
    // resp.json() rejeita -> .catch(() => null) -> errJson?.error undefined -> NAO eh invalid_grant.
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    storageMock.incrementRefreshFailureCount.mockResolvedValue(1);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('non-json body');
      },
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(502);
    expect(storageMock.incrementRefreshFailureCount).toHaveBeenCalledWith('USER-0001');
    expect(storageMock.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('Spotify refresh 400 com body.error_description (sem error: invalid_grant) -> path generico (RF-01 distinction)', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    storageMock.incrementRefreshFailureCount.mockResolvedValue(1);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'something else' }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(502);
    expect(storageMock.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('apos 3 falhas consecutivas (path generico, NAO invalid_grant): marca disconnected_at + 401 + clearCookie', async () => {
    // Cobre o accumulator generico (>=3). invalid_grant ja eh terminal direto na 1a (RF-01).
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 2, // proxima falha = 3
    });
    storageMock.incrementRefreshFailureCount.mockResolvedValue(3);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'server_error' }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(storageMock.markSpotifyDisconnected).toHaveBeenCalledWith(
      'USER-0001',
      expect.any(String),
    );
    expect(res.statusCode).toBe(401);
    const cleared = res.cookies.find((c: any) => c.name === 'spotify_session' && c.opts?.cleared);
    expect(cleared).toBeDefined();
  });

  it('NUNCA expoe refresh_token na resposta', async () => {
    storageMock.getSpotifyToken.mockResolvedValue({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      disconnectedAt: null,
      refreshFailureCount: 0,
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'a', refresh_token: 'leakable', expires_in: 3600 }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(JSON.stringify(res.body)).not.toContain('leakable');
    expect(res.body.refreshToken).toBeUndefined();
  });
});
