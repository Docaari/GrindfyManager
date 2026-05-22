// Sprint Mini Player 2 (RF-01.1) — /spotify-callback fallback page.
//
// O server handler (GET /api/audio/spotify/oauth-callback) ja envia HTML que
// faz postMessage + window.close. Esta page eh fallback para o caso do user
// navegar diretamente.

import React from "react";

export default function SpotifyCallbackPage() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.opener) {
        const payload = error
          ? { type: "spotify-oauth-error", reason: error }
          : { type: "spotify-oauth-success", code, state };
        window.opener.postMessage(payload, window.location.origin);
        // Apenas fecha quando ha opener — caso usuario navegou direto,
        // fechar destrui o documento e quebra a UX.
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

  // Render mensagem antes do effect rodar
  // (effects rodam apos initial render — message visivel briefly).
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Conexao cancelada</h1>
          <p className="mt-2 text-muted-foreground">
            Voce pode fechar esta janela e tentar novamente.
          </p>
        </div>
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
