// Sprint Spotify E2E (/simplify) — fonte única dos sets de elegibilidade de
// tier usados pelos gates de UX do Spotify (MiniPlayerBar + SpotifySearchDialog).
//
// IMPORTANTE: estes sets são apenas o MIRROR de UX. A autoridade real é o
// server (`server/coach/planEligibility.ts:resolveEligiblePlanTier` +
// `ALLOWED_TIERS` em `server/routes/spotifyAudio.ts`), que pode negar via 403
// mesmo quando o client mostra o gate aberto. 'active' resolve server-side para
// pro/premium/admin; incluído aqui para não desabilitar a busca de pagantes.
// Manter em UM lugar evita o drift de editar 2-3 sets em lockstep.

export const SPOTIFY_SEARCH_ELIGIBLE_TIERS = new Set([
  "pro",
  "premium",
  "admin",
  "trial",
  "active",
]);

export const SPOTIFY_BLOCKED_TIERS = new Set(["free", "expired", ""]);
