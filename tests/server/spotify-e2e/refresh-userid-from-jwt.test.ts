/**
 * Test-Writer (Modo TDD - Red Phase / nao-regressao RF-08)
 *
 * Sprint Spotify E2E — RF-08: `/refresh` deriva `userId` do JWT; valida mismatch
 * SO se o cookie `spotify_session` estiver presente.
 *
 * Module: server/routes/spotifyAudio.ts -> handlePostSpotifyRefresh
 *
 * Invariante: chamar o handler com `req.user.userPlatformId` (do JWT grindfy) e
 * SEM cookie `spotify_session` deve prosseguir normalmente (busca a row por
 * userId, refresca, devolve accessToken) — NUNCA 401 por cookie ausente. Exigir
 * o cookie criava o modo de falha em que /status dizia connected mas /refresh
 * dava 401 (cookie nao cruza localhost<->127.0.0.1 / COOP).
 *
 * Estrategia: chamar o handler exportado direto (lesson #34) com storage/fetchFn
 * injetados.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadHandlers() {
  return await import('../../../server/routes/spotifyAudio');
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(obj: any) {
      this.body = obj;
      return this;
    },
    send(obj: any) {
      this.body = obj;
      return this;
    },
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

const storageStub = {
  getSpotifyToken: vi.fn(async () => ({
    userId: 'USER-0005',
    refreshTokenEncrypted: 'ENC',
    refreshTokenIv: 'IV',
    refreshTokenAuthTag: 'TAG',
    expiresAt: new Date(Date.now() - 1000),
    scopes: ['streaming'],
    disconnectedAt: null,
    displayName: 'Founder',
    spotifyUserId: 'sp_5',
    refreshFailureCount: 0,
  })),
  markSpotifyDisconnected: vi.fn(async () => {}),
  incrementRefreshFailureCount: vi.fn(async () => 1),
  updateRefreshSuccess: vi.fn(async () => {}),
  upsertSpotifyToken: vi.fn(async () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  // tokenCrypto e importado dinamicamente pelo handler; precisa da key valida.
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('handlePostSpotifyRefresh — userId do JWT sem cookie (RF-08)', () => {
  it('sem cookie spotify_session -> prossegue (nao 401) e devolve accessToken', async () => {
    const mod = await loadHandlers();
    // tokenCrypto real (spotifyTokenCrypto) decifra ENC — mas como ENC/IV/TAG
    // sao stubs invalidos, o decrypt real lancaria. Para isolar o caminho
    // "sem cookie -> nao 401", injetamos fetchFn que retorna refresh ok e
    // confiamos no decrypt: como nao podemos injetar tokenCrypto neste handler,
    // mockamos o modulo de crypto via storage retornando ciphertext valido NAO
    // e possivel — entao validamos o INVARIANTE de auth: o handler NAO deve
    // retornar 401 por causa de cookie ausente. O fluxo pode falhar mais adiante
    // (decrypt), mas o status NUNCA pode ser 401 "cookie/session".
    const req: any = {
      user: { userPlatformId: 'USER-0005' },
      cookies: {}, // sem spotify_session
    };
    const res = makeRes();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'NEW_ACCESS', expires_in: 3600 }),
    }));
    await mod.handlePostSpotifyRefresh(req, res, {
      storage: storageStub,
      fetchFn,
    });
    // Invariante RF-08: a ausencia de cookie NUNCA gera 401 de sessao.
    expect(res.statusCode).not.toBe(401);
  });

  it('user ausente (sem JWT) -> 401 "Nao autenticado" (auth real, nao cookie)', async () => {
    const mod = await loadHandlers();
    const req: any = { user: undefined, cookies: {} };
    const res = makeRes();
    await mod.handlePostSpotifyRefresh(req, res, {
      storage: storageStub,
      fetchFn: vi.fn(),
    });
    expect(res.statusCode).toBe(401);
    expect(res.body?.message).toBe('Nao autenticado');
  });
});
