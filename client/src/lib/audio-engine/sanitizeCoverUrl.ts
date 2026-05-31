// sanitizeCoverUrl — Sprint Mini Player 1.1 / RF-02 + MP1.2 / RF-03.
// Centraliza validacao de URLs de cover (lesson coverUrl, Media Session
// artwork, MiniPlayerBar/Expanded <img src=...>). Bloqueia pseudo-protocols
// (javascript:, data:, file:, ftp:) e URLs malformadas/relativas.
//
// Retorna a propria string se http/https valida; null caso contrario.

/**
 * Sanitize cover URL for safe rendering in <img> + Media Session API.
 *
 * @policy
 * - HTTPS preferido; HTTP aceito (Media Session API tolera ambos).
 * - URLs relativas REJEITADAS (sem base path confiavel no contexto
 *   cross-driver — engine MP1 audio-engine, MP2 Spotify, futuros).
 * - `data:image/*` BLOQUEADO by-design (ver @security).
 * - Outros schemes (`javascript:`, `file:`, `ftp:`, `blob:`) BLOQUEADOS.
 *
 * @security
 * `data:image/*` rejeitado para evitar XSS payload via data URI: atacante
 * pode embarcar SVG com <script> inline (`data:image/svg+xml;...`), escapando
 * CSP `img-src` e executando codigo no contexto da pagina. Mesmo formatos
 * "seguros" (png/jpeg) abrem porta pra exfiltracao por timing/cache.
 *
 * Se MP2 (Spotify driver) ou outro futuro consumer quiser embedded
 * placeholder, abrir excecao explicita com branch dedicado + validacao de
 * mime-type estrita (`data:image/png`, `data:image/jpeg` apenas; NUNCA
 * `data:image/svg+xml`) + size-limit + base64 decode integrity check.
 *
 * @returns URL string normalizada (igual ao input quando valida) ou null
 *   se invalida, relativa, pseudo-protocol ou bloqueada por policy.
 */
export function sanitizeCoverUrl(
  url: string | null | undefined,
): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

// Sprint SPOTIFY-DEEP / RF-05 + ADR-208 §6 — Spotify cover whitelist.
// B-COVER-1 / ADR-221 §D6: allowlist por SUFIXO (.scdn.co / .spotifycdn.com),
// SSoT em shared/spotifyCoverHosts — paridade server+client. Capas custom de
// playlist (image-cdn-ak.spotifycdn.com) agora passam.
import { sanitizeSpotifyCover } from "@shared/spotifyCoverHosts";

/**
 * Sanitize Spotify cover URL — delega ao SSoT shared (allowlist por sufixo).
 * HTTPS-only + hostname em *.scdn.co / *.spotifycdn.com. Outros → null.
 */
export function sanitizeSpotifyCoverUrl(
  url: string | null | undefined,
): string | null {
  return sanitizeSpotifyCover(url);
}
