/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-DISCONNECT-3X [MED] — refresh com 5xx transitorio NAO conta rumo ao
 * disconnect permanente.
 *
 * Bug atual (spotifyAudio.ts:498-512): qualquer `!resp.ok` que NAO seja
 * `invalid_grant` cai no "path generico" que SEMPRE incrementa o
 * refresh_failure_count -> 3 hiccups 5xx transitorios da Spotify desconectam o
 * user permanentemente.
 *
 * Contrato esperado (manifesto): 5xx upstream (>=500) = transitorio -> 502 ao
 * client SEM incrementar failure_count (nao caminha rumo ao disconnect). Erros
 * NAO-transitorios (4xx que nao invalid_grant) continuam no path generico
 * (incrementam). invalid_grant continua desconectando direto (regressao).
 *
 * ATENCAO (test-writer -> implementer/reviewer): existe um teste LEGADO em
 * tests/integration/api/audio-spotify-refresh.test.ts:266 ("502 transient ->
 * incrementa") que afirma o COMPORTAMENTO ANTIGO (502 incrementa). O fix de
 * B-DISCONNECT-3X CONTRADIZ esse teste. O implementer NAO pode editar testes;
 * sinalizado como conflito que exige decisao do reviewer/founder (alinhar o
 * teste legado a nova politica 5xx-nao-conta). Ver resumo do test-writer.
 *
 * Espelha o deps-injection de tests/integration/api/audio-spotify-refresh.test.ts.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  storageMock.getSpotifyToken.mockResolvedValue({
    userId: 'USER-0001',
    refreshTokenEncrypted: 'c',
    refreshTokenIv: 'iv',
    refreshTokenAuthTag: 'tag',
    disconnectedAt: null,
    refreshFailureCount: 0,
  });
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001', subscriptionPlan: 'active' },
    headers: {},
    cookies: { spotify_session: 'fake-signed-jwt-for-test' },
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, cookies: [] as any[] };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.cookie = (n: string, v: string, o: any) => { res.cookies.push({ n, v, o }); return res; };
  res.clearCookie = (n: string, o?: any) => { res.cookies.push({ n, v: '', o: { ...o, cleared: true } }); return res; };
  return res;
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

function upstream5xx(status: number, body: any = { error: 'server_error' }) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

describe('B-DISCONNECT-3X refresh 5xx transitorio NAO conta', () => {
  it('502 upstream transitorio -> 502 ao client SEM incrementar failure count', async () => {
    fetchMock.mockResolvedValueOnce(upstream5xx(502));
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(makeReq() as any, res, {
      storage: storageMock,
      fetchFn: fetchMock,
    } as any);

    expect(res.statusCode).toBe(502);
    expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled();
    expect(storageMock.markSpotifyDisconnected).not.toHaveBeenCalled();
  });

  it('503 upstream transitorio -> 502 ao client SEM incrementar', async () => {
    fetchMock.mockResolvedValueOnce(upstream5xx(503));
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(makeReq() as any, res, {
      storage: storageMock,
      fetchFn: fetchMock,
    } as any);

    expect(res.statusCode).toBe(502);
    expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled();
  });

  it('500 upstream repetido 3x NAO desconecta (transitorio nunca acumula)', async () => {
    const handler = await loadHandler();
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(upstream5xx(500));
      const res = makeRes();
      await handler.handlePostSpotifyRefresh(makeReq() as any, res, {
        storage: storageMock,
        fetchFn: fetchMock,
      } as any);
      expect(res.statusCode).toBe(502);
    }
    expect(storageMock.markSpotifyDisconnected).not.toHaveBeenCalled();
    expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled();
  });

  it('regressao: invalid_grant (400) continua desconectando direto', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(makeReq() as any, res, {
      storage: storageMock,
      fetchFn: fetchMock,
    } as any);

    expect(res.statusCode).toBe(401);
    expect(storageMock.markSpotifyDisconnected).toHaveBeenCalledWith(
      'USER-0001',
      'invalid_grant',
    );
    // invalid_grant NAO passa pelo incremento.
    expect(storageMock.incrementRefreshFailureCount).not.toHaveBeenCalled();
  });

  it('regressao: erro 4xx generico (nao invalid_grant, nao 5xx) ainda incrementa', async () => {
    // 4xx que nao eh invalid_grant continua no path generico (conta rumo a 3x).
    storageMock.incrementRefreshFailureCount.mockResolvedValue(1);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'algo diferente' }),
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler.handlePostSpotifyRefresh(makeReq() as any, res, {
      storage: storageMock,
      fetchFn: fetchMock,
    } as any);

    expect(storageMock.incrementRefreshFailureCount).toHaveBeenCalledWith('USER-0001');
  });
});
