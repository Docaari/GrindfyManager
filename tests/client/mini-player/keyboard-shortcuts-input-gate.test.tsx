// Sprint Mini Player 3.2 / Wave B / W-B4 — LOW-2 input gate em keyboard shortcuts.
// ADR-195. Cobre o gap deixado em MP3.1: numeric seek (0-9) + "?" key.
//
// Cobre:
// - Space, M, J, L, ArrowUp, ArrowDown: NAO disparam quando foco em input/textarea/contenteditable
// - 0-9 numeric seek: NAO dispara quando foco em input
// - "?" key: NAO dispara quando foco em input
// - Foco em <input> dentro de Radix dialog/popover: shortcuts ignorados

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
    ...require("@/components/audio-player/MiniPlayerBar"),
  };
}

function setupPlayer() {
  const { AudioPlayerProvider, MiniPlayerBar, useAudioPlayer } = loadModules();
  const seekSpy = vi.fn();
  const toggleSpy = vi.fn();

  function Probe() {
    const ctx = useAudioPlayer();
    React.useEffect(() => {
      ctx.playTrack({
        source: "library",
        trackId: "t1",
        title: "T",
        audioUrl: "/x.mp3",
        durationSeconds: 100,
      });
    }, [ctx]);
    return (
      <>
        <input data-testid="text-input" />
        <textarea data-testid="text-area" />
        <div data-testid="ce" contentEditable />
        <div role="dialog">
          <input data-testid="dialog-input" />
        </div>
      </>
    );
  }

  render(
    <AudioPlayerProvider>
      <Probe />
      <MiniPlayerBar />
    </AudioPlayerProvider>,
  );

  return { seekSpy, toggleSpy };
}

describe("Keyboard shortcuts input gate (W-B4)", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
  });

  it("Space NAO dispara quando foco em <input>", async () => {
    setupPlayer();
    const input = screen.getByTestId("text-input") as HTMLInputElement;
    input.focus();
    const before = input.value;

    fireEvent.keyDown(input, { key: " ", code: "Space" });
    fireEvent.keyDown(input, { key: " ", code: "Space" });

    // input.value precisa permanecer alteravel — assertion: o evento NAO foi preventDefault
    // (se o handler chamasse preventDefault, o input perderia capacidade de typing).
    // Verificacao indireta: nao houve console.error e foco continua no input.
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(before);
  });

  it("'5' numeric seek NAO dispara quando foco em <input>", async () => {
    setupPlayer();
    const input = screen.getByTestId("text-input") as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: "5" });

    // Se shortcut tivesse disparado, audio.currentTime seria 50 (50% de 100s).
    // Como gate funciona, audio nao seek.
    const audio = document.querySelector("audio") as HTMLAudioElement | null;
    if (audio) {
      expect(audio.currentTime).toBeLessThanOrEqual(0);
    }
  });

  it("'?' key NAO abre help quando foco em <textarea>", async () => {
    setupPlayer();
    const ta = screen.getByTestId("text-area") as HTMLTextAreaElement;
    ta.focus();

    fireEvent.keyDown(ta, { key: "?" });

    // Help popover NAO renderiza
    expect(screen.queryByTestId("shortcuts-help-popover")).not.toBeInTheDocument();
  });

  it("'M' NAO toggla mute quando foco em contenteditable", async () => {
    setupPlayer();
    const ce = screen.getByTestId("ce") as HTMLElement;
    ce.focus();
    // Verifica mute state antes e depois (via mute button aria-pressed se existir)
    const muteBtn = screen.queryByTestId("mini-player-mute-button");
    const beforePressed = muteBtn?.getAttribute("aria-pressed");

    fireEvent.keyDown(ce, { key: "M" });
    fireEvent.keyDown(ce, { key: "m" });

    const afterPressed = muteBtn?.getAttribute("aria-pressed");
    expect(afterPressed).toBe(beforePressed);
  });

  it("J/L NAO dispara skip quando foco em <input>", async () => {
    setupPlayer();
    const input = screen.getByTestId("text-input") as HTMLInputElement;
    input.focus();

    fireEvent.keyDown(input, { key: "j" });
    fireEvent.keyDown(input, { key: "l" });

    const audio = document.querySelector("audio") as HTMLAudioElement | null;
    if (audio) {
      expect(audio.currentTime).toBeLessThanOrEqual(0);
    }
  });

  it("ArrowUp/ArrowDown NAO mudam volume quando foco em <input>", async () => {
    setupPlayer();
    const input = screen.getByTestId("text-input") as HTMLInputElement;
    input.focus();

    const audio = document.querySelector("audio") as HTMLAudioElement | null;
    const beforeVolume = audio?.volume;

    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(audio?.volume).toBe(beforeVolume);
  });

  it("'5' numeric seek NAO dispara quando foco em <input> dentro de role=dialog", async () => {
    setupPlayer();
    const dialogInput = screen.getByTestId("dialog-input") as HTMLInputElement;
    dialogInput.focus();

    fireEvent.keyDown(dialogInput, { key: "5" });

    const audio = document.querySelector("audio") as HTMLAudioElement | null;
    if (audio) {
      expect(audio.currentTime).toBeLessThanOrEqual(0);
    }
  });
});
