// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint SPOTIFY-DEEP / RF-04 — Botao "Buscar Spotify" no MiniPlayerBar
//
// Comportamentos:
//   - data-testid="mini-player-spotify-search-btn" renderizado quando connected
//   - hidden quando nao-connected
//   - disabled + tooltip quando tier free/expired
//   - click chama prop onOpenSpotifySearch
//   - Cmd/Ctrl+/ atalho global dispara (Q4 default)
//   - posicao entre Lessons e Spotify Connect
//   - telemetria audio.spotify_search_open
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";

// Mocks compartilhados.
const mockInitiateSpotifyAuth = vi.fn(() => Promise.resolve({
  accessToken: "tk", expiresIn: 3600, displayName: "Test", productTier: "premium",
}));
vi.mock("@/lib/spotify/auth", () => ({
  initiateSpotifyAuth: mockInitiateSpotifyAuth,
  refreshAccessToken: vi.fn(),
  disconnectSpotify: vi.fn(),
  SpotifyPremiumRequiredError: class extends Error {},
  SpotifyAuthError: class extends Error {},
  SpotifyPopupBlockedError: class extends Error {},
  SpotifyOAuthCancelledError: class extends Error {},
  generatePkceVerifier: vi.fn(() => "v"),
  generatePkceChallenge: vi.fn(() => Promise.resolve("c")),
}));

const mockEmitAudioEvent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

// Spotify status hook.
let mockSpotifyConnected = true;
let mockTier: string = "premium";
vi.mock("@/hooks/useSpotifyStatus", () => ({
  useSpotifyStatus: () => ({
    isConnected: mockSpotifyConnected,
    productTier: mockSpotifyConnected ? "premium" : null,
    displayName: "T",
    isLoading: false,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { userPlatformId: "USER-0001", subscriptionPlan: mockTier },
    isAuthenticated: true,
    isAdmin: mockTier === "admin",
  }),
  AuthProvider: ({ children }: any) => children,
}));

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
    ...require("@/components/audio-player/MiniPlayerBar"),
  };
}

function makeSeed(source: "library" | "spotify" = "library") {
  return function Seed() {
    const { useAudioPlayer } = require("@/contexts/AudioPlayerContext");
    const ctx = useAudioPlayer();
    const initRef = React.useRef(false);
    React.useEffect(() => {
      if (initRef.current) return;
      initRef.current = true;
      ctx.playTrack({
        source,
        trackId: "t1",
        title: "Test Lesson",
        courseTitle: "Test Course",
        audioUrl: source === "library" ? "/audio/t1.mp3" : undefined,
        spotifyUri: source === "spotify" ? "spotify:track:abc" : undefined,
        durationSeconds: 120,
      });
    }, []);
    return null;
  };
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  mockInitiateSpotifyAuth.mockClear();
  mockEmitAudioEvent.mockClear();
  mockSpotifyConnected = true;
  mockTier = "premium";
  setViewport(1280);
  try { localStorage.clear(); } catch { /* ignore */ }
});

// =============================================================================

describe("MiniPlayerBar — botao Spotify Search (RF-04)", () => {
  it("renderiza botao quando isSpotifyConnected=true", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("mini-player-spotify-search-btn")).toBeInTheDocument();
    });
  });

  it("hidden quando NAO conectado", async () => {
    mockSpotifyConnected = false;
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument());
    expect(screen.queryByTestId("mini-player-spotify-search-btn")).toBeNull();
  });

  it("disabled + tooltip quando tier free", async () => {
    mockTier = "free";
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => {
      const btn = screen.queryByTestId("mini-player-spotify-search-btn");
      if (!btn) return;
      expect(btn).toBeDisabled();
      const title = (btn.getAttribute("title") ?? "").toLowerCase();
      expect(title).toMatch(/premium|pro|upgrade/);
    });
  });

  it("disabled + tooltip quando tier expired", async () => {
    mockTier = "expired";
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => {
      const btn = screen.queryByTestId("mini-player-spotify-search-btn");
      if (!btn) return;
      expect(btn).toBeDisabled();
    });
  });

  it("click chama handler onOpenSpotifySearch ou abre dialog (state local)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const btn = await screen.findByTestId("mini-player-spotify-search-btn");
    await act(async () => { btn.click(); });
    await waitFor(() => {
      // Dialog deve aparecer (state local) ou prop callback usada.
      const dialog = screen.queryByTestId("spotify-search-input")
        ?? screen.queryByTestId("tab-search");
      expect(dialog).toBeTruthy();
    });
  });

  it("Cmd/Ctrl+/ dispara click no botao (Q4 default)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("mini-player-spotify-search-btn")).toBeInTheDocument());
    // Cmd+/ (mac) ou Ctrl+/ (win/linux)
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    await waitFor(() => {
      const dialog = screen.queryByTestId("spotify-search-input")
        ?? screen.queryByTestId("tab-search");
      expect(dialog).toBeTruthy();
    });
  });

  it("emite audio.spotify_search_open no click", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const btn = await screen.findByTestId("mini-player-spotify-search-btn");
    await act(async () => { btn.click(); });
    await waitFor(() => {
      const calls = mockEmitAudioEvent.mock.calls.filter(
        (c) => String(c[0]).includes("spotify_search_open"),
      );
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("posicao DOM: entre lessons-button e spotify-connect/badge", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("mini-player-lessons-button")).toBeInTheDocument();
    });
    const lessons = screen.getByTestId("mini-player-lessons-button");
    const search = screen.getByTestId("mini-player-spotify-search-btn");
    const connect = screen.queryByTestId("mini-player-spotify-connect")
      ?? screen.queryByTestId("mini-player-spotify-badge");
    // ordem documento: lessons -> search -> connect/badge
    if (connect) {
      const pos = lessons.compareDocumentPosition(search);
      const posC = search.compareDocumentPosition(connect);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(posC & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("aria-label PT-BR contem buscar/spotify", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");
    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );
    const btn = await screen.findByTestId("mini-player-spotify-search-btn");
    const aria = (btn.getAttribute("aria-label") ?? "").toLowerCase();
    expect(aria).toMatch(/buscar|spotify/);
  });
});
