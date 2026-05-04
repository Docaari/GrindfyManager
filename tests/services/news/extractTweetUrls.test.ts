/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-04: `extractTweetUrls` (Layer 3 dedupe support).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-04
 *
 * Funcao `extractTweetUrls(summary: string) => string[]`.
 *
 * Regras:
 *   - regex /https?:\/\/[^\s<>"']+/gi captura URLs no summary
 *   - filtra URLs do proprio X (x.com, twitter.com, t.co)
 *   - aplica canonicalizeUrl em cada match
 *   - retorna array unico (Set dedupe interno)
 *
 * Status RED: modulo `server/services/news/extractTweetUrls` NAO existe.
 */

import { describe, it, expect } from 'vitest';

describe('extractTweetUrls (RF-04)', () => {
  it('extrai URL externa do summary, ignora t.co self-X', async () => {
    // RF-04 AC principal: filtro t.co
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls('Confira https://blog.gtowizard.com/post-x e https://t.co/abc');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('blog.gtowizard.com');
  });

  it('summary sem URLs retorna []', async () => {
    // RF-04 AC: zero matches
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls('Texto sem links nenhum');
    expect(out).toEqual([]);
  });

  it('URLs duplicadas no mesmo summary aparecem uma vez', async () => {
    // RF-04 AC: Set dedupe
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls(
      'Veja https://blog.example.com/post e tambem https://blog.example.com/post novamente.',
    );
    expect(out).toHaveLength(1);
  });

  it('filtra x.com self-link', async () => {
    // RF-04 AC: x.com filtrado
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls(
      'RT https://x.com/PokerStars/status/123 link https://blog.gtowizard.com/p',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('blog.gtowizard.com');
  });

  it('filtra twitter.com self-link', async () => {
    // RF-04 AC: twitter.com filtrado
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls(
      'RT https://twitter.com/foo/status/1 see https://blog.example.com/x',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('blog.example.com');
  });

  it('multiplas URLs externas distintas', async () => {
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls(
      'Veja https://blog.gtowizard.com/p1 e https://hand2note.com/blog/x',
    );
    expect(out).toHaveLength(2);
  });

  it('aplica canonicalizeUrl (strip utm)', async () => {
    // RF-04 AC: canonical normaliza antes de retornar
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls('Link https://blog.example.com/p?utm_source=tw&id=5');
    expect(out).toHaveLength(1);
    expect(out[0]).not.toContain('utm_source');
    expect(out[0]).toContain('id=5');
  });

  it('summary com t.co + x.com + externo retorna apenas externo', async () => {
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    const out = extractTweetUrls(
      'See https://t.co/abc and https://x.com/u/status/1 plus https://blog.foo.com/p',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('blog.foo.com');
  });

  it('summary vazio retorna []', async () => {
    const { extractTweetUrls } = await import('../../../server/services/news/extractTweetUrls');
    expect(extractTweetUrls('')).toEqual([]);
  });
});
