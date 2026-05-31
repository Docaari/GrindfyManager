// EmptyStateCTA — Sprint MP-MODERN / RF-06.
// Renderizado pela MiniPlayerBar quando `!activeTrack && displayMode !== "hidden"`.
// Bar reduced 48px com 2 CTAs centrais: "Escolher aula" + "Conectar Spotify"
// (Spotify CTA condicional a `activeSource !== 'spotify'`).
//
// Spec: Docs/specs/sprint-mp-modern.md §4 RF-06
// ADR: Docs/architecture/decisions/209-mini-player-modern-redesign.md D7

import React, { Suspense, useEffect, useState } from "react";
import { BookOpen, Loader2, Music, Search as SearchIcon } from "lucide-react";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { emitAudioEvent } from "@/lib/activity-telemetry";
import {
  initiateSpotifyAuth,
  SpotifyPremiumRequiredError,
} from "@/lib/spotify/auth";
// Singleton (NAO useQueryClient) — render fora de provider em tests legacy
// quebraria (lesson #29).
import { queryClient } from "@/lib/queryClient";

// Lazy global — picker de aulas.
const LessonPickerDialog = React.lazy(() =>
  import("./LessonPickerDialog").then((m) => ({
    default: m.LessonPickerDialog,
  })),
);

// Lazy — busca/navegacao Spotify (entry point quando conectado mas sem track).
const SpotifySearchDialog = React.lazy(() =>
  import("./SpotifySearchDialog").then((m) => ({
    default: m.SpotifySearchDialog,
  })),
);

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

export function EmptyStateCTA() {
  const ctxRaw = useAudioPlayer() as any;
  const activeSource: string | null =
    ctxRaw?.activeSource ?? ctxRaw?.activeTrack?.source ?? null;
  const isSpotifyConnected =
    activeSource === "spotify" || ctxRaw?.isSpotifyConnected === true;

  const reducedMotion = usePrefersReducedMotion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleChooseLesson = () => {
    try {
      void emitAudioEvent("mini_player.empty_cta.choose_lesson", {});
    } catch {
      // never throw
    }
    setPickerOpen(true);
  };

  const handleSpotifyConnect = async () => {
    try {
      void emitAudioEvent("mini_player.empty_cta.spotify_connect", {});
    } catch {
      // never throw
    }
    setSpotifyConnecting(true);
    try {
      const result = await initiateSpotifyAuth();
      // Propaga token pro AudioPlayerContext criar o driver real.
      if (result?.accessToken && ctxRaw?.connectSpotify) {
        try {
          ctxRaw.connectSpotify(
            result.accessToken,
            result.expiresIn,
            result.displayName,
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[EmptyStateCTA] connectSpotify falhou:", e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["spotify-status"] });
    } catch (err) {
      if (err instanceof SpotifyPremiumRequiredError) {
        // eslint-disable-next-line no-console
        console.warn("[EmptyStateCTA] Spotify Premium necessario");
      } else {
        // eslint-disable-next-line no-console
        console.warn("[EmptyStateCTA] Spotify connect falhou:", err);
      }
    } finally {
      setSpotifyConnecting(false);
    }
  };

  return (
    <div
      data-testid="mini-player-empty-cta"
      data-mini-player-mode="empty"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      role="complementary"
      aria-label="Mini player sem aula ativa"
      className="fixed bottom-0 left-0 right-0 z-40 h-12 px-3 flex flex-wrap items-center justify-center gap-3 bg-gray-900/60 backdrop-blur-glass border-t border-white/10 text-white"
      style={{
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      <button
        type="button"
        data-testid="mini-player-empty-choose-lesson"
        className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium inline-flex items-center"
        onClick={handleChooseLesson}
      >
        <BookOpen className="w-4 h-4 mr-1.5" aria-hidden="true" />
        Escolher aula
      </button>
      {!isSpotifyConnected ? (
        <button
          type="button"
          data-testid="mini-player-empty-spotify-connect"
          disabled={spotifyConnecting}
          className="px-4 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-wait rounded-md text-sm font-medium inline-flex items-center"
          onClick={handleSpotifyConnect}
        >
          {spotifyConnecting ? (
            <Loader2
              className="w-4 h-4 mr-1.5 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Music className="w-4 h-4 mr-1.5" aria-hidden="true" />
          )}
          Conectar Spotify
        </button>
      ) : (
        <button
          type="button"
          data-testid="mini-player-empty-spotify-search"
          className="px-4 py-1.5 bg-green-500 hover:bg-green-600 rounded-md text-sm font-medium inline-flex items-center"
          onClick={() => {
            try {
              void emitAudioEvent("mini_player.empty_cta.spotify_search", {});
            } catch {
              // never throw
            }
            setSearchOpen(true);
          }}
        >
          <SearchIcon className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Buscar no Spotify
        </button>
      )}
      {searchOpen ? (
        <Suspense fallback={null}>
          <SpotifySearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      ) : null}
      {pickerOpen ? (
        <Suspense fallback={null}>
          <LessonPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
