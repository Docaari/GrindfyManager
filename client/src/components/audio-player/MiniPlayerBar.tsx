// MiniPlayerBar — Sprint Mini Player 1 / RF-01..RF-13.
// Barra persistente cross-page (renderizada em App.tsx dentro do
// AudioPlayerProvider). 9 controles + keyboard shortcuts + glassmorphism +
// responsive 3 breakpoints (mobile <768 / tablet 768-1023 / desktop >=1024).

import React, { useEffect, useState } from "react";
import {
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { useMiniPlayerHeight } from "@/hooks/useMiniPlayerHeight";
import { sanitizeCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
import { cn } from "@/lib/utils";
import { VolumeControl } from "./VolumeControl";
// Sprint Mini Player 2 (CRITICAL-2) — Sleep Timer control wired in mini player.
import { SleepTimerControl } from "./SleepTimerControl";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

type Viewport = "mobile" | "tablet" | "desktop";

function detectViewport(): Viewport {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth ?? 1024;
  if (w >= 1024) return "desktop";
  if (w >= 768) return "tablet";
  return "mobile";
}

function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(detectViewport);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setVp(detectViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return vp;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
      }
    } catch {
      // ignore
    }
  }, []);
  return reduced;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.isContentEditable === true) return true;
  const ce = typeof el.getAttribute === "function" ? el.getAttribute("contenteditable") : null;
  return ce === "" || ce === "true";
}

export function MiniPlayerBar() {
  const {
    activeTrack,
    isPlaying,
    currentSeconds,
    durationSeconds,
    displayMode,
    speed,
    toggle,
    close,
    seek,
    setSpeed,
    skipBack,
    skipForward,
    playNext,
    playPrevious,
    toggleMute,
    setDisplayMode,
    courseContext,
    // Sprint Mini Player 2 (CRITICAL-2 + RF-NEW.1).
    sleepTimerMinutes,
    sleepTimerRemainingSeconds,
    setSleepTimer,
    cancelSleepTimer,
  } = useAudioPlayer();

  const vp = useViewport();
  const reducedMotion = usePrefersReducedMotion();
  // Sets CSS variable --mini-player-height for layouts that reserve space
  // via `padding-bottom: var(--mini-player-height)` (RF-11).
  useMiniPlayerHeight();

  // === Keyboard shortcuts (RF-13) ===
  useEffect(() => {
    if (displayMode === "hidden") return;
    const handler = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipBack(15);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipForward(15);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (displayMode === "expanded") {
          setDisplayMode("bar");
        } else {
          close();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    displayMode,
    toggle,
    skipBack,
    skipForward,
    toggleMute,
    setDisplayMode,
    close,
  ]);

  if (displayMode === "hidden" || !activeTrack) return null;

  const sanitizedCoverUrl = sanitizeCoverUrl(activeTrack.coverUrl);
  const hasPrev = !!(courseContext && courseContext.currentIndex > 0);
  const hasNext = !!(
    courseContext &&
    courseContext.currentIndex < (courseContext.lessons?.length ?? 0) - 1
  );
  const showPrevNext = vp === "desktop";
  const showVolume = vp !== "mobile";
  const showSpeed = vp !== "mobile";

  // Prev: if currentSeconds > 3, seek to 0; else playPrevious.
  function handlePrev() {
    if (currentSeconds > 3) {
      seek(0);
    } else {
      playPrevious();
    }
  }
  const prevDisabled = !hasPrev && currentSeconds <= 3;
  const nextDisabled = !hasNext;

  return (
    <div
      data-testid="mini-player-bar"
      role="complementary"
      aria-label="Player de audio persistente"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className={
        "fixed bottom-0 left-0 right-0 z-40 px-3 py-2 flex items-center gap-3 " +
        "bg-gray-900/60 backdrop-blur-glass border-t border-white/10 text-white mini-player-bar" +
        (reducedMotion ? " motion-reduce" : "")
      }
      style={{
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {sanitizedCoverUrl ? (
          <img
            src={sanitizedCoverUrl}
            alt=""
            className={cn(
              "w-12 h-12 rounded-md object-cover mini-player-cover",
              isPlaying && !reducedMotion && "animate-spin-slow",
            )}
          />
        ) : (
          <div className="w-12 h-12 rounded-md bg-gray-700 mini-player-cover" />
        )}
        <div className="min-w-0">
          <div className="text-sm text-white truncate">
            {activeTrack.title ?? ""}
          </div>
          {activeTrack.courseTitle ? (
            <div className="text-xs text-gray-400 truncate">
              {activeTrack.courseTitle}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {showPrevNext && (
          <button
            type="button"
            data-testid="mini-player-prev"
            aria-label="Aula anterior"
            title="Aula anterior"
            className="p-2 hover:bg-white/10 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handlePrev}
            disabled={prevDisabled}
          >
            <SkipBack className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          data-testid="mini-player-back15"
          aria-label="Voltar 15 segundos"
          title="Voltar 15s"
          className="p-2 hover:bg-white/10 rounded-md text-white"
          onClick={() => skipBack(15)}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          data-testid="mini-player-toggle"
          aria-label={isPlaying ? "Pausar" : "Tocar"}
          title={isPlaying ? "Pausar (Espaco)" : "Tocar (Espaco)"}
          className="p-2 hover:bg-white/10 rounded-md text-white"
          onClick={() => toggle()}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button
          type="button"
          data-testid="mini-player-forward15"
          aria-label="Avancar 15 segundos"
          title="Avancar 15s"
          className="p-2 hover:bg-white/10 rounded-md text-white"
          onClick={() => skipForward(15)}
        >
          <RotateCw className="w-4 h-4" />
        </button>
        {showPrevNext && (
          <button
            type="button"
            data-testid="mini-player-next"
            aria-label="Proxima aula"
            title="Proxima aula"
            className="p-2 hover:bg-white/10 rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => playNext()}
            disabled={nextDisabled}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        )}
      </div>

      <input
        data-testid="mini-player-seek"
        aria-label="Posicao na aula"
        type="range"
        min={0}
        max={Math.max(durationSeconds || 0, 1)}
        step={1}
        value={Math.min(currentSeconds || 0, durationSeconds || 0)}
        onChange={(e) => seek(parseFloat(e.target.value))}
        className="flex-1 mx-2"
      />

      <div className="flex items-center gap-1">
        {showVolume && <VolumeControl hideSlider={vp === "tablet"} />}
        {showSpeed && (
          <select
            data-testid="mini-player-speed"
            aria-label={`Velocidade ${speed}x`}
            title={`Velocidade ${speed}x`}
            className="bg-transparent text-white text-xs border border-white/20 rounded px-2 py-1"
            value={String(speed)}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={String(s)}>
                {s}x
              </option>
            ))}
          </select>
        )}
        {/* CRITICAL-2 + RF-NEW.1: Sleep Timer control entre velocidade e close. */}
        <SleepTimerControl
          activeMinutes={sleepTimerMinutes}
          remainingSeconds={sleepTimerRemainingSeconds}
          onActivate={setSleepTimer}
          onCancel={cancelSleepTimer}
        />
        <button
          type="button"
          data-testid="mini-player-expand"
          aria-label="Expandir player"
          title="Expandir"
          className="p-2 hover:bg-white/10 rounded-md text-white"
          onClick={() => setDisplayMode("expanded")}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          data-testid="mini-player-close"
          aria-label="Fechar player"
          title="Fechar (Esc)"
          className="p-2 hover:bg-white/10 rounded-md text-white ml-1"
          onClick={() => close()}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
