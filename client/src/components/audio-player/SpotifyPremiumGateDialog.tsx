// Sprint Mini Player 2 (RF-01.2) — Modal Premium gate.
//
// Quando user Free conecta Spotify, Premium check falha -> mostra esse dialog.

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface SpotifyPremiumGateDialogProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
}

export function SpotifyPremiumGateDialog({
  open,
  onClose,
  displayName,
}: SpotifyPremiumGateDialogProps) {
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="spotify-premium-gate-dialog">
        <DialogHeader>
          <DialogTitle>Spotify Premium necessario</DialogTitle>
          <DialogDescription>
            Voce conectou como <strong>{displayName}</strong> (conta Free). Para
            tocar musicas no Grindfy, voce precisa de uma conta Spotify Premium.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onClose()}
            data-testid="spotify-premium-gate-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              window.open(
                "https://spotify.com/premium",
                "_blank",
                "noopener,noreferrer",
              );
            }}
            data-testid="spotify-premium-gate-upgrade"
          >
            Saiba mais sobre Premium
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SpotifyPremiumGateDialog;
