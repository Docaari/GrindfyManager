/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish:
 *   - B-PLCOUNT-1 (RF-01): mapPlaylist preserva "total desconhecido". Hoje
 *     `trackCount: pl.tracks?.total ?? 0` colapsa undefined em 0 -> "0 tracks".
 *     Contrato novo: trackCount = number | null (null = desconhecido; 0 = vazio
 *     comprovado; n = presente). Server tambem deve pedir fields=tracks.total.
 *   - B-COVER-1 (D6 — paridade server): capa custom de playlist
 *     (image-cdn-ak.spotifycdn.com) deve passar pelo sanitize por sufixo (hoje
 *     a allowlist exata do server rejeita -> coverUrl null).
 *
 * Espelha o contrato de deps-injection de
 * tests/server/spotifyCatalog/handleSpotifyListPlaylists.test.ts (lesson #3 —
 * shape REAL do storage/fetch, nao idealizado).
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

function baseDeps(fetchStub: any) {
  return {
    storage: makeStorageStub(),
    fetchFn: fetchStub,
    resolveUserTier: vi.fn(async () => 'premium'),
    tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 179 })) },
    cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    accessCache: {
      get: () => 'fake-access-token-xyz',
      set: () => {},
      invalidate: () => {},
    },
  };
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

function playlistJson(id: string, opts: { total?: number | undefined; coverUrl?: string | null } = {}) {
  const images = opts.coverUrl === null ? [] : [{ url: opts.coverUrl ?? `https://mosaic.scdn.co/640/${id}` }];
  const pl: any = {
    id,
    name: `Playlist ${id}`,
    images,
    owner: { display_name: `Owner ${id}` },
    collaborative: false,
    public: true,
  };
  // total ausente quando undefined: NAO setar a chave (espelha API 2026).
  if (opts.total !== undefined) pl.tracks = { total: opts.total };
  return pl;
}

function fetchWith(items: any[]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ items, total: items.length, limit: 50, offset: 0 }),
    headers: { get: () => null },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
});

describe('handleSpotifyListPlaylists trackCount null (B-PLCOUNT-1 / RF-01)', () => {
  it('tracks.total undefined -> trackCount === null (nao 0)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const fetchStub = fetchWith([playlistJson('p0', { total: undefined })]);
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchStub));
    expect(res.statusCode).toBe(200);
    expect(res.body.playlists[0].trackCount).toBeNull();
  });

  it('tracks.total === 0 -> trackCount === 0 (vazio comprovado, NAO null)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const fetchStub = fetchWith([playlistJson('p1', { total: 0 })]);
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchStub));
    expect(res.body.playlists[0].trackCount).toBe(0);
  });

  it('tracks.total === 25 -> trackCount === 25', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const fetchStub = fetchWith([playlistJson('p2', { total: 25 })]);
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchStub));
    expect(res.body.playlists[0].trackCount).toBe(25);
  });

  it('server pede fields incluindo tracks.total na URL upstream', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const fetchStub = fetchWith([playlistJson('p3', { total: 10 })]);
    await handler(makeReq(), makeRes(), baseDeps(fetchStub));
    const url = String(fetchStub.mock.calls[0][0]);
    expect(decodeURIComponent(url)).toMatch(/tracks\.total/);
  });
});

describe('handleSpotifyListPlaylists cover por sufixo (B-COVER-1 / D6 — server)', () => {
  it('capa custom image-cdn-ak.spotifycdn.com passa (hoje vira null)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const custom = 'https://image-cdn-ak.spotifycdn.com/image/abc';
    const fetchStub = fetchWith([playlistJson('p4', { total: 5, coverUrl: custom })]);
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchStub));
    expect(res.body.playlists[0].coverUrl).toBe(custom);
  });

  it('capa em host nao-Spotify continua rejeitada (null)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyListPlaylists;
    const evil = 'https://evil.example.com/image/abc';
    const fetchStub = fetchWith([playlistJson('p5', { total: 5, coverUrl: evil })]);
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchStub));
    expect(res.body.playlists[0].coverUrl).toBeNull();
  });
});
