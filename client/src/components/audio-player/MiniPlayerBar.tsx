// MiniPlayerBar — Sprint Mini Player 1 / RF-01..RF-13.
// Barra persistente cross-page (renderizada em App.tsx dentro do
// AudioPlayerProvider). 9 controles + keyboard shortcuts + glassmorphism +
// responsive 3 breakpoints (mobile <768 / tablet 768-1023 / desktop >=1024).

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronUp,
  ListMusic,
  Loader2,
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
// Sprint Mini Player 3 (MP3.1 R1 fix CRITICAL-1) — useKeyboardShortcuts hook +
// ShortcutsHelpPopover rendering. Antes (MP3 R1) o hook existia mas nunca era
// montado; o handler inline MP1 ainda processava keys (sem J/L/0-9/?/setas
// cima-baixo + sem gate /admin/). Agora unificado via hook (ADR-195).
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelpPopover } from "./ShortcutsHelpPopover";
// Sprint Mini Player 3 (MP3.1 R1 fix CRITICAL-2) — Queue UI.
import { QueuePopover } from "./QueuePopover";
// Sprint Mini Player 3.1 Wave B / TIER 3 #7 — onboarding tooltip primeira vez.
import { MiniPlayerOnboarding } from "./MiniPlayerOnboarding";

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
    // MP3.1 R1 fix CRITICAL-1: volume + setVolume pra useKeyboardShortcuts.
    volume,
    setVolume,
    // MP3.1 R1 fix CRITICAL-2: queue surface.
    queueItems,
    repeatMode,
    shuffleEnabled,
    removeFromQueue,
    clearQueue,
    setRepeatMode,
    toggleShuffle,
    skipToQueueItem,
    reorderQueue,
    // MP3.1 Wave B / TIER 3 #5 + #6.
    loadError,
    retryCurrent,
    clearLoadError,
    isBuffering,
  } = useAudioPlayer();

  const vp = useViewport();
  const reducedMotion = usePrefersReducedMotion();
  // Sets CSS variable --mini-player-height for layouts that reserve space
  // via `padding-bottom: var(--mini-player-height)` (RF-11).
  useMiniPlayerHeight();

  // MP3.1 R1 fix CRITICAL-1: state local pro ShortcutsHelpPopover + QueuePopover.
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // MP3.1 R1 fix CRITICAL-1: useKeyboardShortcuts handler unico (substitui
  // inline MP1). Adiciona J/L (-10s/+10s), 0-9 (% seek), ArrowUp/Down (volume),
  // ? (toggle help) + gate /admin/* (ADR-195).
  useKeyboardShortcuts({
    toggle,
    skipBack,
    skipForward,
    setVolume,
    volume,
    toggleMute,
    seek,
    durationSeconds,
    displayMode: displayMode as any,
    setDisplayMode: setDisplayMode as any,
    close,
    shortcutsHelpOpen,
    setShortcutsHelpOpen,
  });

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
          className="p-2 hover:bg-white/10 rounded-md text-white relative"
          onClick={() => toggle()}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          {isBuffering ? (
            <span
              data-testid="audio-buffering-spinner"
              aria-label="Carregando"
              className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
          ) : null}
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
        {/* MP3 RF-02: Spotify SDK setSpeed no-op. Hide select para evitar UI mentirosa. */}
        {showSpeed && activeTrack?.source !== "spotify" && (
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
        {/* MP3.1 R1 fix CRITICAL-2: Queue button — abre QueuePopover.
            MP3.1 Wave B / INFO-NEW-3: viewport gate — esconde <768px (mobile). */}
        <button
          type="button"
          data-testid="mini-player-queue-button"
          aria-label="Fila de reproducao"
          title="Fila"
          className="p-2 hover:bg-white/10 rounded-md text-white relative hidden md:inline-flex items-center justify-center"
          onClick={() => setQueueOpen((o) => !o)}
        >
          <ListMusic className="w-4 h-4" />
          {queueItems && queueItems.length > 0 ? (
            <span
              data-testid="mini-player-queue-count"
              className="absolute -top-1 -right-1 rounded-full bg-blue-500 px-1 text-[10px] text-white"
            >
              {queueItems.length}
            </span>
          ) : null}
        </button>
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
      {/* MP3.1 Wave B / TIER 3 #5: error banner driver-agnostic. */}
      {loadError ? (
        <div
          data-testid="audio-error-banner"
          role="alert"
          className="absolute bottom-full left-0 right-0 mb-1 mx-3 flex items-center gap-2 rounded-md bg-red-600/90 px-3 py-2 text-xs text-white"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Erro ao carregar — {String(loadError)}
          </span>
          <button
            type="button"
            data-testid="audio-error-retry"
            className="px-2 py-1 rounded-md bg-white/15 hover:bg-white/25"
            onClick={() => retryCurrent()}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            data-testid="audio-error-skip"
            aria-label="Pular para proxima"
            className="px-2 py-1 rounded-md bg-white/15 hover:bg-white/25"
            onClick={() => {
              clearLoadError();
              playNext();
            }}
          >
            Pular
          </button>
        </div>
      ) : null}
      {/* MP3.1 R1 fix CRITICAL-1: ShortcutsHelpPopover toggla via tecla `?`. */}
      <ShortcutsHelpPopover
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
      />
      {/* MP3.1 Wave B / TIER 3 #7: onboarding tooltip primeira vez. */}
      <MiniPlayerOnboarding />
      {/* MP3.1 R1 fix CRITICAL-2: QueuePopover renderiza fila + controls. */}
      <QueuePopover
        open={queueOpen}
        onOpenChange={setQueueOpen}
        queue={(queueItems ?? []) as any}
        repeatMode={repeatMode}
        shuffleEnabled={shuffleEnabled}
        onRemove={removeFromQueue}
        onReorder={reorderQueue}
        onClear={clearQueue}
        onSkip={skipToQueueItem}
        onRepeatChange={setRepeatMode}
        onToggleShuffle={toggleShuffle}
      />
    </div>
  );
}
