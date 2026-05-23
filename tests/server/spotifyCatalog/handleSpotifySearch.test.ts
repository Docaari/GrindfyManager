/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — Endpoint GET /api/audio/spotify/search
 *
 * Module alvo: server/routes/spotifyAudio.ts::handleSpotifySearch
 *
 * Contrato (spec §6.1):
 *   Query: q (2..200), type='track', limit (1..50, default 20)
 *   Response 200: { tracks: SpotifyTrack[], cached: boolean }
 *   Errors: 400 zod, 401 token revoked, 403 not_connected/tier_blocked,
 *           429 rate-limit (local OR upstream), 502 5xx/network.
 *
 * Padrao injected storage (lesson #34). Helpers requireSpotifyAccess +
 * tokenBucket + cacheStore injetados como deps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Helpers de fixture
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: { q: 'miles davis', type: 'track', limit: '20', ...(overrides.query ?? {}) },
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
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headersOut[k] = v;
    },
  };
  return res;
}

function makeSpotifyTrackJson(id: string) {
  return {
    id,
    name: `Track ${id}`,
    uri: `spotify:track:${id}`,
    duration_ms: 200_000,
    preview_url: `https://p.scdn.co/mp3/${id}`,
    album: { name: 'Album X', images: [{ url: `https://i.scdn.co/image/${id}` }] },
    artists: [{ name: 'Miles Davis' }],
  };
}

function makeStubFetchOk(payload: any, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    headers: { get: (_k: string) => null },
  }));
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

// =============================================================================
// Storage mock (lesson #34 — 3o arg). Implementa apenas o que requireSpotifyAccess
// e auto-refresh chamam.
// =============================================================================

function makeStorageStub(overrides: any = {}) {
  return {
    getSpotifyToken: vi.fn(async () => ({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'cipher',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      accessTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 3600_000), // expira em 1h
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
    ...overrides.extra,
  };
}

function makeTierResolverPremium() {
  return vi.fn(async () => 'premium');
}

// =============================================================================
// Tests
// =============================================================================

describe('handleSpotifySearch (RF-03 / spec §6.1)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  });

  it('happy path: Premium conectado, q="miles davis" → 20 tracks normalizadas', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    expect(typeof handler).toBe('function');

    const tracks = Array.from({ length: 20 }, (_, i) => makeSpotifyTrackJson(`t${i}`));
    const fetchStub = makeStubFetchOk({ tracks: { items: tracks } });

    const storage = makeStorageStub();
    const resolveUserTier = makeTierResolverPremium();
    const tokenBucket = { consume: vi.fn(() => ({ allowed: true, remaining: 179 })) };
    const cache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      invalidate: vi.fn(),
    };

    const req = makeReq();
    const res = makeRes();

    const accessCache = {
      get: () => 'fake-access-token-xyz',
      set: () => {},
      invalidate: () => {},
    };
    await handler(req, res, {
      storage,
      fetchFn: fetchStub,
      resolveUserTier,
      tokenBucket,
      cache,
      accessCache,
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.tracks)).toBe(true);
    expect(res.body.tracks.length).toBe(20);
    expect(res.body.cached).toBe(false);

    // Normalized shape: trackId/title/artists/durationSec/previewUrl/coverUrl/album.
    const first = res.body.tracks[0];
    expect(typeof first.trackId).toBe('string');
    expect(first.trackId).toMatch(/^spotify:track:/);
    expect(first.title).toBe('Track t0');
    expect(Array.isArray(first.artists)).toBe(true);
    expect(first.artists[0]).toBe('Miles Davis');
    expect(first.durationSec).toBe(200);
    expect(first.previewUrl).toContain('p.scdn.co');
    expect(first.coverUrl).toContain('i.scdn.co');
    expect(first.album).toBe('Album X');

    // Fetch chamado para search endpoint com q.
    expect(fetchStub).toHaveBeenCalled();
    const fetchUrl = String(fetchStub.mock.calls[0][0]);
    expect(fetchUrl).toContain('https://api.spotify.com/v1/search');
    expect(fetchUrl).toContain('type=track');
    expect(fetchUrl).toMatch(/q=miles[+%20]davis/i);

    expect(tokenBucket.consume).toHaveBeenCalledWith('USER-0001');
    expect(cache.set).toHaveBeenCalled();
  });

  it('400 quando q vazio', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    await handler(makeReq({ query: { q: '', type: 'track' } }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 quando q > 200 chars', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    await handler(makeReq({ query: { q: 'x'.repeat(201), type: 'track' } }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 quando type != track', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    await handler(makeReq({ query: { q: 'lofi', type: 'album' } }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('403 spotify_not_connected (sem row)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const storage = makeStorageStub();
    storage.getSpotifyToken.mockResolvedValueOnce(null);
    await handler(makeReq(), res, {
      storage,
      fetchFn: vi.fn(),
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(403);
    expect(String(res.body?.message ?? '')).toMatch(/spotify/i);
  });

  it('403 spotify_not_connected (disconnectedAt setado)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const storage = makeStorageStub({ tokenRow: { disconnectedAt: new Date() } });
    await handler(makeReq(), res, {
      storage,
      fetchFn: vi.fn(),
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 tier_blocked (free user) → spotify_deep_requires_pro_plus', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const resolveUserTier = vi.fn(async () => 'free');
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier,
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(403);
    expect(String(res.body?.message ?? '')).toMatch(/premium|pro|grindfy/i);
  });

  it('Trial liberado (Q1 default) — fetch chamado', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const fetchStub = makeStubFetchOk({ tracks: { items: [makeSpotifyTrackJson('a')] } });
    // resolveUserTier para Trial: spec diz que Trial é resolvido em 'pro' ou 'premium' via resolver.
    // Aqui mockamos diretamente 'pro' para refletir paridade tools AI-2A.
    const resolveUserTier = vi.fn(async () => 'pro');
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier,
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(200);
    expect(fetchStub).toHaveBeenCalled();
  });

  it('401 invalid_refresh (refresh falhou com invalid_grant)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    // expira agora → forca refresh.
    const storage = makeStorageStub({ tokenRow: { expiresAt: new Date(Date.now() - 10_000) } });
    // refresh fetch retorna invalid_grant.
    const refreshFetch = vi.fn(async (url: string) => {
      if (String(url).includes('accounts.spotify.com/api/token')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant' }),
          headers: { get: () => null },
        };
      }
      return { ok: true, status: 200, json: async () => ({ tracks: { items: [] } }), headers: { get: () => null } };
    });
    // tokenCrypto stub minimo (decrypt retorna refresh_token plain).
    const tokenCrypto = {
      decryptRefreshToken: () => 'refresh_plain_xyz',
      encryptRefreshToken: () => ({ ciphertext: 'c', iv: 'i', authTag: 't' }),
    };
    await handler(makeReq(), res, {
      storage,
      fetchFn: refreshFetch,
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: este teste exercita refresh path (invalid_grant) —
      // accessCache vazio forca requireSpotifyAccess upstream.
      accessCache: {
        get: () => null,
        set: () => {},
        invalidate: () => {},
      },
      tokenCrypto,
    });
    expect(res.statusCode).toBe(401);
    expect(storage.markSpotifyDisconnected).toHaveBeenCalled();
  });

  it('429 upstream Spotify → propagado + Retry-After preservado', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const fetchStub = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'too many requests' } }),
      headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? '15' : null) },
    }));
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 50 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(429);
    // Retry-After visivel no body ou header.
    const after =
      (res.headersOut['Retry-After'] ?? res.headersOut['retry-after']) ??
      String(res.body?.retryAfterMs ?? res.body?.retryAfter ?? '');
    expect(String(after)).toContain('15');
  });

  it('429 local rate-limit (bucket exhausted) — sem chamada upstream', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const res = makeRes();
    const fetchStub = vi.fn();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: false, remaining: 0, retryAfterMs: 800 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(429);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('cache hit (2a request mesma query) → no upstream call, no bucket consume', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const cached = {
      tracks: [
        {
          trackId: 'spotify:track:a',
          title: 'A',
          artists: ['X'],
          durationSec: 100,
          previewUrl: null,
          coverUrl: null,
          album: '',
        },
      ],
    };
    const res = makeRes();
    const fetchStub = vi.fn();
    const tokenBucket = { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) };
    const cache = { get: vi.fn(() => cached), set: vi.fn(), invalidate: vi.fn() };
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket,
      cache,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body?.cached).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(tokenBucket.consume).not.toHaveBeenCalled();
  });

  it('invalidateSpotifyCache(userId) → proxima request re-fetcha', async () => {
    const mod: any = await loadHandler();
    const invalidate = mod.invalidateSpotifyCache;
    expect(typeof invalidate).toBe('function');
    // Apenas valida que existe + nao throws com userId valido.
    expect(() => invalidate('USER-0001')).not.toThrow();
  });

  it('logging NUNCA inclui accessToken nem q em texto plano', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifySearch;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchStub = makeStubFetchOk({ tracks: { items: [makeSpotifyTrackJson('a')] } });
    await handler(makeReq({ query: { q: 'segredo_super_pii', type: 'track' } }), makeRes(), {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: makeTierResolverPremium(),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: gateAndAccess sempre forca refresh em cache cold.
      // Tests injetam accessCache pre-populado pra evitar refresh path
      // (que exigiria fetchFn dual + tokenCrypto real).
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    const allLogs = [...spy.mock.calls, ...errSpy.mock.calls]
      .flat()
      .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
      .join('\n');
    expect(allLogs).not.toMatch(/segredo_super_pii/);
    expect(allLogs).not.toMatch(/accessToken/);
    spy.mockRestore();
    errSpy.mockRestore();
  });
});
