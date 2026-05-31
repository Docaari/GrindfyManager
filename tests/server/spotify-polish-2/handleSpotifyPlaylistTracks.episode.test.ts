/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-EPISODE-1 [HIGH] — episodios em playlist.
 *
 * Bug atual: o `fields` projetado (spotifyAudio.ts:1151) NAO inclui `type` nem
 * os campos especificos de episode (`images`, `audio_preview_url`); normalizeTrack
 * le SO `track.album.images` (cover) e `track.preview_url` -> episodio fica sem
 * capa e sem preview.
 *
 * Contrato esperado (manifesto/spec):
 *   - o `fields` upstream projeta `type` (+ images, audio_preview_url) no item.
 *   - normalizeTrack, quando o item eh `type === 'episode'`, le a capa de
 *     `images[0].url` e o preview de `audio_preview_url`.
 *   - track normal (music) continua lendo de album.images / preview_url (regressao).
 *
 * Espelha o deps-injection de
 * tests/server/spotifyCatalog/handleSpotifyPlaylistTracks.test.ts (lesson #3).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    params: { id: '37i9dQZF1DXcBWIGoYBM5M', ...(overrides.params ?? {}) },
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
    tokenBucket: { consume: vi.fn(() => ({ allowed: true, remaining: 100 })) },
    cache: { get: vi.fn(() => null), set: vi.fn(), invalidate: vi.fn() },
    accessCache: {
      get: () => 'fake-access-token-xyz',
      set: () => {},
      invalidate: () => {},
    },
  };
}

function fetchWith(items: any[]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ items, total: items.length, limit: 50 }),
    headers: { get: () => null },
  }));
}

// Episode shape: cover em `images` (top-level), preview em `audio_preview_url`.
function episodeItem(id: string) {
  return {
    item: {
      id,
      type: 'episode',
      name: `Episode ${id}`,
      uri: `spotify:episode:${id}`,
      duration_ms: 1_800_000,
      audio_preview_url: `https://p.scdn.co/mp3/ep-${id}`,
      images: [{ url: `https://i.scdn.co/image/ep-${id}` }],
    },
  };
}

function musicItem(id: string) {
  return {
    item: {
      id,
      type: 'track',
      name: `Track ${id}`,
      uri: `spotify:track:${id}`,
      duration_ms: 200_000,
      preview_url: `https://p.scdn.co/mp3/tr-${id}`,
      album: { name: 'Album', images: [{ url: `https://i.scdn.co/image/al-${id}` }] },
      artists: [{ name: 'Artist' }],
    },
  };
}

async function loadHandler() {
  return await import('../../../server/routes/spotifyAudio');
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = 'cid_test';
  process.env.SPOTIFY_CLIENT_SECRET = 'csecret_test';
});

describe('B-EPISODE-1 normalizeTrack le capa/preview de episode', () => {
  it('episodio: coverUrl vem de images[0].url (nao album.images)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchWith([episodeItem('e1')])));
    expect(res.statusCode).toBe(200);
    const ep = res.body.tracks[0];
    expect(ep).toBeTruthy();
    expect(ep.coverUrl).toBe('https://i.scdn.co/image/ep-e1');
  });

  it('episodio: previewUrl vem de audio_preview_url', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchWith([episodeItem('e2')])));
    const ep = res.body.tracks[0];
    expect(ep.previewUrl).toBe('https://p.scdn.co/mp3/ep-e2');
  });

  it('episodio: trackId preserva o uri spotify:episode:', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchWith([episodeItem('e3')])));
    expect(res.body.tracks[0].trackId).toBe('spotify:episode:e3');
  });

  it('track normal continua lendo de album.images / preview_url (regressao)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(makeReq(), res, baseDeps(fetchWith([musicItem('m1')])));
    const tr = res.body.tracks[0];
    expect(tr.coverUrl).toBe('https://i.scdn.co/image/al-m1');
    expect(tr.previewUrl).toBe('https://p.scdn.co/mp3/tr-m1');
  });

  it('playlist mista (track + episode): ambos normalizam com capa/preview corretos', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const res = makeRes();
    await handler(
      makeReq(),
      res,
      baseDeps(fetchWith([musicItem('m9'), episodeItem('e9')])),
    );
    expect(res.body.tracks.length).toBe(2);
    const byId = Object.fromEntries(res.body.tracks.map((t: any) => [t.trackId, t]));
    expect(byId['spotify:track:m9'].coverUrl).toBe('https://i.scdn.co/image/al-m9');
    expect(byId['spotify:episode:e9'].coverUrl).toBe('https://i.scdn.co/image/ep-e9');
  });

  it('o fields upstream projeta `type` (necessario p/ distinguir episode)', async () => {
    const mod = await loadHandler();
    const handler = (mod as any).handleSpotifyPlaylistTracks;
    const fetchStub = fetchWith([episodeItem('e4')]);
    await handler(makeReq(), makeRes(), baseDeps(fetchStub));
    const url = String(fetchStub.mock.calls[0][0]);
    expect(decodeURIComponent(url)).toMatch(/type/);
  });
});
