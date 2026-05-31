/**
 * Test-Writer (Modo TDD - Red Phase) — WAVE FINAL Spotify Polish
 *
 * B-PAGINATE-1 [HIGH] — playlists >50 e tracks >50 truncam silenciosamente.
 *
 * Hoje listPlaylists/listPlaylistTracks pegam so a 1a pagina (limit 50). "Tocar
 * tudo" numa playlist de 200 toca 50.
 *
 * Contrato novo (manifesto): o client pagina via offset (loop ate `total`),
 * concatenando todas as paginas. Helpers paginadores:
 *   - listAllPlaylists(opts?): concatena todas as paginas de /me/playlists.
 *   - listAllPlaylistTracks(playlistId, opts?): concatena todas as paginas de
 *     items da playlist.
 * Ambos passam `offset` crescente no client base (que ja aceita offset) e param
 * quando ja coletaram `total` itens (ou a pagina volta vazia).
 *
 * Teste de LOGICA pura: mock global.fetch retornando 2 paginas -> helper
 * concatena. Lesson #3 — shapes REAIS de ListPlaylistsResponse /
 * ListPlaylistTracksResponse (total + truncated + arrays). Lesson #38 — await import.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetchSequence(pages: Array<{ status?: number; body: any }>) {
  let call = 0;
  const fn = vi.fn(async () => {
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return {
      ok: (page.status ?? 200) < 400,
      status: page.status ?? 200,
      json: async () => page.body,
    } as any;
  });
  (globalThis as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // limpa o fetch mockado entre testes.
  delete (globalThis as any).fetch;
});

function playlistPage(ids: string[], total: number, offset: number) {
  return {
    playlists: ids.map((id) => ({
      playlistId: id,
      name: id,
      trackCount: 10,
      coverUrl: null,
      ownerName: null,
      isCollaborative: false,
      isPublic: true,
    })),
    total,
    truncated: offset + ids.length < total,
  };
}

function trackPage(ids: string[], total: number, offset: number) {
  return {
    tracks: ids.map((id) => ({
      trackId: `spotify:track:${id}`,
      title: id,
      artists: ['Artist'],
      durationSec: 100,
      previewUrl: null,
      coverUrl: null,
      album: 'Album',
    })),
    total,
    truncated: offset + ids.length < total,
  };
}

describe('B-PAGINATE-1 listAllPlaylists pagina via offset', () => {
  it('concatena 2 paginas (total 80) numa lista de 80 playlists', async () => {
    const mod = await import('@/lib/audio-engine/spotifyApiClient');
    const listAll = (mod as any).listAllPlaylists;
    expect(typeof listAll).toBe('function');

    const fetchFn = mockFetchSequence([
      { body: playlistPage(Array.from({ length: 50 }, (_, i) => `p${i}`), 80, 0) },
      { body: playlistPage(Array.from({ length: 30 }, (_, i) => `p${50 + i}`), 80, 50) },
    ]);

    const all = await listAll();
    expect(all.playlists.length).toBe(80);
    expect(all.total).toBe(80);
    // 2 requests com offsets distintos.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const urls = fetchFn.mock.calls.map((c: any) => String(c[0]));
    expect(urls.some((u) => /offset=50/.test(u))).toBe(true);
  });

  it('1 pagina apenas (total <= 50) -> 1 request, sem truncated', async () => {
    const mod = await import('@/lib/audio-engine/spotifyApiClient');
    const listAll = (mod as any).listAllPlaylists;
    const fetchFn = mockFetchSequence([
      { body: playlistPage(['a', 'b', 'c'], 3, 0) },
    ]);
    const all = await listAll();
    expect(all.playlists.length).toBe(3);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('B-PAGINATE-1 listAllPlaylistTracks pagina via offset', () => {
  it('concatena 4 paginas (total 200) -> 200 tracks (nao 50)', async () => {
    const mod = await import('@/lib/audio-engine/spotifyApiClient');
    const listAllTracks = (mod as any).listAllPlaylistTracks;
    expect(typeof listAllTracks).toBe('function');

    const mk = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => `t${start + i}`);
    const fetchFn = mockFetchSequence([
      { body: trackPage(mk(0, 50), 200, 0) },
      { body: trackPage(mk(50, 50), 200, 50) },
      { body: trackPage(mk(100, 50), 200, 100) },
      { body: trackPage(mk(150, 50), 200, 150) },
    ]);

    const all = await listAllTracks('PL-200');
    expect(all.tracks.length).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('passa offset crescente nas requests de items', async () => {
    const mod = await import('@/lib/audio-engine/spotifyApiClient');
    const listAllTracks = (mod as any).listAllPlaylistTracks;
    const fetchFn = mockFetchSequence([
      { body: trackPage(Array.from({ length: 50 }, (_, i) => `t${i}`), 60, 0) },
      { body: trackPage(Array.from({ length: 10 }, (_, i) => `t${50 + i}`), 60, 50) },
    ]);
    await listAllTracks('PL-60');
    const urls = fetchFn.mock.calls.map((c: any) => String(c[0]));
    expect(urls.some((u) => /offset=50/.test(u))).toBe(true);
  });
});

describe('B-PAGINATE-1 base client aceita offset (regressao)', () => {
  it('listPlaylistTracks aceita offset e o injeta na URL', async () => {
    const mod = await import('@/lib/audio-engine/spotifyApiClient');
    const fetchFn = mockFetchSequence([
      { body: trackPage(['x'], 1, 50) },
    ]);
    // o client base deve suportar offset (necessario pro paginador).
    await (mod as any).listPlaylistTracks('PL-1', { limit: 50, offset: 50 });
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toMatch(/offset=50/);
  });
});
