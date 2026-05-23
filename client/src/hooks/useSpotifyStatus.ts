// Sprint SPOTIFY-DEEP / RF-04 — Hook useSpotifyStatus.
//
// Wrapper TanStack Query em GET /api/audio/spotify/status. Devolve o estado de
// conexao + product tier do Spotify. Consumido por MiniPlayerBar (botao search)
// e SpotifySearchDialog (tier gate / empty state).

import { useQuery } from "@tanstack/react-query";

export interface SpotifyStatus {
  isConnected: boolean;
  productTier: "premium" | "free" | null;
  displayName: string | null;
  isLoading: boolean;
}

interface SpotifyStatusResponse {
  connected?: boolean;
  productTier?: string | null;
  displayName?: string | null;
}

export function useSpotifyStatus(): SpotifyStatus {
  const q = useQuery<SpotifyStatusResponse>({
    queryKey: ["spotify-status"],
    queryFn: async () => {
      const resp = await fetch("/api/audio/spotify/status", {
        credentials: "include",
      });
      if (!resp.ok) return { connected: false };
      return (await resp.json()) as SpotifyStatusResponse;
    },
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
