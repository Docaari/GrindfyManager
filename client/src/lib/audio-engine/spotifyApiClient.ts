// Sprint SPOTIFY-DEEP / RF-01/02 — TanStack Query wrappers para 3 endpoints.

export interface SpotifyTrack {
  trackId: string;
  title: string;
  artists: string[];
  durationSec: number;
  previewUrl: string | null;
  coverUrl: string | null;
  album: string;
}

export interface SpotifyPlaylist {
  playlistId: string;
  name: string;
  trackCount: number;
  coverUrl: string | null;
  ownerName: string | null;
  isCollaborative: boolean;
  isPublic: boolean;
}

export interface SearchTracksResponse {
  tracks: SpotifyTrack[];
  cached?: boolean;
}

export interface ListPlaylistsResponse {
  playlists: SpotifyPlaylist[];
  total: number;
  truncated: boolean;
  cached?: boolean;
}

export interface ListPlaylistTracksResponse {
  tracks: SpotifyTrack[];
  total: number;
  truncated: boolean;
  cached?: boolean;
}

export class SpotifyApiError extends Error {
  status: number;
  reason?: string;
  retryAfterMs?: number;
  constructor(opts: { status: number; message?: string; reason?: string; retryAfterMs?: number }) {
    super(opts.message ?? `Spotify API error ${opts.status}`);
    this.name = "SpotifyApiError";
    this.status = opts.status;
    this.reason = opts.reason;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) {
    let body: any = null;
    try {
      body = await resp.json();
    } catch {
      // ignore
    }
    throw new SpotifyApiError({
      status: resp.status,
      message: body?.message ?? `HTTP ${resp.status}`,
      reason: body?.reason,
      retryAfterMs: body?.retryAfterMs,
    });
  }
  return resp.json();
}

export async function searchTracks(
  q: string,
  opts: { limit?: number } = {},
): Promise<SearchTracksResponse> {
  const params = new URLSearchParams({ q, type: "track" });
  if (opts.limit) params.set("limit", String(opts.limit));
  return fetchJson(`/api/audio/spotify/search?${params.toString()}`);
}

export async function listPlaylists(
  opts: { limit?: number; offset?: number } = {},
): Promise<ListPlaylistsResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return fetchJson(
    `/api/audio/spotify/me/playlists${qs ? `?${qs}` : ""}`,
  );
}

export async function listPlaylistTracks(
  playlistId: string,
  opts: { limit?: number } = {},
): Promise<ListPlaylistTracksResponse> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return fetchJson(
    `/api/audio/spotify/playlists/${playlistId}/tracks${qs ? `?${qs}` : ""}`,
  );
}

export const spotifyKeys = {
  search: (q: string) => ["spotify", "search", q] as const,
  playlists: () => ["spotify", "playlists"] as const,
  playlistTracks: (id: string) => ["spotify", "playlist", id, "tracks"] as const,
};
