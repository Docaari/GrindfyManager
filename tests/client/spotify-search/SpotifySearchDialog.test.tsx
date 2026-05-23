// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint SPOTIFY-DEEP / RF-01 — SpotifySearchDialog (Tab Buscar)
//
// Componente alvo: client/src/components/audio-player/SpotifySearchDialog.tsx (NOVO)
//
// Comportamentos:
//   - Dialog Radix abre/fecha (Esc, X)
//   - 2 tabs: data-testid="tab-search" + data-testid="tab-playlists"
//   - Input com debounce 500ms (fake timers)
//   - 20 result rows: data-testid="search-result-row"
//   - Click row -> playTrack source='spotify'
//   - Click +fila -> addToQueue (dialog NAO fecha)
//   - Preview button -> HTML5 audio aparece
//   - Tier free/expired -> CTA upgrade visivel
//   - Error 401 invalid_refresh -> CTA reconectar
//   - Error 429 -> toast/banner com mensagem rate-limit
//
// Lessons:
//   - #14/#38: require() no top-level (padrao do projeto).
//   - #27: Radix Tabs reage a onMouseDown; usar userEvent ou onClick redundante.
//   - #28: vi.mock por path exato.
//   - #29: AudioPlayerProvider + QueryClientProvider montados ou
//          ErrorBoundary local para useQuery.
//   - #38: NAO misturar await import() com require() neste arquivo.
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// spotifyApiClient (NOVO) — TanStack wrappers para os 3 endpoints.
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

// Auth/tier mock — useAuth retorna subscriptionPlan. Tier resolvido client-side.
let mockUserTier: string = "premium";
let mockSpotifyConnected: boolean = true;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { userPlatformId: "USER-0001", subscriptionPlan: mockUserTier },
    isAuthenticated: true,
    isAdmin: mockUserTier === "admin",
  }),
  AuthProvider: ({ children }: any) => children,
}));

// useSpotifyStatus hook (NOVO ou ja existente) — devolve isConnected.
vi.mock("@/hooks/useSpotifyStatus", () => ({
  useSpotifyStatus: () => ({
    isConnected: mockSpotifyConnected,
    productTier: mockSpotifyConnected ? "premium" : null,
    displayName: "Test User",
    isLoading: false,
  }),
}));

// Telemetry mock.
const mockEmitAudioEvent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

// AudioPlayerContext mock — capturar playTrack/addToQueue.
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

// QueryClientProvider helper.
function wrap(children: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function loadDialog() {
  return require("@/components/audio-player/SpotifySearchDialog");
}

function makeTrack(i: number) {
  return {
    trackId: `spotify:track:t${i}`,
    title: `Track ${i}`,
    artists: ["Artist"],
    durationSec: 200,
    previewUrl: i % 2 === 0 ? `https://p.scdn.co/${i}` : null,
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
  mockUserTier = "premium";
  mockSpotifyConnected = true;
});

// =============================================================================

describe("SpotifySearchDialog — RF-01 (tab Buscar)", () => {
  it("renderiza tabs Buscar + Playlists quando aberto", async () => {
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("tab-search")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-playlists")).toBeInTheDocument();
  });

  it("debounce 500ms: 1 fetch para typing rapido", async () => {
    vi.useFakeTimers();
    mockSearchTracks.mockResolvedValue({
      tracks: [makeTrack(0)],
      cached: false,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId("spotify-search-input");

    fireEvent.change(input, { target: { value: "mil" } });
    fireEvent.change(input, { target: { value: "mile" } });
    fireEvent.change(input, { target: { value: "miles" } });
    // antes do debounce: zero fetch
    expect(mockSearchTracks).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(550);
    });
    expect(mockSearchTracks).toHaveBeenCalledTimes(1);
    expect(String(mockSearchTracks.mock.calls[0][0])).toContain("miles");
    vi.useRealTimers();
  });

  it("min 2 chars antes do primeiro fetch", async () => {
    vi.useFakeTimers();
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    const input = await screen.findByTestId("spotify-search-input");
    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(mockSearchTracks).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("renderiza 20 result rows com data-testid='search-result-row'", async () => {
    mockSearchTracks.mockResolvedValue({
      tracks: Array.from({ length: 20 }, (_, i) => makeTrack(i)),
      cached: false,
    });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} initialQuery="miles" />));
    await waitFor(() => {
      const rows = screen.getAllByTestId("search-result-row");
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBe(20);
    }, { timeout: 2000 });
  });

  it("click row chama playTrack(source='spotify')", async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [makeTrack(0)], cached: false });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} initialQuery="x" />));
    const row = await screen.findByTestId("search-result-row");
    fireEvent.click(row);
    await waitFor(() => {
      expect(mockPlayTrack).toHaveBeenCalled();
      const arg = mockPlayTrack.mock.calls[0][0];
      expect(arg.source).toBe("spotify");
      expect(arg.trackId).toContain("spotify:track:t0");
    });
  });

  it("click +fila chama addToQueue e NAO fecha dialog", async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [makeTrack(0)], cached: false });
    const onOpenChange = vi.fn();
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={onOpenChange} initialQuery="x" />));
    const addBtn = await screen.findByTestId("search-result-add-0");
    fireEvent.click(addBtn);
    await waitFor(() => expect(mockAddToQueue).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("preview button renderiza HTML5 audio inline ao clicar", async () => {
    mockSearchTracks.mockResolvedValue({ tracks: [makeTrack(0)], cached: false });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} initialQuery="x" />));
    const previewBtn = await screen.findByTestId("search-result-preview-0");
    fireEvent.click(previewBtn);
    await waitFor(() => {
      const audio = document.querySelector("audio[data-testid='spotify-preview-audio']");
      expect(audio).toBeTruthy();
    });
  });

  it("empty query inicial — estado vazio (sem fetch)", async () => {
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
    expect(mockSearchTracks).not.toHaveBeenCalled();
  });

  it("error 401 invalid_refresh -> CTA reconectar", async () => {
    mockSearchTracks.mockRejectedValue({ status: 401, reason: "invalid_refresh" });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} initialQuery="x" />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-reconnect-cta")).toBeInTheDocument();
    });
  });

  it("error 429 -> banner rate-limit", async () => {
    mockSearchTracks.mockRejectedValue({ status: 429, retryAfterMs: 5000 });
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} initialQuery="x" />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-rate-limit-banner")).toBeInTheDocument();
    });
  });

  it("dialog fecha em Esc (Radix nativo)", async () => {
    const onOpenChange = vi.fn();
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={onOpenChange} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
