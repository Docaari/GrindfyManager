/**
 * Sprint SPOTIFY-DEEP — Reviewer R1 wave 1 regression tests.
 *
 * CRITICAL-1: trial users devem passar server-side via resolveEligiblePlanTier
 *             (planEligibility.ts). resolveUserTier (coachAccess.ts) trata
 *             trial como 'free' — bug AI-1B latent.
 *
 * CRITICAL-2: gateAndAccess sempre forca refresh quando accessCache cold —
 *             nao mais devolve placeholder vazio (`accessToken: ""`).
 *             Sem essa correcao, primeira call pos-restart envia
 *             "Authorization: Bearer " e Spotify retorna 401 → handler 502.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001',
      subscriptionPlan: overrides.subscriptionPlan ?? 'trial',
    },
    query: { q: 'lofi', type: 'track', limit: '20' },
    headers: {},
    cookies: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headersOut: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    setHeader(k: string, v: string) { this.headersOut[k] = v; },
  };
  return res;
}

function makeStorageStub(overrides: any = {}) {
  return {
    getSpotifyToken: vi.fn(async () => ({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'cipher',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      accessTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: ['streaming'],
      disconnectedAt: null,
      displayName: 'Test User',
      spotifyUserId: 'sp_123',
      refreshFailureCount: 0,
      ...overrides.tokenRow,
    })),
    markSpotifyDisconnected: vi.fn(async () => {}),
    incrementRefreshFailureCount: vi.fn(async () => 1),
    updateRefreshSuccess: vi.fn(async () => {}),
    upsertSpotifyToken: vi.fn(async () => {}),
  };
}

function makeOkFetch(payload: any) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    headers: { get: () => null },
  }));
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('SPOTIFY-DEEP R1 fixes — CRITICAL-1 trial gate via planEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  });

  it('user trial + Spotify Premium conectado → 200 (nao 403)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const fetchStub = makeOkFetch({ tracks: { items: [] } });
    const res = makeRes();

    await handler(makeReq({ subscriptionPlan: 'trial' }), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      // SEM inject resolveUserTier — exercita o default path resolveTier()
      // → resolveEligiblePlanTier (planEligibility.ts).
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      accessCache: {
        get: () => 'fake-token',
        set: () => {},
        invalidate: () => {},
      },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchStub).toHaveBeenCalled();
  });

  it('user free (subscription_plan="free") → 403 spotify_deep_requires_pro_plus', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();

    await handler(makeReq({ subscriptionPlan: 'free' }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      accessCache: { get: () => 'fake', set: () => {}, invalidate: () => {} },
    });

    expect(res.statusCode).toBe(403);
    expect(String(res.body?.message ?? '')).toMatch(/premium|pro|grindfy/i);
  });

  it('user expired (subscription_plan="expired") → 403', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();

    await handler(makeReq({ subscriptionPlan: 'expired' }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      accessCache: { get: () => 'fake', set: () => {}, invalidate: () => {} },
    });

    expect(res.statusCode).toBe(403);
  });

  it('user admin (subscription_plan="admin") → 200', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const fetchStub = makeOkFetch({ tracks: { items: [] } });
    const res = makeRes();

    await handler(makeReq({ subscriptionPlan: 'admin' }), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      accessCache: {
        get: () => 'fake',
        set: () => {},
        invalidate: () => {},
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe('SPOTIFY-DEEP R1 fixes — CRITICAL-2 sempre refresh quando cache cold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  });

  it('token DB ainda valido (>1h) + accessCache vazio → SEMPRE chama refresh upstream', async () => {
    // Cenario: spotify_tokens.expires_at = now + 1h (token DB ainda valido),
    // mas access_token plain NAO esta em accessCache (servidor reiniciou).
    // Antes do fix CRITICAL-2: gateAndAccess devolvia `accessToken: ""` e
    // mandava "Authorization: Bearer " ao Spotify → 401 falso 502.
    // Pos-fix: SEMPRE chama refresh quando cache cold.
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;

    let refreshCalled = false;
    let searchCalled = false;
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('accounts.spotify.com/api/token')) {
        refreshCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new_access_token_xyz',
            expires_in: 3600,
          }),
          headers: { get: () => null },
        };
      }
      if (u.includes('api.spotify.com/v1/search')) {
        searchCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ tracks: { items: [] } }),
          headers: { get: () => null },
        };
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
        headers: { get: () => null },
      };
    });

    const tokenCrypto = {
      decryptRefreshToken: () => 'refresh_plain_xyz',
      encryptRefreshToken: () => ({ ciphertext: 'c', iv: 'i', authTag: 't' }),
    };

    const storage = makeStorageStub({
      tokenRow: {
        // expiresAt > now + 1h — antes seria "valido", agora forca refresh.
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const res = makeRes();
    await handler(makeReq({ subscriptionPlan: 'pro' }), res, {
      storage,
      fetchFn,
      resolveUserTier: vi.fn(async () => 'pro'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // accessCache vazio — cenario "primeira call pos-restart".
      accessCache: {
        get: () => null,
        set: () => {},
        invalidate: () => {},
      },
      tokenCrypto,
    });

    expect(refreshCalled).toBe(true);
    expect(searchCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    // Verifica que upstream search recebeu o token NOVO (nao Bearer vazio).
    const searchCall = fetchFn.mock.calls.find((c: any) =>
      String(c[0]).includes('api.spotify.com/v1/search'),
    );
    expect(searchCall).toBeDefined();
    const headers = (searchCall![1] as any).headers;
    expect(headers.Authorization).toBe('Bearer new_access_token_xyz');
  });

  it('accessCache hit pre-populado → NAO chama refresh (skip)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;

    let refreshCalled = false;
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes('accounts.spotify.com/api/token')) {
        refreshCalled = true;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ tracks: { items: [] } }),
        headers: { get: () => null },
      };
    });

    const res = makeRes();
    await handler(makeReq({ subscriptionPlan: 'pro' }), res, {
      storage: makeStorageStub(),
      fetchFn,
      resolveUserTier: vi.fn(async () => 'pro'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      accessCache: {
        get: () => 'cached_token_abc',
        set: () => {},
        invalidate: () => {},
      },
    });

    expect(refreshCalled).toBe(false);
    expect(res.statusCode).toBe(200);
    // Search recebe o token cached.
    const searchCall = fetchFn.mock.calls.find((c: any) =>
      String(c[0]).includes('api.spotify.com/v1/search'),
    );
    const headers = (searchCall![1] as any).headers;
    expect(headers.Authorization).toBe('Bearer cached_token_abc');
  });
});
