/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-02: `urlCanonicalize` (Layer 1 dedupe).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-02
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §4
 *
 * Funcao pura `canonicalizeUrl(input: string) => string`.
 *
 * Regras:
 *   - lowercase do hostname (path mantem case)
 *   - strip query params: utm_*, fbclid, gclid, mc_cid, mc_eid, ref, source, share, si, feature, igshid
 *   - manter outros query params, ordenados alfabeticamente por key
 *   - normalizar twitter.com → x.com
 *   - strip trailing slash do path (exceto path '/' raiz)
 *   - strip fragment (#...)
 *   - decodificar percent-encoding redundante (%2F → /)
 *   - URL invalido → retorna input intocado
 *
 * Status RED: modulo `server/services/news/urlCanonicalize` NAO existe.
 */

import { describe, it, expect } from 'vitest';

describe('canonicalizeUrl (RF-02)', () => {
  it('strip utm_source + ref + manter restante', async () => {
    // RF-02 AC: utm_*/ref/share strippados
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://example.com/post?utm_source=tw&ref=share&id=123');
    expect(result).toBe('https://example.com/post?id=123');
  });

  it('strip todos UTM params (utm_source, utm_medium, utm_campaign, utm_term, utm_content)', async () => {
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl(
      'https://example.com/x?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e&keep=ok',
    );
    expect(result).toBe('https://example.com/x?keep=ok');
  });

  it('strip fbclid / gclid / mc_cid / mc_eid / igshid / si / feature', async () => {
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl(
      'https://x.com/post?fbclid=abc&gclid=def&mc_cid=g&mc_eid=h&igshid=i&si=j&feature=k&id=42',
    );
    expect(result).toBe('https://x.com/post?id=42');
  });

  it('twitter.com → x.com (host normalize)', async () => {
    // RF-02 AC: canonical de twitter URL == canonical de x URL
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const a = canonicalizeUrl('https://X.com/PokerStars/status/123?utm_source=tw&ref=share');
    const b = canonicalizeUrl('https://twitter.com/PokerStars/status/123/');
    expect(a).toBe(b);
  });

  it('host lowercased mas path preserva case', async () => {
    // RF-02 AC: path /PokerStars/... permanece (case-sensitive em alguns CMS)
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://X.COM/PokerStars/status/123');
    expect(result).toContain('x.com');
    expect(result).toContain('PokerStars');
  });

  it('ordena query params alfabeticamente por key', async () => {
    // RF-02 AC: ?b=2&a=1 vira ?a=1&b=2
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const a = canonicalizeUrl('https://example.com/post?b=2&a=1');
    const b = canonicalizeUrl('https://example.com/post?a=1&b=2');
    expect(a).toBe(b);
  });

  it('strip trailing slash em path nao-raiz', async () => {
    // RF-02 AC: /post/ → /post
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const a = canonicalizeUrl('https://example.com/post/');
    const b = canonicalizeUrl('https://example.com/post');
    expect(a).toBe(b);
  });

  it('preserva trailing slash em path raiz "/"', async () => {
    // path raiz "/" mantem
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://example.com/');
    // Aceita ambas variantes — `https://example.com/` ou `https://example.com`.
    // Importante: 2 chamadas iguais resultam mesma string.
    const result2 = canonicalizeUrl('https://example.com');
    expect(result).toBe(result2);
  });

  it('strip fragment #hash', async () => {
    // RF-02 AC: fragment removido
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://example.com/post#section-x');
    expect(result).not.toContain('#');
  });

  it('URL malformado retorna input intocado (sem throw)', async () => {
    // RF-02 AC: URL invalido nao quebra batch
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    expect(() => canonicalizeUrl('not a url')).not.toThrow();
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });

  it('idempotencia: canonical(canonical(x)) === canonical(x)', async () => {
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const url = 'https://Twitter.com/PokerStars/status/123/?utm_source=foo&b=2&a=1#frag';
    const once = canonicalizeUrl(url);
    const twice = canonicalizeUrl(once);
    expect(twice).toBe(once);
  });

  it('exemplo combinado: utm + twitter.com + trailing slash + fragment', async () => {
    // Caso completo da spec (AC principal).
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const a = canonicalizeUrl('https://X.com/PokerStars/status/123?utm_source=tw&ref=share');
    const b = canonicalizeUrl('https://twitter.com/PokerStars/status/123/');
    expect(a).toBe(b);
    expect(a).toMatch(/^https:\/\/x\.com\/PokerStars\/status\/123/);
  });

  it('strip "share" param', async () => {
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://example.com/post?share=fb&id=1');
    expect(result).toBe('https://example.com/post?id=1');
  });

  it('strip "source" param', async () => {
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const result = canonicalizeUrl('https://example.com/post?source=email&keep=1');
    expect(result).toBe('https://example.com/post?keep=1');
  });

  it('decodifica percent-encoding redundante (%2F → /)', async () => {
    // RF-02 AC: %2F → / quando seguro
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const a = canonicalizeUrl('https://example.com/path%2Fsub');
    expect(a).toBe('https://example.com/path/sub');
  });

  it('protocolo http vs https sao distintos (nao normaliza protocolo)', async () => {
    // Spec nao manda forcar https. Mantem original.
    const { canonicalizeUrl } = await import('../../../server/services/news/urlCanonicalize');
    const http = canonicalizeUrl('http://example.com/p');
    const https = canonicalizeUrl('https://example.com/p');
    expect(http).not.toBe(https);
  });
});
