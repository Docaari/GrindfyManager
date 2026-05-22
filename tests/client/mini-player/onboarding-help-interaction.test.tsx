// Sprint Mini Player 3.2 / Wave B / W-B3 — LOW-1 stopPropagation onboarding "?" click.
// RED PHASE — stopPropagation handler nao adicionado ainda.
//
// Decisao founder: click no help "?" durante onboarding ativo:
//   - help abre (popover visivel)
//   - onboarding dismiss (tooltip some)
// NAO bloquear abertura do help. Sequencial: ambos efeitos.

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React from "react";

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
    ...require("@/components/audio-player/MiniPlayerBar"),
    ...require("@/components/audio-player/MiniPlayerOnboarding"),
    ...require("@/components/audio-player/ShortcutsHelpPopover"),
  };
}

describe("Onboarding + help button interaction (W-B3)", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
    vi.useRealTimers();
  });

  it("click no help icon '?' durante onboarding: help abre + onboarding dismiss", async () => {
    const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerOnboarding } = loadModules();

    function Seed() {
      const { useAudioPlayer } = require("@/contexts/AudioPlayerContext");
      const ctx = useAudioPlayer();
      React.useEffect(() => {
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T",
          audioUrl: "/x.mp3",
        });
      }, [ctx]);
      return null;
    }

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
        <MiniPlayerOnboarding />
      </AudioPlayerProvider>,
    );

    // Aguarda onboarding aparecer (use useEffect roda no mount)
    await waitFor(() => {
      expect(screen.queryByTestId("audio-onboarding-tooltip")).toBeInTheDocument();
    });

    // Avancar o delay de 300ms para listeners click attached (lesson HIGH-2)
    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(310);
    });
    vi.useRealTimers();

    // Click no botao de help — usar testid se existir, fallback aria-label
    const helpBtn =
      screen.queryByTestId("mini-player-help-button") ??
      screen.queryByRole("button", { name: /atalhos/i });

    expect(helpBtn).not.toBeNull();
    await act(async () => {
      helpBtn!.click();
    });

    // Help popover aberto
    await waitFor(() => {
      expect(screen.queryByTestId("shortcuts-help-popover")).toBeInTheDocument();
    });

    // Onboarding dismissed
    await waitFor(() => {
      expect(screen.queryByTestId("audio-onboarding-tooltip")).not.toBeInTheDocument();
    });
  });

  it("flag onboarding.seen.v1 setada apos dismiss via click no help", async () => {
    const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerOnboarding } = loadModules();

    function Seed() {
      const { useAudioPlayer } = require("@/contexts/AudioPlayerContext");
      const ctx = useAudioPlayer();
      React.useEffect(() => {
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T",
          audioUrl: "/x.mp3",
        });
      }, [ctx]);
      return null;
    }

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
        <MiniPlayerOnboarding />
      </AudioPlayerProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("audio-onboarding-tooltip")).toBeInTheDocument();
    });

    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(310);
    });
    vi.useRealTimers();

    const helpBtn =
      screen.queryByTestId("mini-player-help-button") ??
      screen.queryByRole("button", { name: /atalhos/i });

    await act(async () => {
      helpBtn!.click();
    });

    await waitFor(() => {
      expect(localStorage.getItem("audio.onboarding.seen.v1")).toBe("true");
    });
  });

  it("click no help apos onboarding ja seen: nao tenta dismiss novamente", async () => {
    localStorage.setItem("audio.onboarding.seen.v1", "true");
    const { AudioPlayerProvider, MiniPlayerBar, MiniPlayerOnboarding } = loadModules();

    function Seed() {
      const { useAudioPlayer } = require("@/contexts/AudioPlayerContext");
      const ctx = useAudioPlayer();
      React.useEffect(() => {
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T",
          audioUrl: "/x.mp3",
        });
      }, [ctx]);
      return null;
    }

    render(
      <AudioPlayerProvider>
        <Seed />
        <MiniPlayerBar />
        <MiniPlayerOnboarding />
      </AudioPlayerProvider>,
    );

    // Onboarding NAO deve aparecer
    expect(screen.queryByTestId("audio-onboarding-tooltip")).not.toBeInTheDocument();

    const helpBtn =
      screen.queryByTestId("mini-player-help-button") ??
      screen.queryByRole("button", { name: /atalhos/i });

    await act(async () => {
      helpBtn!.click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("shortcuts-help-popover")).toBeInTheDocument();
    });
  });
});
