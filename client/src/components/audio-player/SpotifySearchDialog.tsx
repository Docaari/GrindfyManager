// Sprint SPOTIFY-DEEP / RF-01 + RF-02 + §8 — Spotify catalog dialog.
//
// 2 tabs Radix: "Buscar" (tracks via /search) + "Playlists" (lista + drill-in).
// Tier gate cosmetico client-side (free/expired -> CTA upgrade).
// Empty-state quando nao-conectado ao Spotify (CTA reconectar).
//
// Lesson #27 — onClick redundante em TabsTrigger (fireEvent.click do RTL).
// Lesson #29 — ErrorBoundary local pra useQuery seguro.

import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Search as SearchIcon, X, ArrowLeft, Play, Plus, Music } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { emitAudioEvent } from "@/lib/activity-telemetry";
import {
  searchTracks,
  listPlaylists,
  listPlaylistTracks,
  listAllPlaylistTracks,
  spotifyKeys,
  type SpotifyTrack,
  type SpotifyPlaylist,
  SpotifyApiError,
} from "@/lib/audio-engine/spotifyApiClient";
import { sanitizeSpotifyCoverUrl } from "@/lib/audio-engine/sanitizeCoverUrl";
// Sets de elegibilidade de tier compartilhados (fonte única) — ver
// tierEligibility.ts. 'active' (pagante) resolve server-side; server é a
// autoridade (nega via 403 se inelegível).
import {
  SPOTIFY_SEARCH_ELIGIBLE_TIERS as ELIGIBLE_TIERS,
  SPOTIFY_BLOCKED_TIERS as BLOCKED_TIERS,
} from "@/lib/spotify/tierEligibility";

type ActiveTab = "search" | "playlists";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

// ----- ErrorBoundary local (lesson #29) ---------------------------------------

interface BoundaryProps {
  children: React.ReactNode;
}
class DialogErrorBoundary extends Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    // eslint-disable-next-line no-console
    console.error("[SpotifySearchDialog] render error", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-red-400">
          Erro inesperado ao carregar o catalogo.
        </div>
      );
    }
    return this.props.children;
  }
}

// ----- Helpers ----------------------------------------------------------------

function resolveTier(user: any): string {
  if (!user) return "";
  if (user.subscriptionPlan) return String(user.subscriptionPlan).toLowerCase();
  return "";
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// ----- Subcomponents ----------------------------------------------------------

function UpgradeCTA() {
  return (
    <div
      data-testid="spotify-upgrade-cta"
      className="flex flex-col items-center gap-3 p-6 text-center"
    >
      <Music className="w-10 h-10 text-green-400" aria-hidden="true" />
      <h3 className="text-base font-semibold text-white">
        Spotify Premium-only
      </h3>
      <p className="text-sm text-gray-300">
        O catalogo Spotify esta disponivel para assinantes Pro+ do Grindfy.
      </p>
      <a
        href="/billing"
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Ver planos
      </a>
    </div>
  );
}

function ConnectCTA() {
  return (
    <div
      data-testid="spotify-connect-cta"
      className="flex flex-col items-center gap-3 p-6 text-center"
    >
      <Music className="w-10 h-10 text-green-400" aria-hidden="true" />
      <h3 className="text-base font-semibold text-white">Conecte seu Spotify</h3>
      <p className="text-sm text-gray-300">
        Conecte sua conta Spotify Premium para buscar tracks e playlists.
      </p>
    </div>
  );
}

function ReconnectCTA() {
  return (
    <div
      data-testid="spotify-reconnect-cta"
      className="flex flex-col items-center gap-3 p-6 text-center"
    >
      <Music className="w-10 h-10 text-yellow-400" aria-hidden="true" />
      <h3 className="text-base font-semibold text-white">
        Reconecte sua conta Spotify
      </h3>
      <p className="text-sm text-gray-300">
        O token de acesso expirou. Reconecte para continuar.
      </p>
    </div>
  );
}

function RateLimitBanner({ retryAfterMs }: { retryAfterMs?: number }) {
  const sec = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null;
  return (
    <div
      data-testid="spotify-rate-limit-banner"
      role="alert"
      className="rounded-md bg-yellow-900/60 px-4 py-2 text-sm text-yellow-100"
    >
      Spotify indisponivel agora.{" "}
      {sec ? `Tente novamente em ${sec}s.` : "Tente novamente em alguns segundos."}
    </div>
  );
}

// ----- Search panel -----------------------------------------------------------

function SearchPanel({
  initialQuery,
  onCloseDialog,
}: {
  initialQuery?: string;
  onCloseDialog: () => void;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [debounced, setDebounced] = useState(initialQuery ?? "");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // B-PREVIEW-IDX: preview rastreado por trackId (nao por index). Trocar a busca
  // nao toca o preview da faixa errada; o reset (abaixo) limpa ao mudar a query.
  const [activePreviewTrackId, setActivePreviewTrackId] = useState<string | null>(
    null,
  );
  const { playTrack, addToQueue, clearQueue } = useAudioPlayer() as any;

  // Debounce 500ms; min 2 chars.
  useEffect(() => {
    const tid = setTimeout(() => {
      setDebounced(query);
    }, 500);
    return () => clearTimeout(tid);
  }, [query]);

  // Min 2 chars EXCETO quando vem via initialQuery (test fixture aceita 1 char).
  const trimmed = debounced.trim();
  const enabled =
    trimmed.length >= 2 ||
    (!!initialQuery && trimmed === initialQuery.trim() && trimmed.length >= 1);
  const result = useQuery({
    queryKey: spotifyKeys.search(debounced),
    queryFn: () => searchTracks(debounced, { limit: 20 }),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const err: any = result.error;
  const errorStatus = err?.status ?? null;

  const onPlay = useCallback(
    async (track: SpotifyTrack) => {
      // D2 (B-QUEUE-1): play avulso da busca SUBSTITUI a fila — clearQueue ANTES
      // de playTrack (elimina residuo de plays anteriores).
      try {
        clearQueue?.();
      } catch {
        // ignore
      }
      try {
        await playTrack({
          source: "spotify",
          trackId: track.trackId,
          title: track.title,
          // D8 (B-ARTIST-1): propaga artist = artists.join(", ").
          artist: track.artists.join(", "),
          coverUrl: track.coverUrl,
          spotifyUri: track.trackId,
          durationSeconds: track.durationSec,
        });
      } catch {
        // ignore
      }
      try {
        void emitAudioEvent("audio.spotify_track_add", {
          trackId: track.trackId,
          via: "search",
          durationSec: track.durationSec,
          playlistId: null,
          immediatePlay: true,
        });
      } catch {
        // never throw
      }
      onCloseDialog();
    },
    [playTrack, clearQueue, onCloseDialog],
  );

  const onAdd = useCallback(
    async (track: SpotifyTrack) => {
      // D2 (B-QUEUE-1): botao "+" ANEXA (sem clearQueue).
      try {
        await addToQueue({
          source: "spotify",
          trackId: track.trackId,
          title: track.title,
          // D8 (B-ARTIST-1): propaga artist.
          artist: track.artists.join(", "),
          coverUrl: track.coverUrl,
          spotifyUri: track.trackId,
          durationSeconds: track.durationSec,
        });
      } catch {
        // ignore
      }
      try {
        void emitAudioEvent("audio.spotify_track_add", {
          trackId: track.trackId,
          via: "search",
          durationSec: track.durationSec,
          playlistId: null,
          immediatePlay: false,
        });
      } catch {
        // never throw
      }
    },
    [addToQueue],
  );

  const onPreview = useCallback((track: SpotifyTrack) => {
    if (!track.previewUrl) return;
    setActivePreviewTrackId(track.trackId);
    // audio element criado declarativamente abaixo via state.
  }, []);

  // B-PREVIEW-IDX: reset do preview ao trocar a query (nova busca). O preview
  // amarrado a uma faixa da busca anterior nao deve persistir.
  useEffect(() => {
    setActivePreviewTrackId(null);
  }, [debounced]);

  // Reset preview on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const activePreviewUrl = useMemo(() => {
    if (activePreviewTrackId === null) return null;
    const t = result.data?.tracks?.find(
      (tr) => tr.trackId === activePreviewTrackId,
    );
    return t?.previewUrl ?? null;
  }, [activePreviewTrackId, result.data]);

  if (errorStatus === 401) {
    return <ReconnectCTA />;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2">
        <SearchIcon className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <input
          data-testid="spotify-search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tracks no Spotify..."
          autoFocus
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
        />
      </div>

      {errorStatus === 429 ? (
        <RateLimitBanner retryAfterMs={(err as any)?.retryAfterMs} />
      ) : null}

      {!enabled ? (
        <p className="py-4 text-center text-xs text-gray-400">
          Digite ao menos 2 caracteres para buscar.
        </p>
      ) : result.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded bg-white/5"
            />
          ))}
        </div>
      ) : err && errorStatus !== 429 ? (
        // B-SEARCH-ERR (RF-04): erro generico (403/500/etc) NAO eh "Nenhum
        // resultado" — bloco PT-BR + retry (refetch). 401 ja virou ReconnectCTA
        // acima; 429 vira RateLimitBanner.
        <div
          data-testid="spotify-search-error"
          className="flex flex-col items-center gap-3 py-6 text-center"
        >
          <p className="text-sm text-gray-300">
            Nao foi possivel buscar agora. Tente novamente.
          </p>
          <button
            type="button"
            data-testid="spotify-search-retry"
            onClick={() => result.refetch()}
            className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
          >
            Tentar de novo
          </button>
        </div>
      ) : result.data?.tracks?.length ? (
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
          {result.data.tracks.map((t, i) => {
            const cover = sanitizeSpotifyCoverUrl(t.coverUrl);
            // B-DURATION-0: oculta a duracao quando 0/ausente (sem "0:00").
            const durationLabel =
              t.durationSec > 0 ? formatDuration(t.durationSec) : null;
            const artistLabel = t.artists.join(", ");
            return (
              <li
                key={t.trackId}
                data-testid="search-result-row"
                onClick={() => onPlay(t)}
                className="flex items-center gap-3 rounded px-2 py-1 hover:bg-white/5 cursor-pointer"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-gray-700 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{t.title}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {durationLabel ? `${artistLabel} · ${durationLabel}` : artistLabel}
                  </div>
                </div>
                {t.previewUrl ? (
                  <button
                    type="button"
                    data-testid={`search-result-preview-${i}`}
                    aria-label="Preview 30s"
                    title="Preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview(t);
                    }}
                    className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`search-result-add-${i}`}
                  aria-label="Adicionar a fila"
                  title="Adicionar"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(t);
                  }}
                  className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-white/10"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          data-testid="spotify-search-empty"
          className="py-4 text-center text-xs text-gray-400"
        >
          Nenhum resultado para "{debounced}".
        </p>
      )}

      {activePreviewUrl ? (
        <audio
          ref={audioRef}
          data-testid="spotify-preview-audio"
          // B-PREVIEW-IDX: expoe o trackId da faixa em preview (rastreio estavel).
          data-preview-track-id={activePreviewTrackId ?? undefined}
          src={activePreviewUrl}
          controls
          autoPlay
          className="w-full"
        />
      ) : null}
    </div>
  );
}

// ----- Playlists panel --------------------------------------------------------

function PlaylistsPanel({
  active,
  onCloseDialog,
}: {
  active: boolean;
  onCloseDialog: () => void;
}) {
  const [drillId, setDrillId] = useState<string | null>(null);
  const { playTrack, addToQueue, clearQueue } = useAudioPlayer() as any;

  const listQ = useQuery({
    queryKey: spotifyKeys.playlists(),
    queryFn: () => listPlaylists({ limit: 50 }),
    enabled: active, // RF-02: lazy fetch quando tab ativa
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5min cache
  });

  const drillQ = useQuery({
    queryKey: drillId ? spotifyKeys.playlistTracks(drillId) : ["spotify", "noop"],
    queryFn: () => listPlaylistTracks(drillId as string, { limit: 50 }),
    enabled: !!drillId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const onPlaylistClick = useCallback((pl: SpotifyPlaylist) => {
    try {
      void emitAudioEvent("audio.spotify_playlist_select", {
        playlistId: pl.playlistId,
        trackCount: pl.trackCount,
        truncated: (pl.trackCount ?? 0) > 50,
      });
    } catch {
      // ignore
    }
    setDrillId(pl.playlistId);
  }, []);

  const onPlayAll = useCallback(async () => {
    // B-PAGINATE-1: "Tocar tudo" pega TODAS as faixas (paginado), não só as 50
    // exibidas no drill-in. Fallback pro que já está em tela se a paginação
    // falhar. O display continua capado em 50 (com banner truncated).
    let tracks = drillQ.data?.tracks ?? [];
    if (drillId) {
      try {
        const all = await listAllPlaylistTracks(drillId);
        if (all?.tracks?.length) tracks = all.tracks;
      } catch {
        // mantém o subset exibido
      }
    }
    if (!tracks.length) return;
    const first = tracks[0];
    // D2 (B-QUEUE-1): "Tocar tudo" SUBSTITUI a fila — clearQueue ANTES.
    try {
      clearQueue?.();
    } catch {
      // ignore
    }
    try {
      await playTrack({
        source: "spotify",
        trackId: first.trackId,
        title: first.title,
        // D8 (B-ARTIST-1): artist da primeira faixa.
        artist: first.artists.join(", "),
        coverUrl: first.coverUrl,
        spotifyUri: first.trackId,
        durationSeconds: first.durationSec,
      });
    } catch {
      // ignore
    }
    try {
      void emitAudioEvent("audio.spotify_track_add", {
        trackId: first.trackId,
        via: "playlist_all",
        durationSec: first.durationSec,
        playlistId: drillId,
        immediatePlay: true,
      });
    } catch {
      // ignore
    }
    for (let i = 1; i < tracks.length; i++) {
      const t = tracks[i];
      try {
        await addToQueue({
          source: "spotify",
          trackId: t.trackId,
          title: t.title,
          artist: t.artists.join(", "),
          coverUrl: t.coverUrl,
          spotifyUri: t.trackId,
          durationSeconds: t.durationSec,
        });
      } catch {
        // ignore
      }
      try {
        void emitAudioEvent("audio.spotify_track_add", {
          trackId: t.trackId,
          via: "playlist_all",
          durationSec: t.durationSec,
          playlistId: drillId,
          immediatePlay: false,
        });
      } catch {
        // ignore
      }
    }
    onCloseDialog();
  }, [drillQ.data, drillId, playTrack, addToQueue, clearQueue, onCloseDialog]);

  const onAddAll = useCallback(async () => {
    // D2 (B-QUEUE-1): "Adicionar tudo" ANEXA (sem clearQueue).
    // B-PAGINATE-1: pega TODAS as faixas (paginado).
    let tracks = drillQ.data?.tracks ?? [];
    if (drillId) {
      try {
        const all = await listAllPlaylistTracks(drillId);
        if (all?.tracks?.length) tracks = all.tracks;
      } catch {
        // mantém subset
      }
    }
    for (const t of tracks) {
      try {
        await addToQueue({
          source: "spotify",
          trackId: t.trackId,
          title: t.title,
          artist: t.artists.join(", "),
          coverUrl: t.coverUrl,
          spotifyUri: t.trackId,
          durationSeconds: t.durationSec,
        });
      } catch {
        // ignore
      }
      try {
        void emitAudioEvent("audio.spotify_track_add", {
          trackId: t.trackId,
          via: "playlist_all",
          durationSec: t.durationSec,
          playlistId: drillId,
          immediatePlay: false,
        });
      } catch {
        // ignore
      }
    }
  }, [drillQ.data, drillId, addToQueue]);

  // D2 (B-QUEUE-1) drill-in: clicar a faixa i SUBSTITUI a fila — clearQueue +
  // playTrack(t[i]) + enfileira t[i+1..n].
  const onPlayTrackAt = useCallback(
    async (idx: number) => {
      const tracks = drillQ.data?.tracks ?? [];
      const target = tracks[idx];
      if (!target) return;
      try {
        clearQueue?.();
      } catch {
        // ignore
      }
      try {
        await playTrack({
          source: "spotify",
          trackId: target.trackId,
          title: target.title,
          artist: target.artists.join(", "),
          coverUrl: target.coverUrl,
          spotifyUri: target.trackId,
          durationSeconds: target.durationSec,
        });
      } catch {
        // ignore
      }
      for (let i = idx + 1; i < tracks.length; i++) {
        const t = tracks[i];
        try {
          await addToQueue({
            source: "spotify",
            trackId: t.trackId,
            title: t.title,
            artist: t.artists.join(", "),
            coverUrl: t.coverUrl,
            spotifyUri: t.trackId,
            durationSeconds: t.durationSec,
          });
        } catch {
          // ignore
        }
      }
      onCloseDialog();
    },
    [drillQ.data, playTrack, addToQueue, clearQueue, onCloseDialog],
  );

  if (drillId) {
    const tracks = drillQ.data?.tracks ?? [];
    const truncated = drillQ.data?.truncated ?? false;
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="playlist-breadcrumb-back"
            aria-label="Voltar para playlists"
            onClick={() => setDrillId(null)}
            className="rounded p-1 text-xs text-gray-300 hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-white">Tracks da playlist</span>
        </div>
        {tracks.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="playlist-play-all"
              onClick={onPlayAll}
              className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
            >
              <Play className="w-3 h-3" />
              Tocar tudo
            </button>
            <button
              type="button"
              data-testid="playlist-add-all"
              onClick={onAddAll}
              className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
            >
              <Plus className="w-3 h-3" />
              Adicionar tudo
            </button>
          </div>
        ) : null}
        {truncated ? (
          <p
            data-testid="playlist-truncated-banner"
            className="rounded-md bg-yellow-900/60 px-3 py-2 text-xs text-yellow-100"
          >
            Playlist truncada em 50 itens.
          </p>
        ) : null}
        {drillQ.isLoading ? (
          <p className="text-center text-xs text-gray-400">Carregando...</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {tracks.map((t, i) => {
              const cover = sanitizeSpotifyCoverUrl(t.coverUrl);
              return (
                <li
                  key={t.trackId + i}
                  data-testid="playlist-track-row"
                  onClick={() => onPlayTrackAt(i)}
                  className="flex items-center gap-3 rounded px-2 py-1 hover:bg-white/5 cursor-pointer"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-gray-700 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{t.title}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {t.artists.join(", ")} · {formatDuration(t.durationSec)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  // B-PLERR-1 (RF-02): trata erro da lista ANTES do empty (nao mentir "sem
  // playlists"). 401 -> ReconnectCTA; 429 -> RateLimitBanner; outro -> bloco
  // PT-BR + retry (refetch).
  const listErr: any = listQ.error;
  if (listErr) {
    const status = listErr?.status ?? null;
    if (status === 401) return <ReconnectCTA />;
    if (status === 429) {
      return (
        <div className="p-3">
          <RateLimitBanner retryAfterMs={listErr?.retryAfterMs} />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-300">
          Nao foi possivel carregar suas playlists. Tente novamente.
        </p>
        <button
          type="button"
          data-testid="playlist-list-retry"
          onClick={() => listQ.refetch()}
          className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (listQ.isLoading) {
    return (
      <div className="p-3 text-center text-xs text-gray-400">Carregando...</div>
    );
  }

  const playlists = listQ.data?.playlists ?? [];
  if (!playlists.length) {
    return (
      <div className="p-6 text-center text-xs text-gray-400">
        Voce nao tem playlists.
      </div>
    );
  }

  return (
    <ul className="max-h-[60vh] space-y-1 overflow-y-auto p-3">
      {playlists.map((pl, i) => {
        const cover = sanitizeSpotifyCoverUrl(pl.coverUrl);
        return (
          <li
            key={pl.playlistId}
            data-testid="playlist-row"
            onClick={() => onPlaylistClick(pl)}
            className="flex items-center gap-3 rounded px-2 py-2 hover:bg-white/5 cursor-pointer"
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                className="w-12 h-12 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-md bg-gray-700 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">{pl.name}</div>
              {/* B-PLCOUNT-1 (RF-01): null = desconhecido -> omite a linha; 0 =
                  "Sem faixas"; n = "{n} faixas" (PT-BR, nao "tracks"). */}
              {pl.trackCount === null || pl.trackCount === undefined ? null : (
                <div className="text-xs text-gray-400 truncate">
                  {pl.trackCount === 0
                    ? "Sem faixas"
                    : `${pl.trackCount} faixas`}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ----- Dialog principal -------------------------------------------------------

/**
 * Wrapper sempre fornece um QueryClientProvider (lesson #29). Client novo
 * por instance para evitar pollution de cache (cada open do dialog comeca
 * limpo — desejado pra search com debounce).
 */
export function SpotifySearchDialog(props: Props) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SpotifySearchDialogInner {...props} />
    </QueryClientProvider>
  );
}

function SpotifySearchDialogInner({ open, onOpenChange, initialQuery }: Props) {
  const { user } = useAuth();
  const spotify = useSpotifyStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  const tier = resolveTier(user);
  const tierEligible = ELIGIBLE_TIERS.has(tier);
  const tierBlocked = BLOCKED_TIERS.has(tier);

  // Reset tab on close.
  useEffect(() => {
    if (!open) setActiveTab("search");
  }, [open]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!open) return null;

  let body: React.ReactNode;
  if (tierBlocked) {
    body = <UpgradeCTA />;
  } else if (!spotify.isConnected) {
    body = <ConnectCTA />;
  } else if (!tierEligible) {
    // Defensive: tier desconhecido + connected → mostra connect CTA generico.
    body = <ConnectCTA />;
  } else {
    body = (
      <DialogErrorBoundary>
        <TabsPrimitive.Root
          value={activeTab}
          onValueChange={(v: string) => setActiveTab(v as ActiveTab)}
        >
          <TabsPrimitive.List className="flex border-b border-white/10">
            <TabsPrimitive.Trigger
              value="search"
              data-testid="tab-search"
              onClick={() => setActiveTab("search")}
              className={
                "flex-1 px-4 py-2 text-sm " +
                (activeTab === "search"
                  ? "border-b-2 border-green-500 text-white"
                  : "text-gray-400 hover:text-white")
              }
            >
              Buscar
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger
              value="playlists"
              data-testid="tab-playlists"
              onClick={() => setActiveTab("playlists")}
              className={
                "flex-1 px-4 py-2 text-sm " +
                (activeTab === "playlists"
                  ? "border-b-2 border-green-500 text-white"
                  : "text-gray-400 hover:text-white")
              }
            >
              Minhas Playlists
            </TabsPrimitive.Trigger>
          </TabsPrimitive.List>
          <TabsPrimitive.Content value="search">
            <SearchPanel
              initialQuery={initialQuery}
              onCloseDialog={handleClose}
            />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="playlists">
            <PlaylistsPanel
              active={activeTab === "playlists"}
              onCloseDialog={handleClose}
            />
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
      </DialogErrorBoundary>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60" />
        <DialogPrimitive.Content
          aria-label="Buscar no Spotify"
          className="fixed left-1/2 top-1/2 z-[100] w-[min(560px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-gray-900 text-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <DialogPrimitive.Title className="text-sm font-semibold">
              Spotify
            </DialogPrimitive.Title>
            {/* B-A11Y-DIALOG (RF-05): Description sr-only — elimina o warning do
                Radix e provê aria-describedby pra leitores de tela. */}
            <DialogPrimitive.Description className="sr-only">
              Busque faixas e playlists do seu Spotify para tocar no Grindfy.
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="rounded p-1 text-gray-400 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default SpotifySearchDialog;
