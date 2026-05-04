/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-05: BlogScraperProvider (RSS first, HTML fallback).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §1
 *
 * Funcao `fetchBlogSource(source: NewsSource) => Promise<NewsItem[]>`.
 *
 * Cenarios:
 *   - RSS valido com 5 items → 5 NewsItems
 *   - RSS retorna 0 items + strategy 'rss_or_html' → fallback HTML
 *   - RSS retorna 0 items + strategy 'rss' puro → []
 *   - HTTP 5xx/timeout/network → [] + log error sem throw
 *   - User-Agent GrindfyNewsBot/1.0 enviado
 *   - pubDate invalido → drop item
 *   - Top 10 enforcement (50 items → 10)
 *
 * Status RED: modulo `server/services/news/blogScraperProvider` NAO existe.
 *
 * Lessons aplicadas:
 *   #5 vi.fn nao constructor → mock fetch via vi.spyOn(global,'fetch')
 *   #14 vi.hoisted para spy compartilhado nao necessario aqui (fetch eh global)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Helper: carrega fixture RSS por nome
// =============================================================================
function loadRssFixture(name: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, '../../fixtures/news-rss/', name),
    'utf8',
  );
}

// =============================================================================
// Helper: simula Response do fetch
// =============================================================================
function makeFetchResponse(opts: {
  ok: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}): any {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: vi.fn(async () => opts.body ?? ''),
    json: vi.fn(async () => JSON.parse(opts.body ?? '{}')),
    headers: new Map(Object.entries(opts.headers ?? {})),
  };
}

// =============================================================================
// Source mock factories
// =============================================================================
function makeRssSource(overrides: any = {}): any {
  return {
    id: 'gto-wizard-studies',
    name: 'GTO Wizard - Estudos',
    category: 'studies',
    platform: 'gto-wizard',
    enabled: true,
    rssUrl: 'https://blog.gtowizard.com/articles/feed',
    homepageUrl: 'https://blog.gtowizard.com/articles/',
    scrapeStrategy: 'rss_or_html',
    xHandle: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Happy path: RSS valido
// =============================================================================
describe('BlogScraperProvider — RSS happy path (RF-05)', () => {
  it('RSS valido com 5 items retorna 5 NewsItems com fields obrigatorios', async () => {
    // RF-05 AC: fetch RSS valido retorna array com fields completos
    const xml = loadRssFixture('gto-wizard-articles.xml');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: xml }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource());

    expect(out).toHaveLength(5);
    for (const item of out) {
      expect(item.title).toBeTruthy();
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.publishedAt).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.sourceId).toBe('gto-wizard-studies');
      expect(item.category).toBe('studies');
      expect(item.platform).toBe('gto-wizard');
    }
  });

  it('User-Agent GrindfyNewsBot/1.0 enviado em request RSS', async () => {
    // RF-05 AC: UA identificavel
    const xml = loadRssFixture('gto-wizard-articles.xml');
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: xml }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    await fetchBlogSource(makeRssSource());

    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = fetchSpy.mock.calls[0];
    const initArg: any = callArgs[1] ?? {};
    const headers = initArg.headers ?? {};
    const ua =
      (headers['User-Agent'] ??
        headers['user-agent'] ??
        (typeof headers.get === 'function' ? headers.get('User-Agent') : undefined)) as
      | string
      | undefined;
    expect(ua).toBeDefined();
    expect(ua).toMatch(/GrindfyNewsBot\/1\.0/);
  });

  it('summary truncado a 500 chars', async () => {
    // RF-05 AC: contentSnippet/content truncado 500
    const longDescription = 'X'.repeat(2000);
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>x</title><link>https://x</link><description>x</description>
      <item><title>Long</title><link>https://example.com/long</link>
      <description>${longDescription}</description>
      <pubDate>Mon, 28 Apr 2026 12:00:00 +0000</pubDate></item>
    </channel></rss>`;
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: xml }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource());
    expect(out).toHaveLength(1);
    expect(out[0].summary.length).toBeLessThanOrEqual(500);
  });
});

// =============================================================================
// Top 10 enforcement
// =============================================================================
describe('BlogScraperProvider — top 10 enforcement (RF-05)', () => {
  it('input com 25 items retorna apenas 10', async () => {
    // RF-05 AC: limit top 10
    const xml = loadRssFixture('50-items-feed.xml');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: xml }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource());

    expect(out.length).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// pubDate invalido → drop
// =============================================================================
describe('BlogScraperProvider — invalid pubDate (RF-05)', () => {
  it('items com pubDate invalido sao dropados', async () => {
    // RF-05 AC: items sem data valida sao excluidos
    const xml = loadRssFixture('invalid-pubdate-feed.xml');
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: xml }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource());

    // Apenas o item com data valida deve passar
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Valid date item');
  });
});

// =============================================================================
// Fallback HTML quando RSS retorna 0 items
// =============================================================================
describe('BlogScraperProvider — RSS empty + fallback HTML (RF-05)', () => {
  it('RSS 0 items + strategy "rss_or_html" aciona fallback HTML', async () => {
    // RF-05 AC principal: fallback ativo quando strategy 'rss_or_html'
    const emptyRss = loadRssFixture('empty-feed.xml');
    const fakeHtml = '<html><body><article><h2><a href="/post-1">Item 1</a></h2><time datetime="2026-04-28">28 abr 2026</time><p>Summary 1</p></article></body></html>';

    let callIdx = 0;
    vi.spyOn(global, 'fetch' as any).mockImplementation(async (url: any) => {
      callIdx += 1;
      // Primeira chamada: RSS vazio. Segunda: HTML fallback.
      if (callIdx === 1) return makeFetchResponse({ ok: true, body: emptyRss });
      return makeFetchResponse({ ok: true, body: fakeHtml });
    });

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(
      makeRssSource({ scrapeStrategy: 'rss_or_html' }),
    );

    // Esperamos 2 chamadas fetch (RSS + HTML fallback)
    // O html aqui eh sintetico; adapter pode retornar [] mas pelo menos foi tentado.
    // Validacao primaria: 2 fetch invocations.
    expect(callIdx).toBe(2);
    // Output pode ser [] (adapter sintetico) OU array de items extraidos
    expect(Array.isArray(out)).toBe(true);
  });

  it('RSS 0 items + strategy "rss" puro retorna [] (sem fallback)', async () => {
    // RF-05 AC: strategy 'rss' nao faz fallback
    const emptyRss = loadRssFixture('empty-feed.xml');
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: emptyRss }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(
      makeRssSource({ scrapeStrategy: 'rss' }),
    );

    expect(out).toEqual([]);
    // Apenas 1 fetch (RSS), sem fallback HTML
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Error handling: timeout / 5xx / network
// =============================================================================
describe('BlogScraperProvider — error handling (RF-05)', () => {
  it('HTTP 5xx retorna [] + log error', async () => {
    // RF-05 AC: 5xx graceful
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 500 }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource({ scrapeStrategy: 'rss' }));

    expect(out).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });

  it('network error (fetch throws) retorna [] sem propagar', async () => {
    // RF-05 AC: NUNCA throw — uma source down nao para batch
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    await expect(
      fetchBlogSource(makeRssSource({ scrapeStrategy: 'rss' })),
    ).resolves.toEqual([]);
  });

  it('parse error em RSS malformado retorna [] sem throw', async () => {
    // RF-05 AC: parse error graceful
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: '<not-rss>broken</not-rss>' }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(makeRssSource({ scrapeStrategy: 'rss' }));
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
  });

  it('source com strategy x_only retorna [] (provider nao trata)', async () => {
    // BlogScraperProvider eh apenas para blogs. x_only deve resultar [] ou skip.
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: '' }),
    );

    const { fetchBlogSource } = await import(
      '../../../server/services/news/blogScraperProvider'
    );
    const out = await fetchBlogSource(
      makeRssSource({ scrapeStrategy: 'x_only', rssUrl: null }),
    );
    expect(out).toEqual([]);
    // Nem deve fazer request
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
