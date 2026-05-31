/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — B-COVER-1 (ADR-221 §D6).
 *
 * Module alvo (NOVO): shared/spotifyCoverHosts.ts
 *   - isAllowedSpotifyCoverHost(hostname): allowlist por SUFIXO (.scdn.co /
 *     .spotifycdn.com), boundary-safe.
 *   - sanitizeSpotifyCover(url): HTTPS + host permitido por sufixo -> url | null.
 *
 * Contrato (ADR-221 §D6):
 *   ACEITA: i.scdn.co, mosaic.scdn.co, image-cdn-ak.spotifycdn.com,
 *           image-cdn-fa.spotifycdn.com, wrapped-images.spotifycdn.com.
 *   REJEITA: host fora de .scdn.co/.spotifycdn.com, http://, evilscdn.co,
 *            scdn.co.evil.com.
 *
 * Este modulo NAO existe ainda -> import falha (red). Quando o implementer
 * criar shared/spotifyCoverHosts.ts os asserts passam.
 */

import { describe, it, expect } from 'vitest';

async function loadMod() {
  return await import('@shared/spotifyCoverHosts');
}

describe('isAllowedSpotifyCoverHost (B-COVER-1 / D6)', () => {
  it('aceita i.scdn.co', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('i.scdn.co')).toBe(true);
  });

  it('aceita mosaic.scdn.co', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('mosaic.scdn.co')).toBe(true);
  });

  it('aceita image-cdn-ak.spotifycdn.com (capa custom de playlist)', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('image-cdn-ak.spotifycdn.com')).toBe(true);
  });

  it('aceita image-cdn-fa.spotifycdn.com', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('image-cdn-fa.spotifycdn.com')).toBe(true);
  });

  it('rejeita host fora de .scdn.co/.spotifycdn.com', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('cdn.example.com')).toBe(false);
  });

  it('rejeita evilscdn.co (nao termina em .scdn.co — boundary-safe)', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('evilscdn.co')).toBe(false);
  });

  it('rejeita scdn.co.evil.com (sufixo no MEIO nao conta)', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('scdn.co.evil.com')).toBe(false);
  });

  it('rejeita hostname vazio', async () => {
    const { isAllowedSpotifyCoverHost } = await loadMod();
    expect(isAllowedSpotifyCoverHost('')).toBe(false);
  });
});

describe('sanitizeSpotifyCover (B-COVER-1 / D6)', () => {
  it('aceita https em host permitido (retorna a url)', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    const url = 'https://image-cdn-ak.spotifycdn.com/image/abc';
    expect(sanitizeSpotifyCover(url)).toBe(url);
  });

  it('aceita https://i.scdn.co/...', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    const url = 'https://i.scdn.co/image/xyz';
    expect(sanitizeSpotifyCover(url)).toBe(url);
  });

  it('rejeita http:// (so HTTPS)', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    expect(sanitizeSpotifyCover('http://i.scdn.co/image/xyz')).toBeNull();
  });

  it('rejeita host nao permitido', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    expect(sanitizeSpotifyCover('https://evil.com/image/xyz')).toBeNull();
  });

  it('rejeita null/undefined/empty', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    expect(sanitizeSpotifyCover(null)).toBeNull();
    expect(sanitizeSpotifyCover(undefined)).toBeNull();
    expect(sanitizeSpotifyCover('')).toBeNull();
  });

  it('rejeita url malformada', async () => {
    const { sanitizeSpotifyCover } = await loadMod();
    expect(sanitizeSpotifyCover('not a url')).toBeNull();
  });
});
