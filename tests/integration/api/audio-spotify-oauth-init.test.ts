/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-01.1 (OAuth PKCE init)
 * Endpoint: POST /api/audio/spotify/oauth-init
 *
 * ADRs: 189 (queue homogenea), 190 (token storage cookie httpOnly).
 *
 * Handler exportado em server/routes/spotifyAudio.ts:
 *   handlePostSpotifyOauthInit(req, res, injectedStorage?)
 *
 * Comportamento:
 *  - Gera state CSRF (>= 32 bytes random) + code_verifier (>= 43, <= 128 chars) +
 *    code_challenge (SHA256 base64url do verifier).
 *  - Persiste state+verifier em pending sessions store (in-memory Map TTL 10min).
 *  - Set-Cookie httpOnly assinado JWT ("spotify_oauth_session", maxAge=600s, sameSite=lax,
 *    secure em prod).
 *  - Retorna { authUrl, state } onde authUrl contem code_challenge + scopes corretos +
 *    client_id + redirect_uri.
 *
 * Lessons aplicadas:
 *  - #34 storage abstraction injetado como 3o arg pra testar sem mockar module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storageMock, getOauthSessionMock, putOauthSessionMock } = vi.hoisted(() => ({
  storageMock: {
    getSpotifyToken: vi.fn(),
    upsertSpotifyToken: vi.fn(),
    markSpotifyDisconnected: vi.fn(),
  },
  getOauthSessionMock: vi.fn(),
  putOauthSessionMock: vi.fn(),
}));

vi.mock('../../../server/services/spotifyOauthSessions', () => ({
  putOauthSession: putOauthSessionMock,
  getOauthSession: getOauthSessionMock,
  deleteOauthSession: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'test_client_id';
  process.env.SPOTIFY_REDIRECT_URI = 'http://localhost:3000/api/audio/spotify/oauth-callback';
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest';
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', email: 'u@test.com', subscriptionPlan: 'active' },
    headers: {},
    cookies: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    cookies: [] as Array<{ name: string; value: string; opts: any }>,
    _headers: {} as Record<string, string>,
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  res.cookie = (name: string, value: string, opts: any) => {
    res.cookies.push({ name, value, opts });
    return res;
  };
  res.setHeader = (k: string, v: string) => { res._headers[k.toLowerCase()] = v; return res; };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('POST /api/audio/spotify/oauth-init (RF-01.1 / ADR-190)', () => {
  it('user autenticado: retorna 200 com authUrl + state', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);

    expect(res.statusCode).toBe(200);
    expect(res.body.authUrl).toMatch(/^https:\/\/accounts\.spotify\.com\/authorize\?/);
    expect(typeof res.body.state).toBe('string');
    expect(res.body.state.length).toBeGreaterThanOrEqual(32);
  });

  it('authUrl deve conter os scopes obrigatorios (streaming + user-read-email + user-read-private + modify-playback-state)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);

    const url = new URL(res.body.authUrl);
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('streaming');
    expect(scope).toContain('user-read-email');
    expect(scope).toContain('user-read-private');
    expect(scope).toContain('user-modify-playback-state');
  });

  it('authUrl deve usar code_challenge_method=S256 + response_type=code', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);

    const url = new URL(res.body.authUrl);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')?.length).toBeGreaterThanOrEqual(43);
    expect(url.searchParams.get('client_id')).toBe('test_client_id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/audio/spotify/oauth-callback',
    );
  });

  it('seta cookie httpOnly spotify_oauth_session (sameSite=lax, maxAge<=600)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);

    const cookie = res.cookies.find((c: any) => c.name === 'spotify_oauth_session');
    expect(cookie).toBeDefined();
    expect(cookie!.opts.httpOnly).toBe(true);
    expect(cookie!.opts.sameSite).toBe('lax');
    expect(cookie!.opts.maxAge).toBeLessThanOrEqual(600 * 1000);
  });

  it('persiste pending session com verifier + state + userId', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);

    expect(putOauthSessionMock).toHaveBeenCalledTimes(1);
    const args = putOauthSessionMock.mock.calls[0];
    // (sessionId, payload)
    expect(args[1].userId).toBe('USER-0001');
    expect(typeof args[1].codeVerifier).toBe('string');
    expect(args[1].codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(args[1].codeVerifier.length).toBeLessThanOrEqual(128);
    expect(args[1].state).toBe(res.body.state);
  });

  it('sem user autenticado → 401', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq({ user: undefined }) as any, res, storageMock);
    expect(res.statusCode).toBe(401);
  });

  it('SPOTIFY_CLIENT_ID ausente → 500 (config error)', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyOauthInit(makeReq() as any, res, storageMock);
    expect(res.statusCode).toBe(500);
  });
});
