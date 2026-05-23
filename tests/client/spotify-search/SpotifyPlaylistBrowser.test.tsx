// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint SPOTIFY-DEEP / RF-02 — SpotifyPlaylistBrowser (tab Playlists)
//
// Mesmo dialog SpotifySearchDialog; tab Playlists = lazy fetch + drill-in.
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchTracks = vi.fn();
const mockListPlaylists = vi.fn();
const mockListPlaylistTracks = vi.fn();

vi.mock("@/lib/audio-engine/spotifyApiClient", () => ({
  searchTracks: mockSearchTracks,
  listPlaylists: mockListPlaylists,
  listPlaylistTracks: mockListPlaylistTracks,
  spotifyKeys: {
    search: (q: string) => ["spotify", "search", q],
    playlists: () => ["spotify", "playlists"],
    playlistTracks: (id: string) => ["spotify", "playlist", id, "tracks"],
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { userPlatformId: "USER-0001", subscriptionPlan: "premium" },
    isAuthenticated: true,
    isAdmin: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/hooks/useSpotifyStatus", () => ({
  useSpotifyStatus: () => ({
    isConnected: true,
    productTier: "premium",
    displayName: "Test User",
    isLoading: false,
  }),
}));

const mockEmitAudioEvent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

const mockPlayTrack = vi.fn();
const mockAddToQueue = vi.fn(() => true);
vi.mock("@/contexts/AudioPlayerContext", () => ({
  useAudioPlayer: () => ({
    playTrack: mockPlayTrack,
    addToQueue: mockAddToQueue,
    activeTrack: null,
    activeSource: null,
    isPlaying: false,
  }),
  AudioPlayerProvider: ({ children }: any) => children,
}));

function wrap(children: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function loadDialog() {
  return require("@/components/audio-player/SpotifySearchDialog");
}

function makePlaylist(i: number) {
  return {
    playlistId: `pl${i}aaaaaaaaaaaaaaaaaaa`, // 22 chars-ish
    name: `Playlist ${i}`,
    trackCount: 47,
    coverUrl: `https://i.scdn.co/p${i}`,
    ownerName: "Me",
    isCollaborative: false,
    isPublic: true,
  };
}

function makeTrack(i: number) {
  return {
    trackId: `spotify:track:tt${i}`,
    title: `Track ${i}`,
    artists: ["X"],
    durationSec: 200,
    previewUrl: null,
    coverUrl: `https://i.scdn.co/${i}`,
    album: "A",
  };
}

beforeEach(() => {
  mockSearchTracks.mockReset();
  mockListPlaylists.mockReset();
  mockListPlaylistTracks.mockReset();
  mockEmitAudioEvent.mockClear();
  mockPlayTrack.mockClear();
  mockAddToQueue.mockClear();
});

// =============================================================================

describe("SpotifyPlaylistBrowser — RF-02", () => {
  it("click tab Playlists -> lazy fetch + render lista", async () => {
    mockListPlaylists.mockResolvedValue({
      playlists: Array.from({ length: 5 }, (_, i) => makePlaylist(i)),
      total: 5,
      truncated: false,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    // Default tab = search, listPlaylists nao chamado.
    await waitFor(() => expect(screen.getByTestId("tab-playlists")).toBeInTheDocument());
    expect(mockListPlaylists).not.toHaveBeenCalled();

    // Switch tab — Radix Tabs reage a onMouseDown ou click (lesson #27 cobrir).
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    await waitFor(() => {
      const rows = screen.queryAllByTestId("playlist-row");
      expect(rows.length).toBeGreaterThan(0);
    });
    expect(mockListPlaylists).toHaveBeenCalled();
  });

  it("click playlist -> drill-in (fetch tracks) + breadcrumb visivel", async () => {
    mockListPlaylists.mockResolvedValue({
      playlists: [makePlaylist(0)],
      total: 1,
      truncated: false,
    });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: Array.from({ length: 10 }, (_, i) => makeTrack(i)),
      total: 10,
      truncated: false,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    await waitFor(() => {
      expect(mockListPlaylistTracks).toHaveBeenCalled();
      expect(screen.getByTestId("playlist-breadcrumb-back")).toBeInTheDocument();
      const trackRows = screen.queryAllByTestId("playlist-track-row");
      expect(trackRows.length).toBe(10);
    });
  });

  it("breadcrumb back -> volta para lista sem refetch (cache)", async () => {
    mockListPlaylists.mockResolvedValue({
      playlists: [makePlaylist(0)],
      total: 1,
      truncated: false,
    });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: [makeTrack(0)],
      total: 1,
      truncated: false,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    const back = await screen.findByTestId("playlist-breadcrumb-back");
    const callsBeforeBack = mockListPlaylists.mock.calls.length;
    fireEvent.click(back);
    await waitFor(() => {
      expect(screen.queryAllByTestId("playlist-row").length).toBeGreaterThan(0);
    });
    // sem refetch
    expect(mockListPlaylists.mock.calls.length).toBe(callsBeforeBack);
  });

  it("Tocar tudo -> playTrack(primeiro) + addToQueue(resto) + fecha dialog", async () => {
    mockListPlaylists.mockResolvedValue({ playlists: [makePlaylist(0)], total: 1, truncated: false });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: Array.from({ length: 5 }, (_, i) => makeTrack(i)),
      total: 5,
      truncated: false,
    });
    const onOpenChange = vi.fn();
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={onOpenChange} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab); fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    const playAll = await screen.findByTestId("playlist-play-all");
    fireEvent.click(playAll);
    await waitFor(() => {
      expect(mockPlayTrack).toHaveBeenCalledTimes(1);
      expect(mockAddToQueue).toHaveBeenCalledTimes(4); // 5 - 1 primeiro
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Adicionar tudo -> addToQueue para cada + telemetria 1x por track (Q5 default)", async () => {
    mockListPlaylists.mockResolvedValue({ playlists: [makePlaylist(0)], total: 1, truncated: false });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: Array.from({ length: 5 }, (_, i) => makeTrack(i)),
      total: 5,
      truncated: false,
    });
    const onOpenChange = vi.fn();
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={onOpenChange} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab); fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    const addAll = await screen.findByTestId("playlist-add-all");
    fireEvent.click(addAll);
    await waitFor(() => {
      expect(mockAddToQueue).toHaveBeenCalledTimes(5);
    });
    // dialog NAO fecha em add-all
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // telemetria audio.spotify_track_add 1x por track.
    const calls = mockEmitAudioEvent.mock.calls.filter(
      (c) => String(c[0]).includes("spotify_track_add"),
    );
    expect(calls.length).toBe(5);
  });

  it("cap 50 tracks renderiza limite", async () => {
    mockListPlaylists.mockResolvedValue({ playlists: [makePlaylist(0)], total: 1, truncated: false });
    mockListPlaylistTracks.mockResolvedValue({
      tracks: Array.from({ length: 50 }, (_, i) => makeTrack(i)),
      total: 120,
      truncated: true,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab); fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    await waitFor(() => {
      const rows = screen.queryAllByTestId("playlist-track-row");
      expect(rows.length).toBe(50);
    });
    expect(screen.getByTestId("playlist-truncated-banner")).toBeInTheDocument();
  });

  it("telemetria audio.spotify_playlist_select no drill-in", async () => {
    mockListPlaylists.mockResolvedValue({ playlists: [makePlaylist(0)], total: 1, truncated: false });
    mockListPlaylistTracks.mockResolvedValue({ tracks: [], total: 0, truncated: false });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const tab = screen.getByTestId("tab-playlists");
    fireEvent.mouseDown(tab); fireEvent.click(tab);
    const row = await screen.findByTestId("playlist-row");
    fireEvent.click(row);
    await waitFor(() => {
      const calls = mockEmitAudioEvent.mock.calls.filter(
        (c) => String(c[0]).includes("spotify_playlist_select"),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
