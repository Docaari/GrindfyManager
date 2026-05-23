/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — GET /api/audio/spotify/me/playlists
 *
 * Module alvo: server/routes/spotifyAudio.ts::handleSpotifyListPlaylists
 *
 * Contrato (spec §6.2):
 *   Query: limit (1..50, default 50). Sem paginacao MVP.
 *   Response 200: {
 *     playlists: SpotifyPlaylist[],
 *     total: number,
 *     truncated: boolean,
 *     cached: boolean
 *   }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: { limit: '50', ...(overrides.query ?? {}) },
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

function makeSpotifyPlaylistJson(id: string) {
  return {
    id,
    name: `Playlist ${id}`,
    images: [{ url: `https://mosaic.scdn.co/640/${id}` }],
    tracks: { total: 47 },
    owner: { display_name: `Owner ${id}` },
    collaborative: false,
    public: true,
  };
}

function makeStorageStub(overrides: any = {}) {
  return {
    getSpotifyToken: vi.fn(async () => ({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'c',
      refreshTokenIv: 'i',
      refreshTokenAuthTag: 't',
      accessTokenHash: 'h',
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: ['streaming'],
      disconnectedAt: null,
      displayName: 'X',
      spotifyUserId: 'sp_1',
      refreshFailureCount: 0,
      ...overrides.tokenRow,
    })),
    markSpotifyDisconnected: vi.fn(async () => {}),
    incrementRefreshFailureCount: vi.fn(async () => 1),
    updateRefreshSuccess: vi.fn(async () => {}),
    upsertSpotifyToken: vi.fn(async () => {}),
  };
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

describe('handleSpotifyListPlaylists (RF-03 / spec §6.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  });

  it('happy path: 50 playlists normalizadas', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    expect(typeof handler).toBe('function');

    const items = Array.from({ length: 50 }, (_, i) => makeSpotifyPlaylistJson(`p${i}`));
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: 50, limit: 50, offset: 0 }),
      headers: { get: () => null },
    }));

    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 179 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.playlists.length).toBe(50);
    expect(res.body.total).toBe(50);
    expect(res.body.truncated).toBe(false);
    expect(res.body.cached).toBe(false);

    const first = res.body.playlists[0];
    expect(typeof first.playlistId).toBe('string');
    expect(first.name).toBe('Playlist p0');
    expect(first.trackCount).toBe(47);
    expect(first.coverUrl).toContain('mosaic.scdn.co');
    expect(first.ownerName).toBe('Owner p0');
    expect(first.isCollaborative).toBe(false);
    expect(first.isPublic).toBe(true);

    const url = String(fetchStub.mock.calls[0][0]);
    expect(url).toContain('https://api.spotify.com/v1/me/playlists');
    expect(url).toContain('limit=50');
  });

  it('truncated=true quando total > limit (cap 50)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const items = Array.from({ length: 50 }, (_, i) => makeSpotifyPlaylistJson(`p${i}`));
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: 250, limit: 50, offset: 0 }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.body.truncated).toBe(true);
    expect(res.body.total).toBe(250);
    expect(res.body.playlists.length).toBe(50);
  });

  it('paginacao opcional via offset (query)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0, limit: 50, offset: 50 }),
      headers: { get: () => null },
    }));
    await handler(
      makeReq({ query: { limit: '50', offset: '50' } }),
      makeRes(),
      {
        storage: makeStorageStub(),
        fetchFn: fetchStub,
        resolveUserTier: vi.fn(async () => 'premium'),
        tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
        cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
        // R1 fix CRITICAL-2: accessCache hit.
        accessCache: {
          get: () => 'fake-access-token-xyz',
          set: () => {},
          invalidate: () => {},
        },
      },
    );
    const url = String(fetchStub.mock.calls[0][0]);
    expect(url).toContain('offset=50');
  });

  it('400 quando limit > 50', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const res = makeRes();
    await handler(makeReq({ query: { limit: '51' } }), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('403 tier_blocked (free)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: vi.fn(async () => 'free'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 not_connected (sem row)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const storage = makeStorageStub();
    storage.getSpotifyToken.mockResolvedValueOnce(null);
    const res = makeRes();
    await handler(makeReq(), res, {
      storage,
      fetchFn: vi.fn(),
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('429 local bucket exhausted', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const res = makeRes();
    const fetchStub = vi.fn();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: false, retryAfterMs: 500, remaining: 0 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      // R1 fix CRITICAL-2: accessCache hit pra evitar refresh path.
      accessCache: {
        get: () => 'fake-access-token-xyz',
        set: () => {},
        invalidate: () => {},
      },
    });
    expect(res.statusCode).toBe(429);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('cache hit retorna cached=true sem upstream', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const cached = { playlists: [], total: 0, truncated: false };
    const res = makeRes();
    const fetchStub = vi.fn();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 180 })) },
      cache: { get: vi.fn(() => cached), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.body.cached).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
