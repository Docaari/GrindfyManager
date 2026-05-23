/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint SPOTIFY-DEEP / RF-05 — sanitizeCoverUrl extended (Spotify hosts).
 *
 * Module alvo: client/src/lib/audio-engine/sanitizeCoverUrl.ts
 *
 * Comportamento ja existente: HTTP/HTTPS-only, rejeita data:/javascript:/file:/relative.
 *
 * NOVO contrato (este sprint):
 *   - Helper companheiro `sanitizeSpotifyCoverUrl(url)` OU extensao do helper
 *     existente para WHITELIST de hosts Spotify quando contexto explicito.
 *   - Whitelist hosts: i.scdn.co, mosaic.scdn.co, wrapped-images.spotifycdn.com.
 *   - Outros hosts (mesmo HTTPS) caem em null quando passado o flag `{ provider: 'spotify' }`.
 *
 * Este teste assume que existe `sanitizeSpotifyCoverUrl` exportado.
 */
import { describe, it, expect } from "vitest";

// Import sob teste — pode ser do mesmo modulo `sanitizeCoverUrl.ts` ou
// arquivo separado. Implementer decide nome; teste usa import do mesmo path.

describe("sanitizeCoverUrl + Spotify whitelist (RF-05)", () => {
  it("aceita i.scdn.co", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    expect(typeof fn).toBe("function");
    const v = fn("https://i.scdn.co/image/abc123");
    expect(v).toBe("https://i.scdn.co/image/abc123");
  });

  it("aceita mosaic.scdn.co", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    const v = fn("https://mosaic.scdn.co/640/abc");
    expect(v).toBe("https://mosaic.scdn.co/640/abc");
  });

  it("aceita wrapped-images.spotifycdn.com", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    const v = fn("https://wrapped-images.spotifycdn.com/uri/abc");
    expect(v).toBe("https://wrapped-images.spotifycdn.com/uri/abc");
  });

  it("rejeita evil.com mesmo HTTPS no contexto spotify (whitelist strict)", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl;
    expect(typeof fn).toBe("function");
    expect(fn("https://evil.com/cover.jpg")).toBeNull();
  });

  it("rejeita data:image URL (XSS via data URI)", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    expect(fn("data:image/svg+xml;base64,PHN2Zw==")).toBeNull();
  });

  it("rejeita javascript: URL", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    expect(fn("javascript:alert(1)")).toBeNull();
  });

  it("rejeita HTTP nao-spotify host (mesmo http://) — apenas i.scdn.co OK", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl;
    expect(typeof fn).toBe("function");
    expect(fn("http://attacker.com/foo.png")).toBeNull();
  });

  it("nulo/undefined/string vazia → null", async () => {
    const mod = await import("@/lib/audio-engine/sanitizeCoverUrl");
    const fn = (mod as any).sanitizeSpotifyCoverUrl ?? (mod as any).sanitizeCoverUrl;
    expect(fn(null as any)).toBeNull();
    expect(fn(undefined as any)).toBeNull();
    expect(fn("")).toBeNull();
  });
});
