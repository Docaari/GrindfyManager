/**
 * SSoT da allowlist de hosts de capa Spotify (ADR-221 §D6 / B-COVER-1).
 *
 * Allowlist por SUFIXO de dominio (.scdn.co / .spotifycdn.com), boundary-safe:
 * cobre todos os subdominios presentes e futuros (i.scdn.co, mosaic.scdn.co,
 * image-cdn-ak.spotifycdn.com, ...) sem quebrar a cada novo CDN.
 *
 * Consumido por server (routes/spotifyAudio.ts) e client (sanitizeCoverUrl.ts)
 * via import unico — sem divergencia (lesson #10).
 */

const ALLOWED_COVER_SUFFIXES = [".scdn.co", ".spotifycdn.com"] as const;

/** true se hostname termina em um sufixo permitido (boundary-safe). */
export function isAllowedSpotifyCoverHost(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return ALLOWED_COVER_SUFFIXES.some(
    (sfx) => h === sfx.slice(1) || h.endsWith(sfx),
  );
}

/** Sanitiza uma cover URL Spotify: HTTPS + host permitido por sufixo. */
export function sanitizeSpotifyCover(
  url: string | null | undefined,
): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (!isAllowedSpotifyCoverHost(u.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}
