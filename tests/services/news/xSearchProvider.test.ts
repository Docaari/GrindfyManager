/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint News-3 — RF-06: XSearchProvider (xAI Live Search wrapper).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-06
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §2
 *
 * Funcao `fetchXSource(source: NewsSource) => Promise<NewsItem[]>`.
 *
 * Cenarios:
 *   - Resposta valida com 5 citations → 5 NewsItems
 *   - Citation com tweet ID 10+ trailing zeros → drop + log warn
 *   - HTTP 4xx/5xx/timeout → [] + log
 *   - XAI_API_KEY ausente → [] + log warn (sem throw)
 *   - from_date = now - 7d UTC, to_date = now UTC
 *   - Citation com URL malformado → drop
 *
 * Status RED: modulo `server/services/news/xSearchProvider` NAO existe.
 *
 * Lessons aplicadas:
 *   #5  vi.fn() ok para mock de fetch (nao constructor)
 *   #6  conversao ja nao se aplica aqui
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

function loadXaiFixture(): any {
  const json = fs.readFileSync(
    path.resolve(__dirname, '../../fixtures/news-xai/live-search-response.json'),
    'utf8',
  );
  return JSON.parse(json);
}

function makeFetchResponse(opts: { ok: boolean; status?: number; body?: any }): any {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: vi.fn(async () => JSON.stringify(opts.body ?? {})),
    json: vi.fn(async () => opts.body ?? {}),
    headers: new Map(),
  };
}

function makeXSource(overrides: any = {}): any {
  return {
    id: 'pokerstars',
    name: 'PokerStars',
    category: 'sites',
    platform: 'pokerstars',
    enabled: true,
    rssUrl: null,
    homepageUrl: null,
    scrapeStrategy: 'x_only',
    xHandle: 'PokerStars',
    ...overrides,
  };
}

const ORIGINAL_KEY = process.env.XAI_API_KEY;

beforeEach(() => {
  process.env.XAI_API_KEY = 'test-xai-key-1234567890';
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = ORIGINAL_KEY;
});

describe('XSearchProvider — happy path (RF-06)', () => {
  it('resposta valida com 5 citations retorna NewsItems com fields completos', async () => {
    // RF-06 AC: 5 citations validas (1 deve ser dropada por trailing zeros, 4 sobrevivem)
    const fixture = loadXaiFixture();
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());

    // 1 citation tem 12 trailing zeros — deve ser dropada
    // 4 sobrevivem
    expect(out.length).toBe(4);
    for (const item of out) {
      expect(item.title).toBeTruthy();
      expect(item.url).toMatch(/^https:\/\/x\.com\/[^/]+\/status\/\d{15,20}$/);
      expect(item.publishedAt).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.sourceId).toBe('pokerstars');
    }
  });
});

describe('XSearchProvider — trailing zeros guard (RF-06)', () => {
  it('citation com tweet ID com 10+ trailing zeros eh dropada', async () => {
    // RF-06 AC principal: anti-hallucination guard
    const body = {
      citations: [
        {
          url: 'https://x.com/foo/status/12345678900000000000',
          title: 'Suspicious',
          snippet: 'snip',
          published_at: '2026-04-30T12:00:00Z',
        },
        {
          url: 'https://x.com/foo/status/1786543210123456789',
          title: 'Real',
          snippet: 'snip',
          published_at: '2026-04-30T12:00:00Z',
        },
      ],
    };
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());

    expect(out.length).toBe(1);
    expect(out[0].title).toBe('Real');
    // log warn esperado (texto livre — checar prefixo)
    const warnCalls = warnSpy.mock.calls.flat().join(' ');
    expect(warnCalls).toMatch(/news\/xsearch|trailing/i);
  });

  it('citation com URL malformado (nao bate regex) eh dropada', async () => {
    // RF-06 AC: regex validation rigorosa
    const body = {
      citations: [
        {
          url: 'https://example.com/not-a-tweet',
          title: 'Bad',
          snippet: 'snip',
          published_at: '2026-04-30T12:00:00Z',
        },
        {
          url: 'https://x.com/foo/status/1786543210123456789',
          title: 'Good',
          snippet: 'snip',
          published_at: '2026-04-30T12:00:00Z',
        },
      ],
    };
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());
    expect(out.length).toBe(1);
    expect(out[0].title).toBe('Good');
  });
});

describe('XSearchProvider — error handling (RF-06)', () => {
  it('HTTP 4xx retorna [] + log error', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 401 }),
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());

    expect(out).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });

  it('HTTP 5xx retorna [] sem throw', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: false, status: 502 }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await expect(fetchXSource(makeXSource())).resolves.toEqual([]);
  });

  it('network error retorna [] sem throw', async () => {
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ECONNRESET'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await expect(fetchXSource(makeXSource())).resolves.toEqual([]);
  });

  it('XAI_API_KEY ausente skipa silenciosamente com [] + log warn', async () => {
    // RF-06 AC: sem key → [] + warn, nao throw
    delete process.env.XAI_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { citations: [] } }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());

    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('XSearchProvider — search params (RF-06)', () => {
  it('envia from_date = now-7d UTC e to_date = now UTC', async () => {
    // RF-06 AC: janela de 7 dias UTC
    const FIXED_NOW = new Date('2026-05-04T15:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { citations: [] } }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource());

    expect(fetchSpy).toHaveBeenCalled();
    const callArgs = fetchSpy.mock.calls[0];
    const init: any = callArgs[1] ?? {};
    const body = init.body ? JSON.parse(init.body) : {};
    const sp = body.search_parameters ?? {};
    // ISO yyyy-mm-dd
    expect(sp.to_date).toBe('2026-05-04');
    expect(sp.from_date).toBe('2026-04-27');

    vi.useRealTimers();
  });

  it('envia x_handles[] = [source.xHandle]', async () => {
    // RF-06 AC: handle correto enviado
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { citations: [] } }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource({ xHandle: 'sharkscope' }));

    const init: any = fetchSpy.mock.calls[0][1] ?? {};
    const body = JSON.parse(init.body ?? '{}');
    const sources = body?.search_parameters?.sources ?? [];
    expect(sources[0]).toMatchObject({ type: 'x', x_handles: ['sharkscope'] });
  });

  it('envia Authorization Bearer XAI_API_KEY', async () => {
    process.env.XAI_API_KEY = 'sk-xai-test-key-99999';
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: { citations: [] } }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource());

    const init: any = fetchSpy.mock.calls[0][1] ?? {};
    const auth =
      init.headers?.Authorization ?? init.headers?.authorization ?? '';
    expect(auth).toMatch(/^Bearer sk-xai-test-key-99999/);
  });
});
