// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint micro UX-FIX — MiniPlayerBar global buttons (Aulas + Spotify)
//
// Bug founder: mini player nao tem como abrir picker de aulas (so /grind-live)
// + nao tem como conectar Spotify (so /coach-ai). UX gap.
//
// Fix: adicionar 2 botoes globais no MiniPlayerBar:
//   1. Botao "Aulas" (data-testid="mini-player-lessons-button") -> abre
//      LessonPickerDialog global (mesmo dialog existente em /grind-live).
//      State local no MiniPlayerBar.
//   2. Botao "Conectar Spotify" (data-testid="mini-player-spotify-connect") ->
//      renderiza condicional quando activeSource !== 'spotify' (nao-connected).
//      Click chama initiateSpotifyAuth() direto. Quando activeSource==='spotify',
//      em vez disso renderiza badge (data-testid="mini-player-spotify-badge").
//
// Targets (TDD red — devem todos FALHAR ate implementer adicionar):
//   - data-testid="mini-player-lessons-button" + aria-label
//   - data-testid="lesson-picker-dialog" (ja existe — abrir/fechar state local)
//   - data-testid="mini-player-spotify-connect" + aria-label
//   - data-testid="mini-player-spotify-badge"
//   - telemetria audio.picker_open + audio.spotify_connect_click
//   - viewport mobile: ambos botoes ocultos
//
// Lessons CLAUDE.md §9 respeitadas:
//   - #14/#38: require() no top-level (PADRAO existente em tests/client/mini-player/*)
//   - #28: vi.mock por path exato (@/lib/spotify/auth + @/lib/activity-telemetry)
//   - #29: AudioPlayerProvider montado direto (sem ErrorBoundary necessario aqui)
//   - #30: jsdom (este arquivo eh .test.tsx, ja em projeto client)
//
// Sobre activeSource vs driver: o sprint pediu `driver` mas o context shape
// usa `activeSource: AudioTrackSource | null` derivado de `activeTrack.source`
// ('library' | 'spotify' | null). MiniPlayerBar le `ctxRaw?.activeSource`
// (linha 291-293). Tests usam `activeSource` para refletir o context real.
//
// ADR-207: novos eventos `audio.picker_open` + `audio.spotify_connect_click`
// precisam ser adicionados em shared/activity-event-names.ts CANONICAL_EVENT_NAMES
// pelo IMPLEMENTER (test usa string literal — emitAudioEvent valida apenas
// regex EVENT_NAME_REGEX, nao a const list).
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — declarados ANTES do require() do MiniPlayerBar (vi.mock hoisting OK
// porque referencia const exportada pelo modulo mockado, nao TDZ — lesson #14
// nao se aplica aqui porque NAO ha spy const top-level referenciado dentro do
// factory; usamos vi.fn() inline + getter por path).
// ---------------------------------------------------------------------------

// Spotify auth mock — lesson #28: path EXATO igual ao import do MiniPlayerBar.
const mockInitiateSpotifyAuth = vi.fn(() => Promise.resolve({
  accessToken: "tk",
  expiresIn: 3600,
  displayName: "Test User",
  productTier: "premium",
}));

vi.mock("@/lib/spotify/auth", () => ({
  initiateSpotifyAuth: mockInitiateSpotifyAuth,
  // Re-exports placeholder pra evitar quebra se algo mais importar:
  refreshAccessToken: vi.fn(),
  disconnectSpotify: vi.fn(),
  SpotifyPremiumRequiredError: class extends Error {},
  SpotifyAuthError: class extends Error {},
  SpotifyPopupBlockedError: class extends Error {},
  SpotifyOAuthCancelledError: class extends Error {},
  generatePkceVerifier: vi.fn(() => "v"),
  generatePkceChallenge: vi.fn(() => Promise.resolve("c")),
}));

// Activity telemetry mock — spy emitAudioEvent (lesson #28: path exato).
const mockEmitAudioEvent = vi.fn(() => Promise.resolve());

vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
    ...require("@/components/audio-player/MiniPlayerBar"),
  };
}

// Pattern A canonico — ADR-206 (useRef flag + deps []).
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  };
}

function setViewport(width: number) {
  // jsdom innerWidth setter
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  // fire resize so useViewport recalcula
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  mockInitiateSpotifyAuth.mockClear();
  mockEmitAudioEvent.mockClear();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  // Reset viewport p/ desktop (>=1024) — botoes globais visiveis.
  setViewport(1280);
});

// =============================================================================
// Botao "Aulas" — abre LessonPickerDialog
// =============================================================================

describe("MiniPlayerBar — botao Aulas (UX-FIX)", () => {
  it("renderiza botao com data-testid='mini-player-lessons-button' + aria-label PT-BR", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    const btn = screen.getByTestId("mini-player-lessons-button");
    expect(btn).toBeInTheDocument();
    // aria-label PT-BR (RNF-07 paridade outros botoes do mini player).
    const aria = btn.getAttribute("aria-label") ?? "";
    expect(aria.toLowerCase()).toMatch(/aula|biblioteca/);
  });

  it("click abre LessonPickerDialog (data-testid='lesson-picker-dialog' presente)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    // Dialog NAO renderizado inicialmente.
    expect(screen.queryByTestId("lesson-picker-dialog")).toBeNull();

    const btn = screen.getByTestId("mini-player-lessons-button");
    await act(async () => {
      btn.click();
    });

    // Apos click, dialog deve aparecer.
    await waitFor(() => {
      expect(screen.getByTestId("lesson-picker-dialog")).toBeInTheDocument();
    });
  });

  it("emite telemetria 'audio.picker_open' ao clicar (ADR-207 dot-namespace)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    mockEmitAudioEvent.mockClear();

    const btn = screen.getByTestId("mini-player-lessons-button");
    await act(async () => {
      btn.click();
    });

    // Eventos do play inicial podem ter sido emitidos antes — filtramos.
    const calls = mockEmitAudioEvent.mock.calls;
    const pickerOpenCall = calls.find((c) => c[0] === "audio.picker_open");
    expect(pickerOpenCall).toBeDefined();
  });

  it("mini player renderiza com activeTrack (gate linha 173) — pre-condicao", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    // SEM Seed -> sem activeTrack -> mini player NAO renderiza -> botao NAO existe.
    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    expect(screen.queryByTestId("mini-player-bar")).toBeNull();
    expect(screen.queryByTestId("mini-player-lessons-button")).toBeNull();
  });
});

// =============================================================================
// Botao "Conectar Spotify"
// =============================================================================

describe("MiniPlayerBar — botao Conectar Spotify (UX-FIX)", () => {
  it("quando activeSource='library' (nao-spotify): renderiza botao 'mini-player-spotify-connect'", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    const btn = screen.getByTestId("mini-player-spotify-connect");
    expect(btn).toBeInTheDocument();
    const aria = btn.getAttribute("aria-label") ?? "";
    expect(aria.toLowerCase()).toMatch(/spotify/);

    // Badge NAO deve estar renderizada quando ainda nao-conectado.
    expect(screen.queryByTestId("mini-player-spotify-badge")).toBeNull();
  });

  it("quando activeSource='spotify' (conectado): renderiza badge 'mini-player-spotify-badge' (sem botao connect)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("spotify");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    // Badge presente
    expect(screen.getByTestId("mini-player-spotify-badge")).toBeInTheDocument();

    // Botao connect AUSENTE quando ja conectado
    expect(screen.queryByTestId("mini-player-spotify-connect")).toBeNull();
  });

  it("click no botao connect dispara initiateSpotifyAuth()", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-spotify-connect")).toBeInTheDocument();
    });

    mockInitiateSpotifyAuth.mockClear();

    const btn = screen.getByTestId("mini-player-spotify-connect");
    await act(async () => {
      btn.click();
    });

    await waitFor(() => {
      expect(mockInitiateSpotifyAuth).toHaveBeenCalledTimes(1);
    });
  });

  it("emite telemetria 'audio.spotify_connect_click' ao clicar (ADR-207 dot-namespace)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-spotify-connect")).toBeInTheDocument();
    });

    mockEmitAudioEvent.mockClear();

    const btn = screen.getByTestId("mini-player-spotify-connect");
    await act(async () => {
      btn.click();
    });

    const calls = mockEmitAudioEvent.mock.calls;
    const connectClickCall = calls.find(
      (c) => c[0] === "audio.spotify_connect_click",
    );
    expect(connectClickCall).toBeDefined();
  });
});

// =============================================================================
// Responsive (mobile gate)
// =============================================================================

describe("MiniPlayerBar — viewport gate global buttons (UX-FIX)", () => {
  it("mobile (<768): ESCONDE botao Aulas + botao Spotify Connect", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();
    const Seed = makeSeed("library");

    // Set viewport mobile ANTES do render (useViewport pega via state inicial).
    setViewport(500);

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    // Paridade com mini-player-queue-button (linha 388-405: `hidden md:inline-flex`
    // -> testes RTL usam `screen.queryByTestId` que retorna null quando display:none
    // OR quando o nodo nem renderiza. Aqui esperamos NAO renderizar OR display:none
    // via classe `hidden`. Implementer pode escolher: viewport check no render
    // (return null when vp === 'mobile') OR classe `hidden md:inline-flex`.
    //
    // Cobrimos AMBAS estrategias com offsetParent === null (CSS hidden vira null,
    // nodo ausente tambem dispara branch de queryByTestId nulo).
    const lessonsBtn = screen.queryByTestId("mini-player-lessons-button");
    const spotifyBtn = screen.queryByTestId("mini-player-spotify-connect");

    if (lessonsBtn) {
      // Renderizado -> precisa estar oculto via classe `hidden` (md:inline-flex)
      // OR atributo hidden.
      expect(
        lessonsBtn.className.includes("hidden") ||
          (lessonsBtn as any).hidden === true,
      ).toBe(true);
    } else {
      expect(lessonsBtn).toBeNull();
    }

    if (spotifyBtn) {
      expect(
        spotifyBtn.className.includes("hidden") ||
          (spotifyBtn as any).hidden === true,
      ).toBe(true);
    } else {
      expect(spotifyBtn).toBeNull();
    }
  });
});
