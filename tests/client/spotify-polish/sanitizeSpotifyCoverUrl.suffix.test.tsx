/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spotify Polish — B-COVER-1 (ADR-221 §D6) — paridade CLIENT.
 *
 * Module alvo: client/src/lib/audio-engine/sanitizeCoverUrl.ts ->
 *   sanitizeSpotifyCoverUrl. Hoje usa allowlist EXATA de 3 hosts; capas custom
 *   de playlist (image-cdn-ak.spotifycdn.com) viram null -> placeholder cinza.
 *
 * Contrato (D6): o client delega ao SSoT shared/spotifyCoverHosts (allowlist por
 *   sufixo). Asserts abaixo FALHAM hoje (host custom rejeitado) ate o delegate.
 */

import { describe, it, expect } from 'vitest';

async function loadFn() {
  const mod = await import('@/lib/audio-engine/sanitizeCoverUrl');
  return mod.sanitizeSpotifyCoverUrl;
}

describe('sanitizeSpotifyCoverUrl por sufixo (B-COVER-1 / D6 — client)', () => {
  it('aceita https://i.scdn.co/... (nao regride)', async () => {
    const fn = await loadFn();
    const url = 'https://i.scdn.co/image/abc';
    expect(fn(url)).toBe(url);
  });

  it('aceita capa custom image-cdn-ak.spotifycdn.com (hoje vira null — bug)', async () => {
    const fn = await loadFn();
    const url = 'https://image-cdn-ak.spotifycdn.com/image/abc';
    expect(fn(url)).toBe(url);
  });

  it('aceita image-cdn-fa.spotifycdn.com', async () => {
    const fn = await loadFn();
    const url = 'https://image-cdn-fa.spotifycdn.com/image/def';
    expect(fn(url)).toBe(url);
  });

  it('rejeita host fora dos sufixos permitidos', async () => {
    const fn = await loadFn();
    expect(fn('https://malicious.example.com/x.png')).toBeNull();
  });

  it('rejeita http:// (so HTTPS)', async () => {
    const fn = await loadFn();
    expect(fn('http://i.scdn.co/image/abc')).toBeNull();
  });

  it('rejeita boundary spoof scdn.co.evil.com', async () => {
    const fn = await loadFn();
    expect(fn('https://scdn.co.evil.com/x.png')).toBeNull();
  });
});
