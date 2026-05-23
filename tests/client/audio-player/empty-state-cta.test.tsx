// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-MODERN — RF-06 EmptyStateCTA (bar reduced + 2 CTAs).
//
// Spec: Docs/specs/sprint-mp-modern.md §4 RF-06
// ADR: Docs/architecture/decisions/209-mini-player-modern-redesign.md D7
//
// Targets (todos red phase ate implementer remover early return + adicionar
// EmptyStateCTA em MiniPlayerBar):
//   - Remover early return `!activeTrack` em MiniPlayerBar (linha ~185)
//   - Quando !activeTrack && displayMode!=='hidden': renderiza EmptyStateCTA
//   - data-testid="mini-player-empty-cta" container
//   - 2 botoes: "Escolher aula" + "Conectar Spotify"
//   - "Escolher aula" abre LessonPickerDialog
//   - "Conectar Spotify" chama initiateSpotifyAuth (gated por activeSource)
//   - Telemetria: mini_player.empty_cta.{choose_lesson,spotify_connect}
//   - useMiniPlayerHeight retorna 48 quando empty, 80 quando active
//   - Lesson #1: hooks order preservada (early return so para hidden, APOS hooks)
//   - Reduced motion respeitado
//
// Lessons:
//   - #1 hooks order — MiniPlayerBar SO retorna null DEPOIS de TODOS os hooks
//   - #28 vi.mock path exato
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — lesson #28 path EXATO.
// ---------------------------------------------------------------------------

const mockInitiateSpotifyAuth = vi.fn(() => Promise.resolve({
  accessToken: "tk",
  expiresIn: 3600,
  displayName: "Test User",
  productTier: "premium",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
    ...require("@/components/audio-player/MiniPlayerBar"),
  };
}

function tryLoadHook() {
  try {
    return require("@/hooks/useMiniPlayerHeight");
  } catch {
    return null;
  }
}

function setReducedMotion(reduce: boolean) {
  (window as any).matchMedia = (query: string) => ({
    matches: reduce && /reduce/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  mockInitiateSpotifyAuth.mockClear();
  mockEmitAudioEvent.mockClear();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  // Default viewport desktop.
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1280,
  });
  setReducedMotion(false);
});

// =============================================================================
// RF-06 — Empty state rendering
// =============================================================================

describe("MiniPlayerBar — RF-06 empty state visibility", () => {
  it("renderiza EmptyStateCTA quando !activeTrack && displayMode!=='hidden'", () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    // O early return atual (`!activeTrack -> null`) DEVE ser removido.
    // Em vez disso, EmptyStateCTA renderiza.
    expect(screen.getByTestId("mini-player-empty-cta")).toBeInTheDocument();
  });

  it("NAO renderiza nada quando displayMode==='hidden' (mesmo sem track)", () => {
    const { AudioPlayerProvider, MiniPlayerBar, useAudioPlayer } = loadModules();

    function HiddenSeed() {
      const ctx = useAudioPlayer();
      const initRef = React.useRef(false);
      React.useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        ctx.setDisplayMode("hidden");
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <AudioPlayerProvider>
        <HiddenSeed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    expect(screen.queryByTestId("mini-player-empty-cta")).toBeNull();
    expect(screen.queryByTestId("mini-player-bar")).toBeNull();
  });

  it("NAO renderiza EmptyStateCTA quando activeTrack definido (renderiza bar normal)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar, useAudioPlayer } = loadModules();

    function ActiveSeed() {
      const ctx = useAudioPlayer();
      const initRef = React.useRef(false);
      React.useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "Aula",
          courseTitle: "Curso",
          audioUrl: "/a.mp3",
          durationSeconds: 60,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <AudioPlayerProvider>
        <ActiveSeed />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("mini-player-empty-cta")).toBeNull();
  });
});

// =============================================================================
// RF-06 — Mode data-attribute
// =============================================================================

describe("MiniPlayerBar — RF-06 data-mini-player-mode", () => {
  it("EmptyStateCTA tem data-mini-player-mode='empty'", () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    const empty = screen.getByTestId("mini-player-empty-cta");
    expect(empty.getAttribute("data-mini-player-mode")).toBe("empty");
  });
});

// =============================================================================
// RF-06 — Botoes CTA
// =============================================================================

describe("MiniPlayerBar — RF-06 botoes CTA", () => {
  it("botao 'Escolher aula' (data-testid='mini-player-empty-choose-lesson') sempre presente", () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    const btn = screen.getByTestId("mini-player-empty-choose-lesson");
    expect(btn).toBeInTheDocument();
    const text = (btn.textContent ?? "").toLowerCase();
    expect(text).toMatch(/escolher aula|aulas?/);
  });

  it("botao 'Conectar Spotify' presente quando activeSource !== 'spotify'", () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    // Sem track, activeSource eh null -> botao Conectar Spotify visivel.
    const btn = screen.getByTestId("mini-player-empty-spotify-connect");
    expect(btn).toBeInTheDocument();
  });

  it("click 'Escolher aula' abre LessonPickerDialog + emite telemetria mini_player.empty_cta.choose_lesson", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    expect(screen.queryByTestId("lesson-picker-dialog")).toBeNull();
    mockEmitAudioEvent.mockClear();

    const btn = screen.getByTestId("mini-player-empty-choose-lesson");
    await act(async () => {
      btn.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("lesson-picker-dialog")).toBeInTheDocument();
    });

    const calls = mockEmitAudioEvent.mock.calls;
    const ev = calls.find((c) => c[0] === "mini_player.empty_cta.choose_lesson");
    expect(ev).toBeDefined();
  });

  it("click 'Conectar Spotify' chama initiateSpotifyAuth + emite telemetria mini_player.empty_cta.spotify_connect", async () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    mockInitiateSpotifyAuth.mockClear();
    mockEmitAudioEvent.mockClear();

    const btn = screen.getByTestId("mini-player-empty-spotify-connect");
    await act(async () => {
      btn.click();
    });

    await waitFor(() => {
      expect(mockInitiateSpotifyAuth).toHaveBeenCalled();
    });

    const calls = mockEmitAudioEvent.mock.calls;
    const ev = calls.find((c) => c[0] === "mini_player.empty_cta.spotify_connect");
    expect(ev).toBeDefined();
  });
});

// =============================================================================
// RF-06 — Sem ChevronUp expand em empty mode
// =============================================================================

describe("MiniPlayerBar — RF-06 sem ChevronUp expand em empty mode", () => {
  it("data-testid='mini-player-expand' NAO renderiza em empty mode (nada a expandir)", () => {
    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    expect(screen.getByTestId("mini-player-empty-cta")).toBeInTheDocument();
    // Em empty mode nao ha ChevronUp (nao ha track para expandir).
    expect(screen.queryByTestId("mini-player-expand")).toBeNull();
  });
});

// =============================================================================
// RF-06 — useMiniPlayerHeight aware de activeTrack
// =============================================================================

describe("useMiniPlayerHeight — aware de activeTrack", () => {
  it("retorna 48 quando !activeTrack (empty), 80 quando ativo", () => {
    const hookMod = tryLoadHook();
    // O hook canonico expoe `getMiniPlayerHeight(active: boolean)` OU
    // constantes MINI_PLAYER_HEIGHT_EMPTY/_ACTIVE. Aceitamos qualquer
    // forma que retorne os 2 valores.
    const exposed: any = hookMod ?? {};
    if (typeof exposed.getMiniPlayerHeight === "function") {
      expect(exposed.getMiniPlayerHeight(false)).toBe(48);
      expect(exposed.getMiniPlayerHeight(true)).toBe(80);
    } else if (typeof exposed.MINI_PLAYER_HEIGHT_EMPTY !== "undefined") {
      expect(exposed.MINI_PLAYER_HEIGHT_EMPTY).toBe(48);
      expect(exposed.MINI_PLAYER_HEIGHT_ACTIVE).toBe(80);
    } else {
      // Implementer ainda nao expos contrato (red phase). Test falha.
      throw new Error(
        "useMiniPlayerHeight precisa expor getMiniPlayerHeight(active:boolean) OR MINI_PLAYER_HEIGHT_EMPTY/_ACTIVE",
      );
    }
  });
});

// =============================================================================
// RF-06 — Lesson #1 hooks order
// =============================================================================

describe("MiniPlayerBar — RF-06 hooks order (lesson #1)", () => {
  it("renderiza EmptyStateCTA sem violar Rules of Hooks (toggle activeTrack mid-mount nao crasha)", async () => {
    const { AudioPlayerProvider, MiniPlayerBar, useAudioPlayer } = loadModules();

    let triggerPlay: (() => void) | null = null;
    function Trigger() {
      const ctx = useAudioPlayer();
      React.useEffect(() => {
        triggerPlay = () => {
          ctx.playTrack({
            source: "library",
            trackId: "t1",
            title: "Aula",
            courseTitle: "Curso",
            audioUrl: "/a.mp3",
            durationSeconds: 60,
          });
        };
      });
      return null;
    }

    render(
      <AudioPlayerProvider>
        <Trigger />
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    // Inicio: empty state.
    expect(screen.getByTestId("mini-player-empty-cta")).toBeInTheDocument();

    // Disparar play -> activeTrack vira definido -> bar normal renderiza.
    await act(async () => {
      triggerPlay && triggerPlay();
    });

    await waitFor(() => {
      expect(screen.getByTestId("mini-player-bar")).toBeInTheDocument();
    });

    // Empty state desmonta sem error.
    expect(screen.queryByTestId("mini-player-empty-cta")).toBeNull();
  });
});

// =============================================================================
// RF-06 — Reduced motion
// =============================================================================

describe("MiniPlayerBar — RF-06 reduced motion", () => {
  it("EmptyStateCTA respeita reduced-motion (sem entry animation)", () => {
    setReducedMotion(true);

    const { AudioPlayerProvider, MiniPlayerBar } = loadModules();

    render(
      <AudioPlayerProvider>
        <MiniPlayerBar />
      </AudioPlayerProvider>,
    );

    const empty = screen.getByTestId("mini-player-empty-cta");
    expect(empty.getAttribute("data-reduced-motion")).toBe("true");
    const cls = empty.className ?? "";
    // Sem classes de entry animation (motion-safe).
    expect(cls).not.toMatch(/animate-in|slide-in|fade-in/);
  });
});
