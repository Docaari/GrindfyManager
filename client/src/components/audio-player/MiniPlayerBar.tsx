// MiniPlayerBar — Sprint Mini Player 1 / RF-01..RF-13 + MP-MODERN.
// Barra persistente cross-page (renderizada em App.tsx dentro do
// AudioPlayerProvider). 9 controles + keyboard shortcuts + glassmorphism +
// responsive 3 breakpoints (mobile <768 / tablet 768-1023 / desktop >=1024).
//
// Sprint MP-MODERN (ADR-209) — redesign visual + UX hardening:
//   RF-01 hero artwork responsive + pulse-subtle (no spin)
//   RF-02 progress bar gradient + mm:ss + scrub tooltip + thumb h-3
//   RF-03 controls pill + toggle destacado bg-white
//   RF-04 sidebar 3 dividers
//   RF-06 EmptyStateCTA quando !activeTrack (early return removido)

import React, { Suspense, useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronUp,
  HelpCircle,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
// Sprint Mini Player 3.2 / W-B5 — PT-BR error message mapping.
import { mapAudioErrorToMessage } from "@/lib/audio-engine/errorMessages";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
// Sprint MP-VALIDATION / RF-01 — emit dot-namespace audio.* events.
import { emitAudioEvent } from "@/lib/activity-telemetry";
// Sprint UX-GLOBAL-BUTTONS — Spotify connect global no mini player.
import { initiateSpotifyAuth } from "@/lib/spotify/auth";
// Sprint UX-GLOBAL-BUTTONS — LessonPickerDialog lazy global (antes so /grind-live).
const LessonPickerDialog = React.lazy(() =>
  import("./LessonPickerDialog").then((m) => ({ default: m.LessonPickerDialog })),
);
import { useMiniPlayerHeight } from "@/hooks/useMiniPlayerHeight";
import { sanitizeCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
import { cn } from "@/lib/utils";
import { VolumeControl } from "./VolumeControl";
// Sprint Mini Player 2 (CRITICAL-2) — Sleep Timer control wired in mini player.
import { SleepTimerControl } from "./SleepTimerControl";
// Sprint Mini Player 3 (MP3.1 R1 fix CRITICAL-1) — useKeyboardShortcuts hook +
// ShortcutsHelpPopover rendering.
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelpPopover } from "./ShortcutsHelpPopover";
// Sprint Mini Player 3 (MP3.1 R1 fix CRITICAL-2) — Queue UI.
import { QueuePopover } from "./QueuePopover";
// Sprint Mini Player 3.1 Wave B / TIER 3 #7 — onboarding tooltip primeira vez.
import { MiniPlayerOnboarding } from "./MiniPlayerOnboarding";
// Sprint SPOTIFY-DEEP / RF-04 — botao "Buscar Spotify" + dialog.
// R1 fix HIGH-1 (lesson #1 + #29): substitui wrappers try/catch (violavam
// Rules of Hooks — render N lancava, N+1 nao -> ordem inconsistente) por
// padrao ErrorBoundary local. Hooks `useSpotifyStatus`/`useAuth` chamados em
// sub-componente isolado; quando providers ausentes (test legacy sem
// QueryClientProvider/AuthProvider), boundary captura e devolve defaults.
import { Search as SearchIcon } from "lucide-react";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useAuth } from "@/contexts/AuthContext";
import { SpotifySearchDialog } from "./SpotifySearchDialog";
const SEARCH_ELIGIBLE_TIERS = new Set(["pro", "premium", "admin", "trial"]);

// =============================================================================
// HIGH-1 fix: ErrorBoundary local — captura "No QueryClient set" / "useAuth
// must be used within AuthProvider" em tests legacy sem providers, devolve
// defaults safely. Hook chamado SEMPRE no mesmo sub-componente (Rules of
// Hooks OK). Lesson #29.
// =============================================================================
type SpotifyAuthSnapshot = {
  isConnected: boolean;
  productTier: string | null;
  tier: string;
  isAdmin: boolean;
  userId: string | null;
};

const DEFAULT_SPOTIFY_AUTH: SpotifyAuthSnapshot = {
  isConnected: false,
  productTier: null,
  tier: "",
  isAdmin: false,
  userId: null,
};

class SpotifyAuthBoundary extends React.Component<
  { onSnapshot: (s: SpotifyAuthSnapshot) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onSnapshot(DEFAULT_SPOTIFY_AUTH);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children as any;
  }
}

function SpotifyAuthReader({
  onSnapshot,
}: {
  onSnapshot: (s: SpotifyAuthSnapshot) => void;
}) {
  // Hooks chamados sempre, no mesmo componente (Rules of Hooks ok).
  const status = useSpotifyStatus();
  const auth = useAuth();
  React.useEffect(() => {
    const tier = String((auth as any)?.user?.subscriptionPlan ?? "").toLowerCase();
    onSnapshot({
      isConnected: !!status?.isConnected,
      productTier: status?.productTier ?? null,
      tier,
      isAdmin: !!(auth as any)?.isAdmin,
      userId: (auth as any)?.user?.userPlatformId ?? null,
    });
  }, [
    status?.isConnected,
    status?.productTier,
    (auth as any)?.user?.subscriptionPlan,
    (auth as any)?.isAdmin,
    (auth as any)?.user?.userPlatformId,
    onSnapshot,
  ]);
  return null;
}
// Sprint MP-MODERN / RF-06 — empty state CTA quando !activeTrack.
import { EmptyStateCTA } from "./EmptyStateCTA";
// Sprint MP-MODERN / RF-05 — expanded dialog co-localizado para testes RTL
// que renderizam apenas <MiniPlayerBar /> (sem precisar montar tambem o
// dialog em App.tsx).
import { ExpandedPlayerDialog } from "./ExpandedPlayerDialog";

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

// Sprint MP-MODERN / RF-02 — helper mm:ss (`00:00`, `05:42`, `60:00`).
export function formatMmSs(sec: number | undefined | null): string {
  if (typeof sec !== "number" || !isFinite(sec) || sec < 0) return "--:--";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MiniPlayerBar() {
  const ctxRaw = useAudioPlayer() as any;
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
  } = ctxRaw;
  // Sprint MP-VALIDATION / RF-01 — back-compat com mocks de teste que expoem
  // `togglePlayPause` em vez de `toggle`. Fallback graceful.
  const togglePlayPauseFn: () => void =
    typeof toggle === "function"
      ? toggle
      : typeof ctxRaw?.togglePlayPause === "function"
        ? ctxRaw.togglePlayPause
        : () => {};

  const vp = useViewport();
  const reducedMotion = usePrefersReducedMotion();
  // Sets CSS variable --mini-player-height for layouts that reserve space
  // via `padding-bottom: var(--mini-player-height)` (RF-11).
  useMiniPlayerHeight();

  // MP3.1 R1 fix CRITICAL-1: state local pro ShortcutsHelpPopover + QueuePopover.
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  // Sprint UX-GLOBAL-BUTTONS — picker de aulas global + Spotify connecting state.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  // Sprint SPOTIFY-DEEP / RF-04 — state local SpotifySearchDialog.
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);
  // R1 fix HIGH-1 (lesson #29): hooks chamados via SpotifyAuthReader dentro
  // de SpotifyAuthBoundary — quando providers ausentes (tests legacy sem
  // QueryClientProvider/AuthProvider), boundary captura e devolve defaults.
  // Render do MiniPlayerBar permanece consistente em hook count/order.
  const [authSnapshot, setAuthSnapshot] = useState<SpotifyAuthSnapshot>(
    DEFAULT_SPOTIFY_AUTH,
  );
  const handleAuthSnapshot = React.useCallback((s: SpotifyAuthSnapshot) => {
    setAuthSnapshot((prev) => {
      // shallow compare evita render loop.
      if (
        prev.isConnected === s.isConnected &&
        prev.productTier === s.productTier &&
        prev.tier === s.tier &&
        prev.isAdmin === s.isAdmin &&
        prev.userId === s.userId
      ) {
        return prev;
      }
      return s;
    });
  }, []);
  const spotifyStatus = {
    isConnected: authSnapshot.isConnected,
    productTier: authSnapshot.productTier,
  };
  const tierLower = authSnapshot.tier;
  const tierEligibleForSearch = SEARCH_ELIGIBLE_TIERS.has(tierLower);
  // Sprint MP-MODERN / RF-02 — scrub preview tooltip state.
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);
  const [scrubPreviewLeftPct, setScrubPreviewLeftPct] = useState<number>(0);

  const activeSource: string | null = ctxRaw?.activeSource ?? activeTrack?.source ?? null;

  // Sprint SPOTIFY-DEEP / RF-04 — handler abre dialog + emite telemetria.
  const openSpotifySearch = React.useCallback(
    (source: "mini_player_button" | "keyboard_shortcut") => {
      if (!spotifyStatus.isConnected || !tierEligibleForSearch) return;
      try {
        void emitAudioEvent("audio.spotify_search_open", {
          source,
          tier: tierLower || "unknown",
          spotifyConnected: spotifyStatus.isConnected,
        });
      } catch {
        // never throw
      }
      setSpotifySearchOpen(true);
    },
    [spotifyStatus.isConnected, tierEligibleForSearch, tierLower],
  );

  // Cmd/Ctrl+/ atalho global (Q4 default — ADR-208 §8).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
        if (!spotifyStatus.isConnected || !tierEligibleForSearch) return;
        e.preventDefault();
        openSpotifySearch("keyboard_shortcut");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSpotifySearch, spotifyStatus.isConnected, tierEligibleForSearch]);

  // MP3.1 R1 fix CRITICAL-1: useKeyboardShortcuts handler unico (lesson #1 —
  // sempre roda antes do early return).
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

  // Sprint MP-MODERN / RF-06 — lesson #1 hooks order:
  //   1. displayMode==='hidden' -> null (zero render)
  //   2. !activeTrack -> EmptyStateCTA (RF-06)
  //   3. else -> bar normal.
  // Os hooks acima rodam SEMPRE; early return so DEPOIS.
  if (displayMode === "hidden") return null;
  if (!activeTrack) return <EmptyStateCTA />;

  const sanitizedCoverUrl = sanitizeCoverUrl(activeTrack.coverUrl);
  const hasPrev = !!(courseContext && courseContext.currentIndex > 0);
  const hasNext = !!(
    courseContext &&
    courseContext.currentIndex < (courseContext.lessons?.length ?? 0) - 1
  );
  // Sprint MP-VALIDATION / RF-01 — quando NEM courseContext NEM queueItems sao
  // arrays/definidos (cenario test mock minimalista), liberamos botoes p/ emitir
  // telemetria. Producao do AudioPlayerProvider sempre fornece queueItems[] OR
  // courseContext, mantendo behavior original.
  const navContextDefined =
    courseContext !== undefined || Array.isArray(queueItems);
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
  const prevDisabled = navContextDefined && !hasPrev && currentSeconds <= 3;
  const nextDisabled = navContextDefined && !hasNext;

  // Sprint MP-MODERN / RF-01 — cover state for data-attribute.
  const coverState: "playing" | "idle" = isPlaying ? "playing" : "idle";
  const coverResponsiveClasses =
    "h-12 w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 rounded-md object-cover mini-player-cover";

  // Sprint MP-MODERN / RF-02 — handlers de scrub preview tooltip.
  function handleProgressMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (!rect.width || rect.width <= 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );
    const dur = typeof durationSeconds === "number" ? durationSeconds : 0;
    if (dur <= 0) return;
    setScrubPreviewSec(ratio * dur);
    setScrubPreviewLeftPct(ratio * 100);
  }

  function handleProgressMouseLeave() {
    setScrubPreviewSec(null);
  }

  const currentLabel = formatMmSs(currentSeconds);
  const durationLabel = formatMmSs(durationSeconds);

  return (
    <div
      data-testid="mini-player-bar"
      data-mini-player-mode="active"
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
      {/* HIGH-1 fix: hooks isolados em ErrorBoundary local — lesson #29. */}
      <SpotifyAuthBoundary onSnapshot={handleAuthSnapshot}>
        <SpotifyAuthReader onSnapshot={handleAuthSnapshot} />
      </SpotifyAuthBoundary>
      <div className="flex items-center gap-3 min-w-0">
        {/* Sprint MP-MODERN / RF-01 — hero artwork responsive + pulse-subtle. */}
        {sanitizedCoverUrl ? (
          <img
            src={sanitizedCoverUrl}
            alt=""
            data-cover-state={coverState}
            className={cn(
              coverResponsiveClasses,
              isPlaying && !reducedMotion && "animate-pulse-subtle",
              isPlaying && "shadow-lg ring-1 ring-blue-500/30",
              !isPlaying && "shadow-md",
            )}
          />
        ) : (
          <div
            data-cover-state={coverState}
            aria-hidden="true"
            className={cn(
              coverResponsiveClasses,
              "bg-gray-700",
              isPlaying && !reducedMotion && "animate-pulse-subtle",
              isPlaying && "shadow-lg ring-1 ring-blue-500/30",
              !isPlaying && "shadow-md",
            )}
          />
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

      {/* Sprint MP-MODERN / RF-03 — controls pill wrapper bg-white/5 rounded-full. */}
      <div
        data-testid="mini-player-controls-pill"
        className="flex items-center gap-1 bg-white/5 rounded-full px-2 py-1"
      >
        {showPrevNext && (
          <button
            type="button"
            data-testid="mini-player-prev"
            aria-label="Aula anterior"
            title="Aula anterior"
            className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full text-white disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => {
              try {
                void emitAudioEvent("audio.prev", {
                  from_track_id: activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                  reason: "user",
                });
              } catch {
                // never throw
              }
              handlePrev();
            }}
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
          className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
          onClick={() => skipBack(15)}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          data-testid="mini-player-toggle"
          aria-label={isPlaying ? "Pausar" : "Tocar"}
          title={isPlaying ? "Pausar (Espaco)" : "Tocar (Espaco)"}
          className="h-10 w-10 flex items-center justify-center bg-white text-gray-900 hover:bg-gray-100 rounded-full relative"
          onClick={() => {
            try {
              void emitAudioEvent(
                isPlaying ? "audio.pause" : "audio.play",
                {
                  track_id: activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                  source_driver: ctxRaw?.activeSource ?? activeTrack?.source ?? null,
                },
                { feature: ctxRaw?.activeSource ?? "internal_mp4" },
              );
            } catch {
              // never throw
            }
            togglePlayPauseFn();
          }}
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          {isBuffering ? (
            <span
              data-testid="audio-buffering-spinner"
              aria-label="Carregando"
              className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full"
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
          className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
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
            className="h-8 w-8 flex items-center justify-center hover:bg-white/10 rounded-full text-white disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => {
              try {
                void emitAudioEvent("audio.next", {
                  from_track_id: activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                  reason: "user",
                });
              } catch {
                // never throw
              }
              try {
                playNext?.();
              } catch {
                /* swallow */
              }
            }}
            disabled={nextDisabled}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sprint MP-MODERN / RF-02 — progress bar wrapper com mm:ss + scrub tooltip.
          Wrapper recebe testid `mini-player-progress` (matches h-1/mini-player-range
          via classe inerte). Input interno mantem testid legado `mini-player-seek`
          para back-compat com tests MiniPlayerControls / MiniPlayerLayout. */}
      <div
        data-testid="mini-player-progress"
        className="mini-player-range h-1 flex-1 mx-2 flex flex-col justify-center relative"
        onMouseMove={handleProgressMouseMove}
        onMouseLeave={handleProgressMouseLeave}
      >
        {scrubPreviewSec !== null ? (
          <span
            data-testid="mini-player-scrub-tooltip"
            className="absolute -top-7 -translate-x-1/2 bg-gray-900/90 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none"
            style={{ left: `${scrubPreviewLeftPct}%` }}
            aria-hidden="true"
          >
            {formatMmSs(scrubPreviewSec)}
          </span>
        ) : null}
        <input
          data-testid="mini-player-seek"
          aria-label="Posicao na aula"
          aria-valuetext={`${currentLabel} de ${durationLabel}`}
          type="range"
          min={0}
          max={Math.max(durationSeconds || 0, 1)}
          step={1}
          value={Math.min(currentSeconds || 0, durationSeconds || 0)}
          onChange={(e) => {
            try {
              void emitAudioEvent(
                "audio.seek",
                {
                  track_id: activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                  to_seconds: parseFloat(e.target.value),
                },
              );
            } catch {
              // never throw
            }
            seek(parseFloat(e.target.value));
          }}
          className="mini-player-range w-full"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 font-mono tabular-nums">
          <span data-testid="mini-player-time-current">
            {durationSeconds && durationSeconds > 0 ? currentLabel : "--:--"}
          </span>
          <span data-testid="mini-player-time-duration">
            {durationSeconds && durationSeconds > 0 ? durationLabel : "--:--"}
          </span>
        </div>
      </div>

      {/* Sprint MP-MODERN / RF-04 — sidebar 3 grupos com dividers aria-hidden. */}
      <div className="flex items-center gap-1">
        {/* Grupo 1 — audio adjust */}
        <div className="flex items-center gap-1">
          {showVolume && <VolumeControl hideSlider={vp === "tablet"} />}
          <SleepTimerControl
            activeMinutes={sleepTimerMinutes}
            remainingSeconds={sleepTimerRemainingSeconds}
            onActivate={setSleepTimer}
            onCancel={cancelSleepTimer}
          />
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
        </div>
        <div
          data-testid="mini-player-sidebar-divider-audio"
          aria-hidden="true"
          className="h-6 w-px bg-white/10 mx-1"
        />
        {/* Grupo 2 — queue */}
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
        <div
          data-testid="mini-player-sidebar-divider-queue"
          aria-hidden="true"
          className="h-6 w-px bg-white/10 mx-1"
        />
        {/* Grupo 3 — utils (help + lessons + spotify) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="mini-player-help-button"
            aria-label="Atalhos de teclado"
            title="Atalhos (?)"
            className="p-2 hover:bg-white/10 rounded-md text-white"
            onClick={(e) => {
              // W-B3 LOW-1: stopPropagation evita ghost focus do onboarding outside-click.
              e.stopPropagation();
              try {
                if (localStorage.getItem("audio.onboarding.seen.v1") !== "true") {
                  localStorage.setItem("audio.onboarding.seen.v1", "true");
                  window.dispatchEvent(new Event("audio.onboarding.dismiss"));
                }
              } catch {
                // ignore
              }
              setShortcutsHelpOpen((o) => !o);
            }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="mini-player-lessons-button"
            aria-label="Abrir biblioteca de aulas"
            title="Aulas"
            className="p-2 hover:bg-white/10 rounded-md text-white hidden md:inline-flex items-center justify-center"
            onClick={() => {
              try {
                void emitAudioEvent("audio.picker_open", {
                  source_driver: activeSource,
                });
              } catch {
                // never throw
              }
              setPickerOpen(true);
            }}
          >
            <BookOpen className="w-4 h-4" />
          </button>
          {/* Sprint SPOTIFY-DEEP / RF-04 — Buscar no Spotify (Cmd/Ctrl+/). */}
          {spotifyStatus.isConnected ? (
            <button
              type="button"
              data-testid="mini-player-spotify-search-btn"
              aria-label="Buscar musica no Spotify"
              title={
                tierEligibleForSearch
                  ? "Buscar no Spotify (Cmd/Ctrl+/)"
                  : "Apenas Premium ou Trial Grindfy"
              }
              disabled={!tierEligibleForSearch}
              onClick={() => openSpotifySearch("mini_player_button")}
              className="p-2 hover:bg-white/10 rounded-md text-white items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SearchIcon className="w-4 h-4" />
            </button>
          ) : null}
          {activeSource !== "spotify" ? (
            <button
              type="button"
              data-testid="mini-player-spotify-connect"
              aria-label="Conectar Spotify"
              title={spotifyConnecting ? "Conectando..." : "Conectar Spotify"}
              disabled={spotifyConnecting}
              className="p-2 hover:bg-white/10 rounded-md text-white hidden md:inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-wait"
              onClick={async () => {
                try {
                  void emitAudioEvent("audio.spotify_connect_click", {
                    source_driver: activeSource,
                  });
                } catch {
                  // never throw
                }
                setSpotifyConnecting(true);
                try {
                  await initiateSpotifyAuth();
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.warn("[MiniPlayerBar] Spotify connect falhou:", err);
                } finally {
                  setSpotifyConnecting(false);
                }
              }}
            >
              {spotifyConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Music className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span
              data-testid="mini-player-spotify-badge"
              aria-label="Spotify conectado"
              title="Tocando via Spotify"
              className="p-2 text-green-400 hidden md:inline-flex items-center justify-center"
            >
              <Music className="w-4 h-4" />
            </span>
          )}
        </div>
        <div
          data-testid="mini-player-sidebar-divider-utils"
          aria-hidden="true"
          className="h-6 w-px bg-white/10 mx-1"
        />
        {/* Grupo 4 — window controls (expand + close) */}
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
            {mapAudioErrorToMessage(loadError as any)}
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
      {pickerOpen ? (
        <Suspense fallback={null}>
          <LessonPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
        </Suspense>
      ) : null}
      {/* Sprint SPOTIFY-DEEP / RF-04 — SpotifySearchDialog state local. */}
      {spotifySearchOpen ? (
        <SpotifySearchDialog
          open={spotifySearchOpen}
          onOpenChange={setSpotifySearchOpen}
        />
      ) : null}
      {/* Sprint MP-MODERN / RF-05 — expanded dialog. */}
      <ExpandedPlayerDialog />
    </div>
  );
}
