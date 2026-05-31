// ExpandedPlayerDialog — Sprint MP-MODERN / RF-05.
//
// Substitui MiniPlayerExpanded.tsx (lista readonly) por Radix Dialog full-screen
// com hero cover + transcript preview MP3.2 + controles maiores + queue inline +
// course context + coach hint card dismissable + Link Wouter para /coach-ai.
//
// Spec: Docs/specs/sprint-mp-modern.md §4 RF-05
// ADR: Docs/architecture/decisions/209-mini-player-modern-redesign.md D5
//
// Lessons aplicadas:
//   - #29 ErrorBoundary local em sub-arvore opcional (transcript fetch).
//   - #23 Wouter v3 nested anchor — usar `<Link href="/coach-ai">label</Link>`.
//   - #1 hooks order — early returns somente DEPOIS de todos os hooks.

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { emitAudioEvent } from "@/lib/activity-telemetry";
import { sanitizeCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
import { cn } from "@/lib/utils";

const COACH_HINT_KEY = "coach_hint.expanded.seen.v1";

// =============================================================================
// Local ErrorBoundary (lesson #29) — protege sub-arvore opcional (transcript).
// =============================================================================
class LocalErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    // Best-effort log; nao crasha o parent.
    try {
      // eslint-disable-next-line no-console
      console.warn("[ExpandedPlayerDialog] LocalErrorBoundary captured:", error);
    } catch {
      // ignore
    }
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// =============================================================================
// usePrefersReducedMotion local — shipped pattern (mesmo do MiniPlayerBar).
// =============================================================================
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

// =============================================================================
// ExpandedPlayerDialog
// =============================================================================
export function ExpandedPlayerDialog() {
  const ctxRaw = useAudioPlayer() as any;
  const {
    activeTrack,
    displayMode,
    isPlaying,
    toggle,
    skipBack,
    skipForward,
    playNext,
    playPrevious,
    setDisplayMode,
    close,
    queueItems,
    skipToQueueItem,
  } = ctxRaw;

  const reducedMotion = usePrefersReducedMotion();
  const closeReasonRef = useRef<string | null>(null);
  const lastOpenRef = useRef<boolean>(false);

  const [coachHintDismissed, setCoachHintDismissed] = useState<boolean>(() => {
    try {
      if (typeof localStorage === "undefined") return false;
      return localStorage.getItem(COACH_HINT_KEY) === "true";
    } catch {
      return false;
    }
  });

  const open = displayMode === "expanded" && !!activeTrack;

  // Sprint MP-MODERN reviewer R1 HIGH-1: emit close inline em handlers
  // ao inves de useEffect cleanup. Cobre case `activeTrack=null mid-expanded`
  // (parent MiniPlayerBar unmount-cold) via useEffect cleanup return.
  const emitClose = useCallback((reason: string) => {
    if (!lastOpenRef.current) return;
    lastOpenRef.current = false;
    try {
      void emitAudioEvent("mini_player.expanded.close", { reason });
    } catch {
      // never throw
    }
  }, []);

  // Open telemetry — fire once per open transition.
  useEffect(() => {
    if (open && !lastOpenRef.current) {
      lastOpenRef.current = true;
      try {
        void emitAudioEvent("mini_player.expanded.open", {
          track_id: activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
          source_driver:
            ctxRaw?.activeSource ?? activeTrack?.source ?? null,
        });
      } catch {
        // never throw
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup: cobre unmount-cold (track terminou, parent dropou o dialog).
  useEffect(() => {
    return () => {
      if (lastOpenRef.current) emitClose("unmount");
    };
  }, [emitClose]);

  const handleMinimize = useCallback(() => {
    emitClose("minimize");
    try {
      setDisplayMode?.("bar");
    } catch {
      // ignore
    }
  }, [emitClose, setDisplayMode]);

  const handleCloseX = useCallback(() => {
    emitClose("close_x");
    try {
      close?.();
    } catch {
      // ignore
    }
  }, [emitClose, close]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        const reason = closeReasonRef.current ?? "overlay";
        closeReasonRef.current = null;
        emitClose(reason);
        try {
          setDisplayMode?.("bar");
        } catch {
          // ignore
        }
      }
    },
    [emitClose, setDisplayMode],
  );

  const handleEscape = useCallback(() => {
    closeReasonRef.current = "esc";
  }, []);

  const dismissCoachHint = useCallback(() => {
    setCoachHintDismissed(true);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(COACH_HINT_KEY, "true");
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCoachHintClick = useCallback(() => {
    try {
      void emitAudioEvent("mini_player.expanded.coach_hint.click", {});
    } catch {
      // never throw
    }
  }, []);

  if (!open) return null;

  const sanitizedCover = sanitizeCoverUrl(activeTrack.coverUrl);
  const transcriptionPreview: string | null | undefined =
    activeTrack.transcriptionPreview ?? null;
  const courseTitle: string | null = activeTrack.courseTitle ?? null;
  const moduleTitle: string | null = activeTrack.moduleTitle ?? null;

  const queue: any[] = Array.isArray(queueItems) ? queueItems : [];
  const visibleQueue = queue.slice(0, 10);
  const showQueueMoreCta = queue.length > 10;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[50] bg-black/60 backdrop-blur-sm",
            !reducedMotion &&
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          data-testid="mini-player-expanded-dialog"
          data-mini-player-mode="expanded"
          data-reduced-motion={reducedMotion ? "true" : "false"}
          aria-label="Player expandido"
          onEscapeKeyDown={handleEscape}
          className={cn(
            "fixed inset-0 z-[51] flex flex-col items-center overflow-y-auto p-6 bg-gray-900/95 text-white",
            !reducedMotion &&
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Player expandido
          </DialogPrimitive.Title>
          {/* Header — close + minimize */}
          <header className="w-full max-w-2xl flex justify-between items-center mb-6">
            <button
              type="button"
              data-testid="expanded-minimize"
              aria-label="Minimizar player"
              title="Minimizar"
              className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={handleMinimize}
            >
              <ChevronDown className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="expanded-close"
              aria-label="Fechar player"
              title="Fechar"
              className="h-9 w-9 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={handleCloseX}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </header>

          {/* Hero — cover grande + titulo + curso */}
          <section className="w-full max-w-md flex flex-col items-center gap-4">
            {sanitizedCover ? (
              <img
                data-testid="expanded-cover"
                src={sanitizedCover}
                alt=""
                className="w-full max-w-md aspect-square rounded-lg shadow-2xl object-cover"
              />
            ) : (
              <div
                data-testid="expanded-cover"
                className="w-full max-w-md aspect-square rounded-lg shadow-2xl bg-gray-700"
                aria-hidden="true"
              />
            )}
            <h2 className="text-2xl font-bold text-white text-center">
              {activeTrack.title ?? ""}
            </h2>
            <p
              data-testid="expanded-course-context"
              className="text-sm text-gray-400 text-center"
            >
              {/* D8 (B-ARTIST-1): artist (Spotify) precede courseTitle (library). */}
              {activeTrack.artist ?? courseTitle ?? ""}
              {!activeTrack.artist && courseTitle && moduleTitle
                ? ` · ${moduleTitle}`
                : ""}
            </p>
          </section>

          {/* Transcript preview (MP3.2 reuse) — opcional. */}
          {transcriptionPreview ? (
            <LocalErrorBoundary>
              <section
                data-testid="expanded-transcript"
                className="w-full max-w-md mt-6 p-4 bg-white/5 rounded-md"
              >
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Trecho
                </p>
                <p className="text-sm text-gray-200">{transcriptionPreview}</p>
              </section>
            </LocalErrorBoundary>
          ) : null}

          {/* Controles maiores — RF-05 toggle h-12, outros h-10. */}
          <div className="w-full max-w-md mt-6 flex items-center justify-center gap-3 bg-white/5 rounded-full px-4 py-2">
            <button
              type="button"
              data-testid="expanded-prev"
              aria-label="Aula anterior"
              title="Aula anterior"
              className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={() => {
                try {
                  void emitAudioEvent("audio.prev", {
                    from_track_id:
                      activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                    reason: "user",
                  });
                } catch {
                  // ignore
                }
                try {
                  playPrevious?.();
                } catch {
                  // ignore
                }
              }}
            >
              <SkipBack className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="expanded-back15"
              aria-label="Voltar 15 segundos"
              title="Voltar 15s"
              className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={() => skipBack?.(15)}
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="expanded-toggle"
              aria-label={isPlaying ? "Pausar" : "Tocar"}
              title={isPlaying ? "Pausar (Espaco)" : "Tocar (Espaco)"}
              className="h-12 w-12 flex items-center justify-center bg-white text-gray-900 hover:bg-gray-100 rounded-full"
              onClick={() => {
                try {
                  void emitAudioEvent(
                    isPlaying ? "audio.pause" : "audio.play",
                    {
                      track_id:
                        activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                      source_driver:
                        ctxRaw?.activeSource ?? activeTrack?.source ?? null,
                    },
                  );
                } catch {
                  // ignore
                }
                try {
                  toggle?.();
                } catch {
                  // ignore
                }
              }}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" aria-hidden="true" />
              ) : (
                <Play className="w-6 h-6" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              data-testid="expanded-forward15"
              aria-label="Avancar 15 segundos"
              title="Avancar 15s"
              className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={() => skipForward?.(15)}
            >
              <RotateCw className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="expanded-next"
              aria-label="Proxima aula"
              title="Proxima aula"
              className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full text-white"
              onClick={() => {
                try {
                  void emitAudioEvent("audio.next", {
                    from_track_id:
                      activeTrack?.trackId ?? activeTrack?.lessonId ?? null,
                    reason: "user",
                  });
                } catch {
                  // ignore
                }
                try {
                  playNext?.();
                } catch {
                  // ignore
                }
              }}
            >
              <SkipForward className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Queue inline — opcional. */}
          {visibleQueue.length > 0 ? (
            <section
              data-testid="expanded-queue"
              className="w-full max-w-md mt-6"
            >
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Fila</h3>
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {visibleQueue.map((item: any, idx: number) => (
                  <li key={item?.id ?? item?.queueItemId ?? item?.trackId ?? idx}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-white/5 rounded-md text-sm text-gray-200 flex items-center gap-2"
                      onClick={() => {
                        try {
                          // B-SKIP-1: passar a STRING id do item (skipToQueueItem
                          // espera id, NAO o index numerico -> findIndex(-1) no-op).
                          skipToQueueItem?.(item?.id);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      <span className="flex-1 truncate">
                        {item?.track?.title ?? item?.title ?? `Aula ${idx + 1}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {showQueueMoreCta ? (
                <p className="mt-2 text-xs text-gray-400">
                  + {queue.length - visibleQueue.length} aulas a mais — ver fila
                  completa
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Coach hint card — dismissable. */}
          {!coachHintDismissed ? (
            <aside
              data-testid="expanded-coach-hint"
              className="w-full max-w-md mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-start gap-3"
            >
              <Sparkles
                className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="text-sm text-gray-200">
                  Coach IA pode te recomendar a proxima aula
                </p>
                <Link
                  href="/coach-ai"
                  className="text-xs text-blue-400 hover:underline"
                  onClick={handleCoachHintClick}
                >
                  Abrir Coach IA →
                </Link>
              </div>
              <button
                type="button"
                aria-label="Dispensar dica"
                title="Dispensar"
                className="text-gray-400 hover:text-white"
                onClick={dismissCoachHint}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </aside>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
