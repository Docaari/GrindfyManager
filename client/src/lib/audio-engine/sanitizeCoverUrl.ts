// sanitizeCoverUrl — Sprint Mini Player 1.1 / RF-02.
// Centraliza validacao de URLs de cover (lesson coverUrl, Media Session
// artwork, MiniPlayerBar/Expanded <img src=...>). Bloqueia pseudo-protocols
// (javascript:, data:, file:, ftp:) e URLs malformadas/relativas.
//
// Retorna a propria string se http/https valida; null caso contrario.

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
