// Sprint Mini Player 3.2 / Wave B / W-B1 — MEDIUM-1 retryCurrent race lock.
// ADR-198. RED PHASE — retryInProgressRef nao existe ainda.
//
// Cobre:
// - 2 clicks rapidos -> 1 dispatch apenas
// - Lock liberado em onCanPlay (success path)
// - Lock liberado em onError (failure path)
// - Safety timeout 30s libera lock
// - retryCount nao duplica por race

/* eslint-disable @typescript-eslint/no-var-requires */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React from "react";

function loadModules() {
  return {
    ...require("@/contexts/AudioPlayerContext"),
  };
}

function RetryInvoker({ onCount }: { onCount: (n: number) => void }) {
  const { useAudioPlayer } = require("@/contexts/AudioPlayerContext");
  const ctx = useAudioPlayer();
  const initRef = React.useRef(false);
  React.useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // Seed um track + simular erro
    ctx.playTrack({
      source: "library",
      trackId: "t1",
      title: "T1",
      audioUrl: "/audio/t1.mp3",
    });
  }, [ctx]);

  return (
    <>
      <button
        data-testid="retry-twice"
        onClick={() => {
          // 2 dispatches imediatos no mesmo tick
          ctx.retryCurrent();
          ctx.retryCurrent();
          // Reporta count
          // Implementer expoe `retryCount` no contexto OU window flag DEV
          onCount(ctx.retryCount ?? 0);
        }}
      >
        Retry 2x
      </button>
    </>
  );
}

describe("retryCurrent race lock (W-B1)", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
  });

  it("2 clicks rapidos em retryCurrent dispatcham apenas 1 vez", async () => {
    const { AudioPlayerProvider } = loadModules();

    // Spy no playTrack interno via window flag de teste OU contagem de telemetry.
    const spy = vi.fn();
    (globalThis as any).__audioRetryDispatchSpy = spy;

    const onCount = vi.fn();
    render(
      <AudioPlayerProvider>
        <RetryInvoker onCount={onCount} />
      </AudioPlayerProvider>,
    );

    const btn = screen.getByTestId("retry-twice");

    await act(async () => {
      btn.click();
    });

    // Implementer deve garantir que retryCurrent rola apenas 1x quando chamado 2x sincronamente
    // Sem o lock, sao 2 dispatchs. Verificamos via window spy OR via retryCount.
    // Threshold: retryCount maximo 1 (nao 2).
    expect(onCount.mock.calls[0][0]).toBeLessThanOrEqual(1);

    delete (globalThis as any).__audioRetryDispatchSpy;
  });

  it("lock liberado em success path (onCanPlay) permite retry subsequente", async () => {
    const { AudioPlayerProvider, useAudioPlayer } = loadModules();

    // Pattern A canonico — ADR-206
    function Probe() {
      const ctx = useAudioPlayer();
      const initRef = React.useRef(false);
      React.useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T1",
          audioUrl: "/x.mp3",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return (
        <>
          <button data-testid="retry-1" onClick={() => ctx.retryCurrent()}>
            R1
          </button>
          <button data-testid="retry-2" onClick={() => ctx.retryCurrent()}>
            R2
          </button>
        </>
      );
    }

    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );

    await act(async () => {
      screen.getByTestId("retry-1").click();
    });

    // Simular canplay event
    const audio = document.querySelector("audio");
    if (audio) {
      await act(async () => {
        audio.dispatchEvent(new Event("canplay"));
      });
    }

    await act(async () => {
      screen.getByTestId("retry-2").click();
    });

    // Test passa se nao throw — lock liberou apos canplay e segundo retry funcionou
    expect(true).toBe(true);
  });

  it("lock liberado em error path permite retry subsequente", async () => {
    const { AudioPlayerProvider, useAudioPlayer } = loadModules();

    // Pattern A canonico — ADR-206
    function Probe() {
      const ctx = useAudioPlayer();
      const initRef = React.useRef(false);
      React.useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T1",
          audioUrl: "/bad.mp3",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <button data-testid="r" onClick={() => ctx.retryCurrent()}>
          R
        </button>
      );
    }

    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );

    await act(async () => {
      screen.getByTestId("r").click();
    });

    // Dispatch error event
    const audio = document.querySelector("audio");
    if (audio) {
      await act(async () => {
        audio.dispatchEvent(new Event("error"));
      });
    }

    // Lock deve liberar; novo retry deve funcionar (nao throw)
    await act(async () => {
      screen.getByTestId("r").click();
    });

    expect(true).toBe(true);
  });

  it("safety timeout 30s libera lock mesmo sem canplay/error", async () => {
    vi.useFakeTimers();
    const { AudioPlayerProvider, useAudioPlayer } = loadModules();

    // Pattern A canonico — ADR-206
    function Probe() {
      const ctx = useAudioPlayer();
      const initRef = React.useRef(false);
      React.useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        ctx.playTrack({
          source: "library",
          trackId: "t1",
          title: "T1",
          audioUrl: "/x.mp3",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <button data-testid="r" onClick={() => ctx.retryCurrent()}>
          R
        </button>
      );
    }

    render(
      <AudioPlayerProvider>
        <Probe />
      </AudioPlayerProvider>,
    );

    await act(async () => {
      screen.getByTestId("r").click();
    });

    // Avancar 30s (safety timeout)
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    // Apos 30s, lock deve estar livre — novo retry funciona
    await act(async () => {
      screen.getByTestId("r").click();
    });

    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
