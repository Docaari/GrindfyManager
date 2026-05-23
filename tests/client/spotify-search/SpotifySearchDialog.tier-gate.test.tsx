// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint SPOTIFY-DEEP / RF-01 + §8 (tier matrix) — Tier gate client-side
//
// Comportamento esperado no SpotifySearchDialog:
//   - tier='free' -> NAO renderiza Search/Playlists; mostra CTA Upgrade.
//   - tier='trial' (Q1 default) -> LIBERADO; renderiza tabs normalmente.
//   - tier='admin' -> liberado
//   - tier='pro' -> liberado
//   - tier='premium' -> liberado
//   - tier='expired' -> CTA upgrade
//
// Em paralelo, mesmo conectado ao Spotify Premium, se tier Grindfy bloqueia,
// dialog mostra empty-state com CTA contextual ('Reative seu plano' ou
// 'Upgrade Premium').
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

let mockTier: string = "premium";
let mockConnected: boolean = true;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { userPlatformId: "USER-0001", subscriptionPlan: mockTier },
    isAuthenticated: true,
    isAdmin: mockTier === "admin",
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/hooks/useSpotifyStatus", () => ({
  useSpotifyStatus: () => ({
    isConnected: mockConnected,
    productTier: mockConnected ? "premium" : null,
    displayName: "T",
    isLoading: false,
  }),
}));

vi.mock("@/lib/audio-engine/spotifyApiClient", () => ({
  searchTracks: vi.fn(),
  listPlaylists: vi.fn(),
  listPlaylistTracks: vi.fn(),
  spotifyKeys: {
    search: (q: string) => ["spotify", "search", q],
    playlists: () => ["spotify", "playlists"],
    playlistTracks: (id: string) => ["spotify", "playlist", id, "tracks"],
  },
}));

vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/contexts/AudioPlayerContext", () => ({
  useAudioPlayer: () => ({
    playTrack: vi.fn(),
    addToQueue: vi.fn(() => true),
    activeTrack: null, activeSource: null, isPlaying: false,
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

beforeEach(() => {
  mockTier = "premium";
  mockConnected = true;
});

// =============================================================================

describe("SpotifySearchDialog — tier gate (RF-01 + §8)", () => {
  it("tier='free' -> CTA upgrade visivel, sem tabs", async () => {
    mockTier = "free";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-upgrade-cta")).toBeInTheDocument();
    });
    // tabs nao devem renderizar (ou se renderizam, search input nao acessivel)
    expect(screen.queryByTestId("spotify-search-input")).toBeNull();
  });

  it("tier='trial' liberado (Q1 default)", async () => {
    mockTier = "trial";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("spotify-upgrade-cta")).toBeNull();
  });

  it("tier='admin' liberado", async () => {
    mockTier = "admin";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
  });

  it("tier='pro' liberado", async () => {
    mockTier = "pro";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
  });

  it("tier='premium' liberado", async () => {
    mockTier = "premium";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-search-input")).toBeInTheDocument();
    });
  });

  it("tier='expired' -> CTA upgrade", async () => {
    mockTier = "expired";
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      expect(screen.getByTestId("spotify-upgrade-cta")).toBeInTheDocument();
    });
  });

  it("Spotify NAO conectado (mesmo Premium Grindfy) -> empty-state connect CTA", async () => {
    mockTier = "premium";
    mockConnected = false;
    const { SpotifySearchDialog } = loadDialog();
    render(wrap(<SpotifySearchDialog open={true} onOpenChange={() => {}} />));
    await waitFor(() => {
      const cta = screen.queryByTestId("spotify-connect-cta")
        ?? screen.queryByText(/conecte.*spotify/i);
      expect(cta).toBeTruthy();
    });
  });
});
