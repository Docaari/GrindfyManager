// Sprint SPOTIFY-DEEP / RF-04 — Hook useSpotifyStatus.
//
// Wrapper TanStack Query em GET /api/audio/spotify/status. Devolve o estado de
// conexao + product tier do Spotify. Consumido por MiniPlayerBar (botao search)
// e SpotifySearchDialog (tier gate / empty state).

import { useQuery } from "@tanstack/react-query";

// Query-key canonica do status Spotify. Compartilhada entre o hook
// (useSpotifyStatus -> Mini Player) e todos os callsites de invalidacao
// (auth.ts, EmptyStateCTA, SpotifyConnectionPanel) para que connect/disconnect
// convirjam o gate visual sem F5. Lesson #29: invalidacoes via singleton
// queryClient nos componentes; o hook usa esta mesma key.
export const SPOTIFY_STATUS_QUERY_KEY = ["spotify-status"] as const;

export interface SpotifyStatus {
  isConnected: boolean;
  productTier: "premium" | "free" | null;
  displayName: string | null;
  isLoading: boolean;
}

export interface SpotifyStatusResponse {
  connected?: boolean;
  productTier?: string | null;
  displayName?: string | null;
}

/**
 * D7 (B-PANEL-401): fetcher SSoT resiliente do status Spotify. Usa `fetch`
 * (NUNCA `apiRequest`, que dispara o logout global em 401). 401/!ok ->
 * {connected:false}. Exportado p/ o hook E o SpotifyConnectionPanel consumirem
 * a MESMA query (mesma key + mesmo fetcher) — sem politicas divergentes.
 */
export async function fetchSpotifyStatus(): Promise<SpotifyStatusResponse> {
  const resp = await fetch("/api/audio/spotify/status", {
    credentials: "include",
  });
  if (!resp.ok) return { connected: false }; // 401 NAO desloga (resiliente)
  return (await resp.json()) as SpotifyStatusResponse;
}

export function useSpotifyStatus(): SpotifyStatus {
  const q = useQuery<SpotifyStatusResponse>({
    queryKey: SPOTIFY_STATUS_QUERY_KEY,
    queryFn: fetchSpotifyStatus,
    staleTime: 60_000,
    retry: false,
  });

  return {
    isConnected: q.data?.connected === true,
    productTier:
      q.data?.productTier === "premium"
        ? "premium"
        : q.data?.productTier === "free"
          ? "free"
          : null,
    displayName: q.data?.displayName ?? null,
    isLoading: q.isLoading,
  };
}
