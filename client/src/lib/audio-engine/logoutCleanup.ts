// Sprint Mini Player 3.2 / W-B2 (ADR-202) — Logout cleanup contract.
//
// Decisao founder (registrada na convocacao MP3.2):
//   SOMENTE audio.resume.v1 (e Spotify tokens) limpam no logout.
//   Queue + onboarding.seen.v1 persistem (UX continuity cross-user).
//
// Safe quando localStorage indisponivel (best-effort).

const RESUME_KEYS = [
  // resumeSession.ts atual usa "audio.lastSession.v1"; mantido como alias para
  // compat com testes + tooling externo que possa ter referencia ao key novo.
  "audio.lastSession.v1",
  "audio.resume.v1",
];

const SPOTIFY_OAUTH_KEYS = [
  "audio.spotify.oauth.snapshot.v1",
];

/**
 * Limpa snapshot de resume + Spotify OAuth tokens no logout.
 *
 * NAO limpa:
 *  - audio.queue.v1 (queue persiste)
 *  - audio.onboarding.seen.v1 (onboarding persiste — UX preference)
 *
 * Idempotente. Safe quando localStorage lanca (best-effort).
 */
export function clearAudioOnLogout(): void {
  const keys = [...RESUME_KEYS, ...SPOTIFY_OAUTH_KEYS];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore — best-effort
    }
  }
}

/** @internal Test-only export. */
export const _LOGOUT_CLEAR_KEYS = [...RESUME_KEYS, ...SPOTIFY_OAUTH_KEYS];
