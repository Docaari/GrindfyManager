// =============================================================================
// Fix-wave (pos-reviewer) — Sprint Spotify E2E / FIX-1 (HIGH).
//
// Integracao: a factory do driver (em AudioPlayerContext.connectSpotify ->
// engine.setSpotifyDriverFactory) DEVE repassar `onPremiumRequired` ao
// construtor do SpotifyAudioDriver. Antes do fix, a factory passava
// refresh/telemetry/onTokenRefreshed/onReconnectFailed mas NAO
// onPremiumRequired -> account_error durante playback nao disparava a UX de
// Premium (dead code no driver).
//
// Lesson #3 — assert de integracao real (nao mock idealizado do wiring):
// mockamos o Engine apenas para CAPTURAR a factory que o context injeta, e o
// SpotifyAudioDriver para CAPTURAR as deps do construtor; o resto do wiring
// (connectSpotify) eh o codigo de producao real.
//
// Lesson #38 — paridade de imports require()/await import no mesmo arquivo:
// aqui usamos so `await import` (sem React Context cruzado entre estilos).
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

// --- Captura da factory injetada pelo context na Engine. --------------------
const { capturedFactoryRef, capturedDriverDeps } = vi.hoisted(() => ({
  capturedFactoryRef: { current: null as null | ((track: any) => any) },
  capturedDriverDeps: { current: null as any },
}));

// Mock da Engine: registra a factory recebida via setSpotifyDriverFactory.
vi.mock("@/lib/audio-engine/AudioSourceEngine", () => {
  class FakeEngine {
    setSpotifyDriverFactory(factory: any) {
      capturedFactoryRef.current = factory;
    }
    setAudioElement() {}
    setOnDriverSwitch() {}
    on() {
      return () => {};
    }
    playTrack() {
      return Promise.resolve();
    }
    pause() {}
    seek() {}
    setVolume() {}
    setSpeed() {}
    getCurrentTime() {
      return 0;
    }
    getDuration() {
      return 0;
    }
    destroy() {}
  }
  return {
    AudioSourceEngine: FakeEngine,
    createAudioSourceEngine: (opts: any) => {
      const e = new FakeEngine();
      (e as any)._opts = opts;
      return e;
    },
  };
});

// Mock do driver: captura as deps do construtor (incl. onPremiumRequired).
vi.mock("@/lib/audio-engine/SpotifyAudioDriver", () => {
  class FakeSpotifyDriver {
    source = "spotify";
    constructor(deps: any) {
      capturedDriverDeps.current = deps;
    }
    connect() {
      return Promise.resolve();
    }
    load() {
      return Promise.resolve();
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
    seek() {}
    setVolume() {}
    setSpeed() {}
    getCurrentTime() {
      return 0;
    }
    getDuration() {
      return 0;
    }
    destroy() {}
    on() {
      return () => {};
    }
  }
  return { SpotifyAudioDriver: FakeSpotifyDriver };
});

// Auth/telemetria/queue/resume — stubs leves pra montar o provider.
vi.mock("@/lib/spotify/auth", () => ({
  invalidateSpotifyStatus: vi.fn(),
  refreshAccessToken: vi.fn(async () => ({ accessToken: "x", expiresIn: 3600 })),
  resolveViaStatusFallback: vi.fn(async () => null),
}));
vi.mock("@/lib/audio-telemetry", () => ({
  emitAudioEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(),
  _resetForTests: vi.fn(),
}));

let captured: any = null;

// Lesson #38 — para NAO criar 2 module records (require vs await import) e
// quebrar a identidade do React Context, o Capture recebe o hook do MESMO
// modulo carregado pelo teste (via prop), em vez de re-importar.
function makeCapture(useAudioPlayer: () => any) {
  return function Capture() {
    captured = useAudioPlayer();
    return null;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedFactoryRef.current = null;
  capturedDriverDeps.current = null;
  captured = null;
});

describe("AudioPlayerContext factory wire onPremiumRequired (FIX-1)", () => {
  it("factory repassa onPremiumRequired ao construtor do SpotifyAudioDriver", async () => {
    const mod = await import("@/contexts/AudioPlayerContext");
    const { AudioPlayerProvider, useAudioPlayer } = mod;
    const Capture = makeCapture(useAudioPlayer);

    render(
      <AudioPlayerProvider>
        <Capture />
      </AudioPlayerProvider>,
    );

    expect(captured).toBeTruthy();
    expect(typeof captured.connectSpotify).toBe("function");

    await act(async () => {
      captured.connectSpotify("ACCESS_X", 3600, "Founder");
    });

    // O context injetou a factory na Engine.
    expect(typeof capturedFactoryRef.current).toBe("function");

    // Invoca a factory (como a Engine faria ao tocar uma track Spotify).
    const driver = capturedFactoryRef.current!({
      source: "spotify",
      trackId: "spotify:track:abc",
      title: "X",
    });
    expect(driver).toBeTruthy();

    // ASSERT central: o construtor do driver recebeu onPremiumRequired.
    const deps = capturedDriverDeps.current;
    expect(deps).toBeTruthy();
    expect(typeof deps.onPremiumRequired).toBe("function");
    // E os outros callbacks continuam presentes (nao-regressao do wiring).
    expect(typeof deps.refresh).toBe("function");
    expect(typeof deps.telemetry).toBe("function");
    expect(typeof deps.onTokenRefreshed).toBe("function");
    expect(typeof deps.onReconnectFailed).toBe("function");
  });

  it("onPremiumRequired do driver seta loadError com mensagem PT-BR de Premium", async () => {
    const mod = await import("@/contexts/AudioPlayerContext");
    const { AudioPlayerProvider, useAudioPlayer } = mod;
    const Capture = makeCapture(useAudioPlayer);

    render(
      <AudioPlayerProvider>
        <Capture />
      </AudioPlayerProvider>,
    );

    await act(async () => {
      captured.connectSpotify("ACCESS_X", 3600, "Founder");
    });
    capturedFactoryRef.current!({
      source: "spotify",
      trackId: "spotify:track:abc",
      title: "X",
    });

    const deps = capturedDriverDeps.current;
    expect(deps?.onPremiumRequired).toBeTruthy();

    await act(async () => {
      deps.onPremiumRequired("Founder");
    });

    expect(captured.loadError).toMatch(/premium/i);
  });
});
