// Sprint Mini Player 2 (RF-01.6 + RF-01.2 + D13) — Painel de conexao Spotify
// em /coach-ai aba Preferencias.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  initiateSpotifyAuth,
  disconnectSpotify,
  SpotifyPremiumRequiredError,
} from "@/lib/spotify/auth";
import { useOptionalAudioPlayer } from "@/contexts/AudioPlayerContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SpotifyPremiumGateDialog } from "@/components/audio-player/SpotifyPremiumGateDialog";

interface SpotifyStatus {
  connected: boolean;
  displayName?: string | null;
  productTier?: string | null;
  connectedAt?: string | null;
}

const MOBILE_BREAKPOINT = 1024;

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia) {
      const mq = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`);
      if (typeof mq.matches === "boolean") return !mq.matches;
    }
  } catch {
    // ignore
  }
  return (window.innerWidth ?? 1280) < MOBILE_BREAKPOINT;
}

export function SpotifyConnectionPanel() {
  const queryClient = useQueryClient();
  // HIGH-5: ao concluir OAuth, propagar token pro AudioPlayerContext criar
  // o driver real via Engine factory. Optional accessor evita quebrar testes
  // que renderizam o componente sem AudioPlayerProvider.
  const audio = useOptionalAudioPlayer();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [premiumGateOpen, setPremiumGateOpen] = React.useState(false);
  const [premiumGateName, setPremiumGateName] = React.useState("");
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    setIsMobile(isMobileViewport());
  }, []);

  const { data: status } = useQuery<SpotifyStatus>({
    queryKey: ["/api/audio/spotify/status"],
    queryFn: () => apiRequest("GET", "/api/audio/spotify/status"),
  });

  const connected = !!status?.connected;
  const displayName = status?.displayName ?? "";

  const handleConnect = async () => {
    try {
      const result = await initiateSpotifyAuth();
      // HIGH-5: propagar token pro AudioPlayerContext criar o driver real.
      if (audio && result?.accessToken) {
        try {
          audio.connectSpotify(
            result.accessToken,
            result.expiresIn,
            result.displayName,
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("connectSpotify failed", err);
        }
      }
      // Invalidate to refetch status
      queryClient.invalidateQueries({
        queryKey: ["/api/audio/spotify/status"],
      });
    } catch (err) {
      if (err instanceof SpotifyPremiumRequiredError) {
        setPremiumGateName(err.displayName);
        setPremiumGateOpen(true);
      } else {
        // eslint-disable-next-line no-console
        console.warn("Spotify connect failed", err);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectSpotify();
      // HIGH-5: destruir driver local apos disconnect server-side.
      if (audio) {
        try {
          audio.disconnectSpotifyDriver();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("disconnectSpotifyDriver failed", err);
        }
      }
      setConfirmOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["/api/audio/spotify/status"],
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Spotify disconnect failed", err);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-medium">Spotify</h3>
      {!connected ? (
        <div className="space-y-1">
          <button
            type="button"
            data-testid="spotify-connect-button"
            disabled={isMobile}
            onClick={handleConnect}
            title={
              isMobile
                ? "Spotify disponivel apenas em desktop (Chrome/Edge/Firefox)"
                : undefined
            }
            aria-label={
              isMobile
                ? "Conectar Spotify (desktop apenas)"
                : "Conectar Spotify"
            }
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Conectar Spotify
          </button>
          {isMobile && (
            <p className="text-xs text-muted-foreground">
              Spotify disponivel apenas em desktop (Chrome/Edge/Firefox).
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p data-testid="spotify-connection-status" className="text-sm">
            Conectado como <strong>{displayName}</strong>
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="spotify-disconnect-button"
            onClick={() => setConfirmOpen(true)}
          >
            Desconectar
          </Button>
        </div>
      )}

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="spotify-disconnect-confirm">
          <DialogHeader>
            <DialogTitle>Tem certeza?</DialogTitle>
            <DialogDescription>
              Voce precisara reconectar para tocar musicas Spotify novamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="spotify-disconnect-confirm-yes"
              onClick={handleDisconnect}
            >
              Sim, desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SpotifyPremiumGateDialog
        open={premiumGateOpen}
        onClose={() => setPremiumGateOpen(false)}
        displayName={premiumGateName}
      />
    </section>
  );
}

export default SpotifyConnectionPanel;
