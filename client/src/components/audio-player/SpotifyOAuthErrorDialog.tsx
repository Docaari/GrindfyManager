// Sprint Mini Player 3 / RF-06.2 — SpotifyOAuthErrorDialog.
// D17. Mapeia reason -> mensagem PT-BR. Botoes [Reconectar] + [Cancelar].

import React from "react";
import { initiateSpotifyAuth } from "@/lib/spotify/auth";

interface Props {
  open: boolean;
  reason: string;
  onOpenChange: (open: boolean) => void;
}

const REASON_MESSAGES: Record<string, string> = {
  state_mismatch: "Sessao expirada. Tente conectar novamente.",
  access_denied: "Voce cancelou a autorizacao.",
  invalid_grant: "Token Spotify invalido. Reconecte.",
  server_error: "Erro do servidor Spotify. Tente em alguns minutos.",
};

const DEFAULT_MESSAGE = "Erro inesperado. Tente novamente.";

function messageFor(reason: string): string {
  return REASON_MESSAGES[reason] ?? DEFAULT_MESSAGE;
}

export function SpotifyOAuthErrorDialog({ open, reason, onOpenChange }: Props) {
  if (!open) return null;

  const msg = messageFor(reason);
  const tid = `spotify-oauth-error-message-${reason}`;

  async function handleReconnect() {
    try {
      await initiateSpotifyAuth();
    } catch {
      // ignore — auth library lida com fallback redirect.
    }
  }

  return (
    <div
      data-testid="spotify-oauth-error-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Erro Spotify"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-full max-w-sm rounded-md border border-white/10 bg-gray-900 p-4 text-sm text-white">
        <h2 className="mb-2 text-base font-semibold">Erro ao conectar Spotify</h2>
        <p data-testid={tid} className="mb-4 text-gray-300">
          {msg}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="spotify-oauth-cancel-button"
            onClick={() => onOpenChange(false)}
            className="rounded px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="spotify-oauth-reconnect-button"
            onClick={handleReconnect}
            className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
          >
            Reconectar
          </button>
        </div>
      </div>
    </div>
  );
}

export default SpotifyOAuthErrorDialog;
