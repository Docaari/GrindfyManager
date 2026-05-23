/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-03 — GET /api/audio/spotify/playlists/:id/tracks
 *
 * Module alvo: server/routes/spotifyAudio.ts::handleSpotifyPlaylistTracks
 *
 * Contrato (spec §6.3):
 *   Param: id = regex ^[a-zA-Z0-9]{22}$
 *   Query: limit (1..50, default 50)
 *   Response 200: { tracks: SpotifyTrack[], total: number, truncated: boolean, cached: boolean }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: '37i9dQZF1DXcBWIGoYBM5M' /* 22 chars valid */, ...(overrides.params ?? {}) },
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

function makePlaylistTrackJson(id: string, withTrack = true) {
  return withTrack
    ? {
        track: {
          id,
          name: `T ${id}`,
          uri: `spotify:track:${id}`,
          duration_ms: 180_000,
          preview_url: null,
          album: { name: 'A', images: [{ url: `https://i.scdn.co/${id}` }] },
          artists: [{ name: 'Artist' }],
        },
      }
    : { track: null };
}

function makeStorageStub() {
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

describe('handleSpotifyPlaylistTracks (RF-03 / spec §6.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPOTIFY_CLIENT_ID = 'cid_test';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
  });

  it('happy path: cap 50 tracks normalizadas', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    expect(typeof handler).toBe('function');

    const items = Array.from({ length: 50 }, (_, i) => makePlaylistTrackJson(`tr${i}`));
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: 50, limit: 50 }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.tracks.length).toBe(50);
    expect(res.body.total).toBe(50);
    expect(res.body.truncated).toBe(false);
    const url = String(fetchStub.mock.calls[0][0]);
    expect(url).toContain('/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks');
  });

  it('truncated=true se total > limit', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const items = Array.from({ length: 50 }, (_, i) => makePlaylistTrackJson(`tr${i}`));
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: 120, limit: 50 }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.body.truncated).toBe(true);
    expect(res.body.total).toBe(120);
  });

  it('filtra items com track:null (local/deletado) — spec §9.9', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const items = [
      makePlaylistTrackJson('a', true),
      makePlaylistTrackJson('b', false),
      makePlaylistTrackJson('c', true),
    ];
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items, total: 3, limit: 50 }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.body.tracks.length).toBe(2);
    expect(res.body.total).toBe(3); // total reflete original
  });

  it('400 playlistId regex invalido (curto)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'short' } }),
      res,
      {
        storage: makeStorageStub(),
        fetchFn: vi.fn(),
        resolveUserTier: vi.fn(async () => 'premium'),
        tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
        cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      },
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 playlistId regex invalido (caracteres especiais)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(
      makeReq({ params: { id: '37i9dQZF1DXcBWIGoYBM-M' } }), // hyphen → invalid
      res,
      {
        storage: makeStorageStub(),
        fetchFn: vi.fn(),
        resolveUserTier: vi.fn(async () => 'premium'),
        tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
        cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
      },
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 upstream Spotify (playlist removida/sem acesso) → 404 client', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const fetchStub = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'not found' } }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.statusCode).toBe(404);
    expect(String(res.body?.message ?? '')).toMatch(/playlist/i);
  });

  it('5xx upstream → 502 client', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const fetchStub = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'oops' } }),
      headers: { get: () => null },
    }));
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.statusCode).toBe(502);
  });

  it('network throw → 502', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const fetchStub = vi.fn(async () => { throw new Error('ENETUNREACH'); });
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: fetchStub,
      resolveUserTier: vi.fn(async () => 'premium'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.statusCode).toBe(502);
  });

  it('403 tier_blocked (free)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(makeReq(), res, {
      storage: makeStorageStub(),
      fetchFn: vi.fn(),
      resolveUserTier: vi.fn(async () => 'free'),
      tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
      cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    });
    expect(res.statusCode).toBe(403);
  });
});
