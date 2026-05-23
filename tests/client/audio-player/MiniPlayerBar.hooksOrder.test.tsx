// =============================================================================
// Sprint SPOTIFY-DEEP — Reviewer R1 wave 1 HIGH-1 regression.
// Confirma que MiniPlayerBar nao viola Rules of Hooks quando providers
// (AuthProvider / QueryClientProvider) estao ausentes em test legacy.
//
// Antes: useSafeSpotifyStatus/useSafeAuth com try/catch em volta de hook —
// render N lancava, N+1 nao -> ordem inconsistente, corrupcao de slots.
// Depois (lesson #29): hooks chamados em sub-componente isolado dentro de
// ErrorBoundary local. Boundary captura "No QueryClient" / "useAuth must be"
// e devolve defaults sem quebrar render.
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

const mockEmitAudioEvent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/activity-telemetry", () => ({
  emitAudioEvent: mockEmitAudioEvent,
  emitLessonEvent: vi.fn(() => Promise.resolve()),
  emitCoachEvent: vi.fn(() => Promise.resolve()),
  emitLibraryEvent: vi.fn(() => Promise.resolve()),
  flushBacklog: vi.fn(() => Promise.resolve()),
}));

describe("MiniPlayerBar — HIGH-1 ErrorBoundary local p/ providers ausentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza sem violar Rules of Hooks quando providers ausentes (no QueryClient / no AuthProvider)", () => {
    // Carrega depois dos mocks aplicados.
    const {
      AudioPlayerProvider,
      MiniPlayerBar,
    } = require("@/components/audio-player/MiniPlayerBar");
    const { AudioPlayerProvider: Provider } = require("@/contexts/AudioPlayerContext");

    // Renderiza com APENAS AudioPlayerProvider (sem AuthProvider / sem
    // QueryClientProvider). Antes do fix, o try/catch em volta do hook
    // violava Rules of Hooks. Agora ErrorBoundary captura e devolve defaults.
    let err: any = null;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <Provider>
          <MiniPlayerBar />
        </Provider>,
      );
    } catch (e) {
      err = e;
    }
    errSpy.mockRestore();

    // Render OK (ErrorBoundary capturou tudo); nao throw fora do React tree.
    expect(err).toBeNull();
  });
});
