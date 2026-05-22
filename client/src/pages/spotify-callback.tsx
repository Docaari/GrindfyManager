// Sprint Mini Player 2 (RF-01.1) — /spotify-callback fallback page.
// Sprint Mini Player 3 (RF-06.1/06.2) — restore OAuth snapshot + render
// SpotifyOAuthErrorDialog em failure paths.
//
// MP3 R1 fix wave 2 (HIGH-3 + HIGH-4):
//   - Snapshot agora persiste `pathname` (rota original do user antes do
//     OAuth). Apos restore success no fluxo redirect, callback dispara
//     window.location.replace(snap.pathname || '/') para devolver o user
//     a rota original. scrollY restore mantido via setTimeout(100).

import React from "react";
import { restoreOAuthSnapshot } from "@/lib/spotify/oauthSnapshot";
import { SpotifyOAuthErrorDialog } from "@/components/audio-player/SpotifyOAuthErrorDialog";

export default function SpotifyCallbackPage() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const [errorOpen, setErrorOpen] = React.useState(!!error);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Sprint MP3 RF-06.1: restore snapshot quando flow eh redirect (sem opener).
    // window.opener === null/window indica fluxo full-page (popup blocked
    // fallback). Restore scrollY pos-callback success + redireciona a rota
    // original via snap.pathname (HIGH-3).
    const isRedirectFlow = !window.opener || window.opener === window;
    if (isRedirectFlow && !error) {
      const snap = restoreOAuthSnapshot();
      if (snap) {
        // Best-effort scroll restore (delay 100ms para aguardar layout).
        setTimeout(() => {
          try {
            window.scrollTo(0, snap.scrollY);
          } catch {
            // ignore
          }
          // HIGH-3: redireciona pra rota original apos connectSpotify
          // (token ja foi capturado no useEffect anterior — neste estagio
          // o popup-less flow conta com server-side cookie httpOnly setado
          // pelo callback do server). Best-effort: se pathname ausente,
          // cai pra '/'.
          try {
            const targetPath = (snap.pathname && snap.pathname.length > 0)
              ? snap.pathname
              : "/";
            // Evita loop: nao redireciona pra propria /spotify-callback.
            if (targetPath !== window.location.pathname) {
              window.location.replace(targetPath);
            }
          } catch {
            // ignore
          }
        }, 100);
      }
    }

    try {
      if (window.opener) {
        const payload = error
          ? { type: "spotify-oauth-error", reason: error }
          : { type: "spotify-oauth-success", code, state };
        window.opener.postMessage(payload, window.location.origin);
        try {
          window.close();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <SpotifyOAuthErrorDialog
          open={errorOpen}
          reason={error}
          onOpenChange={setErrorOpen}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Concluindo conexao...</h1>
        <p className="mt-2 text-muted-foreground">
          Voce pode fechar esta janela.
        </p>
      </div>
    </div>
  );
}

export { SpotifyCallbackPage };
