/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.1 + RF-01.2 (OAuth PKCE callback + Premium gate)
 * Endpoint: GET /api/audio/spotify/oauth-callback?code=&state=
 *
 * ADR-190 (token storage cookie httpOnly).
 *
 * Handler exportado: handleGetSpotifyOauthCallback(req, res, deps?)
 *
 * deps = { storage, fetchFn, oauthSessions, tokenCrypto } injetadas pra testes.
 *
 * Comportamento:
 *  - Le cookie httpOnly "spotify_oauth_session" → busca pending session (userId + verifier).
 *  - Valida state contra session.state (CSRF).
 *  - Troca code+verifier por tokens via POST https://accounts.spotify.com/api/token.
 *  - GET https://api.spotify.com/v1/me → valida product==='premium'.
 *  - SE Free: NAO persiste tokens, retorna HTML postMessage type='spotify-oauth-premium-required'.
 *  - SE Premium: persiste refresh_token AES-256-GCM encrypted via storage.upsertSpotifyToken.
 *  - Set-Cookie httpOnly "spotify_session" assinado JWT (sameSite=lax, secure prod, no maxAge - session).
 *  - Retorna HTML pequeno fazendo window.opener.postMessage({type: 'spotify-oauth-success',
 *    accessToken, expiresIn, displayName}, origin) + window.close().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  storageMock,
  fetchMock,
  getOauthSessionMock,
  deleteOauthSessionMock,
  encryptMock,
} = vi.hoisted(() => ({
  storageMock: {
    upsertSpotifyToken: vi.fn(),
    getSpotifyToken: vi.fn(),
    markSpotifyDisconnected: vi.fn(),
  },
  fetchMock: vi.fn(),
  getOauthSessionMock: vi.fn(),
  deleteOauthSessionMock: vi.fn(),
  encryptMock: vi.fn(),
}));

vi.mock('../../../server/services/spotifyOauthSessions', () => ({
  putOauthSession: vi.fn(),
  getOauthSession: getOauthSessionMock,
  deleteOauthSession: deleteOauthSessionMock,
}));

vi.mock('../../../server/services/spotifyTokenCrypto', () => ({
  encryptRefreshToken: encryptMock,
  decryptRefreshToken: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'test_client_id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test_client_secret';
  process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:3000/api/audio/spotify/oauth-callback';
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';

  encryptMock.mockReturnValue({
    ciphertext: 'cipher-base64',
    iv: 'iv-hex-12bytes-padding',
    authTag: 'authtag-hex-16bytes-pad',
  });
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', email: 'u@test.com', subscriptionPlan: 'active' },
    headers: {},
    cookies: { spotify_oauth_session: 'session-id-from-cookie' },
    query: { code: 'authcode_from_spotify', state: 'state-value-32chars-padding' },
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    sentHtml: '',
    cookies: [] as any[],
  };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.send = (s: string) => { res.sentHtml = s; res.body = s; return res; };
  res.cookie = (name: string, value: string, opts: any) => {
    res.cookies.push({ name, value, opts });
    return res;
  };
  res.setHeader = vi.fn();
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

function setupPremiumOk() {
  getOauthSessionMock.mockReturnValue({
    userId: 'USER-0001',
    codeVerifier: 'verifier-43-chars-padding-12345678901234',
    state: 'state-value-32chars-padding',
    createdAt: Date.now(),
  });
  // First fetch: token exchange
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'access_abc',
      refresh_token: 'refresh_xyz',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'streaming user-read-email user-read-private user-modify-playback-state',
    }),
  });
  // Second fetch: Me API
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'spotify_user_123',
      display_name: 'Test User',
      email: 'spotify@test.com',
      product: 'premium',
    }),
  });
}

describe('GET /api/audio/spotify/oauth-callback (RF-01.1 + RF-01.2 / ADR-190)', () => {
  it('happy path Premium: persiste token encrypted + cookie spotify_session + HTML postMessage success', async () => {
    setupPremiumOk();
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(200);
    expect(res.sentHtml).toMatch(/window\.opener\.postMessage/);
    expect(res.sentHtml).toMatch(/spotify-oauth-success/);
    expect(res.sentHtml).toMatch(/window\.close\(\)/);

    expect(storageMock.upsertSpotifyToken).toHaveBeenCalledTimes(1);
    const args = storageMock.upsertSpotifyToken.mock.calls[0][0];
    expect(args.userId).toBe('USER-0001');
    expect(args.refreshTokenEncrypted).toBe('cipher-base64');
    expect(args.spotifyUserId).toBe('spotify_user_123');

    const sessionCookie = res.cookies.find((c: any) => c.name === 'spotify_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie.opts.httpOnly).toBe(true);
    expect(sessionCookie.opts.sameSite).toBe('lax');
  });

  it('Premium gate FAIL (product=free): NAO persiste token + HTML postMessage premium-required', async () => {
    getOauthSessionMock.mockReturnValue({
      userId: 'USER-0001',
      codeVerifier: 'verifier-43-chars-padding-12345678901234',
      state: 'state-value-32chars-padding',
      createdAt: Date.now(),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access_abc',
        refresh_token: 'refresh_xyz',
        expires_in: 3600,
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'free_user_456',
        display_name: 'Free User',
        product: 'free',
      }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.sentHtml).toMatch(/spotify-oauth-premium-required/);
    expect(storageMock.upsertSpotifyToken).not.toHaveBeenCalled();
  });

  it('state mismatch (CSRF) → 400 + HTML erro', async () => {
    getOauthSessionMock.mockReturnValue({
      userId: 'USER-0001',
      codeVerifier: 'verifier-43-chars-padding-12345678901234',
      state: 'EXPECTED-STATE',
      createdAt: Date.now(),
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq({ query: { code: 'c', state: 'DIFFERENT-STATE' } }) as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(400);
    expect(storageMock.upsertSpotifyToken).not.toHaveBeenCalled();
  });

  it('cookie session ausente → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq({ cookies: {} }) as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(401);
  });

  it('session expirada / nao encontrada → 401', async () => {
    getOauthSessionMock.mockReturnValue(null);
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(401);
  });

  it('Spotify token endpoint retorna erro (4xx/5xx) → 502 + HTML erro', async () => {
    getOauthSessionMock.mockReturnValue({
      userId: 'USER-0001',
      codeVerifier: 'verifier-43-chars-padding-12345678901234',
      state: 'state-value-32chars-padding',
      createdAt: Date.now(),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(res.statusCode).toBe(502);
    expect(storageMock.upsertSpotifyToken).not.toHaveBeenCalled();
  });

  it('apos sucesso, deleta a pending oauth session', async () => {
    setupPremiumOk();
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handleGetSpotifyOauthCallback(
      makeReq() as any,
      res,
      { storage: storageMock, fetchFn: fetchMock } as any,
    );

    expect(deleteOauthSessionMock).toHaveBeenCalled();
  });
});
