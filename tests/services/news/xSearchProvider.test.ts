/**
 * XSearchProvider tests — atualizados Sprint News-3.1.
 *
 * Migracao: xAI Live Search (deprecated 410) → Agent Tools API (`x_search` tool).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-06 (atualizada)
 *
 * Endpoint novo: POST https://api.x.ai/v1/responses
 * Body novo: { model, input[], tools: [{ type: 'x_search', allowed_x_handles, from_date, to_date }] }
 * Response: output[].content[] com type='output_text' (texto JSON) + annotations[] (URLs reais ground truth)
 *
 * Cenarios testados:
 *   - Resposta valida com 5 tweets no JSON output_text → 4 NewsItems (1 trailing zeros dropado)
 *   - tweet_url nao bate regex → drop
 *   - tweet_url do JSON nao consta nas annotations (halucinacao) → drop
 *   - HTTP 4xx/5xx/timeout → []
 *   - XAI_API_KEY ausente → [] + warn
 *   - Body envia tools[].x_search.allowed_x_handles[handle] + from_date + to_date
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

function loadXaiFixture(): any {
  const json = fs.readFileSync(
    path.resolve(__dirname, '../../fixtures/news-xai/agent-tools-response.json'),
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

/**
 * Helper para sintetizar response no shape Agent Tools.
 * Recebe lista de tweets e gera output_text JSON + annotations URLs (i/status path).
 */
function makeAgentResponse(tweets: Array<{ id: string; handle?: string; title?: string; summary?: string; date?: string }>): any {
  const items = tweets.map((t) => ({
    tweet_url: `https://x.com/${t.handle ?? 'foo'}/status/${t.id}`,
    title: t.title ?? `T-${t.id}`,
    summary: t.summary ?? `S-${t.id}`,
    published_at: t.date ?? '2026-04-30',
  }));
  return {
    id: 'r-test',
    object: 'response',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(items),
            annotations: tweets.map((t) => ({
              type: 'url_citation',
              url: `https://x.com/i/status/${t.id}`,
            })),
          },
        ],
      },
    ],
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
  it('resposta valida com 5 tweets retorna 4 NewsItems (1 trailing zeros dropado)', async () => {
    const fixture = loadXaiFixture();
    vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: fixture }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    const out = await fetchXSource(makeXSource());

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
  it('tweet com ID com 10+ trailing zeros eh dropado', async () => {
    const body = makeAgentResponse([
      { id: '12345678900000000000', handle: 'foo', title: 'Suspicious' },
      { id: '1786543210123456789', handle: 'foo', title: 'Real' },
    ]);
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
    const warnCalls = warnSpy.mock.calls.flat().join(' ');
    expect(warnCalls).toMatch(/news\/xsearch|trailing/i);
  });

  it('tweet_url malformado (nao bate regex) eh dropado', async () => {
    // Construir body manual com URL malformada no JSON E sem citation correspondente
    const body = {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify([
                {
                  tweet_url: 'https://example.com/not-a-tweet',
                  title: 'Bad',
                  summary: 'snip',
                  published_at: '2026-04-30',
                },
                {
                  tweet_url: 'https://x.com/foo/status/1786543210123456789',
                  title: 'Good',
                  summary: 'snip',
                  published_at: '2026-04-30',
                },
              ]),
              annotations: [
                { type: 'url_citation', url: 'https://x.com/i/status/1786543210123456789' },
              ],
            },
          ],
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

  it('tweet_url do JSON sem citation correspondente (halucinacao) eh dropado', async () => {
    // Modelo retorna 2 tweets no JSON, mas annotations so tem 1 citation real.
    const body = {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify([
                {
                  tweet_url: 'https://x.com/foo/status/1786543210123456789',
                  title: 'Real (em annotations)',
                  summary: 's',
                  published_at: '2026-04-30',
                },
                {
                  tweet_url: 'https://x.com/foo/status/9999999999999999999',
                  title: 'Halucinada (NAO esta em annotations)',
                  summary: 's',
                  published_at: '2026-04-30',
                },
              ]),
              annotations: [
                { type: 'url_citation', url: 'https://x.com/i/status/1786543210123456789' },
              ],
            },
          ],
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
    expect(out[0].title).toBe('Real (em annotations)');
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
    delete process.env.XAI_API_KEY;
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: makeAgentResponse([]) }),
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

describe('XSearchProvider — request payload (RF-06 Agent Tools)', () => {
  it('envia tools[0].type = "x_search" + allowed_x_handles', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: makeAgentResponse([]) }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource({ xHandle: 'sharkscope' }));

    const init: any = fetchSpy.mock.calls[0][1] ?? {};
    const body = JSON.parse(init.body ?? '{}');
    expect(body.tools?.[0]?.type).toBe('x_search');
    expect(body.tools?.[0]?.allowed_x_handles).toEqual(['sharkscope']);
  });

  it('envia tools[0].from_date = now-7d UTC e to_date = now UTC (yyyy-mm-dd)', async () => {
    const FIXED_NOW = new Date('2026-05-04T15:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: makeAgentResponse([]) }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource());

    const init: any = fetchSpy.mock.calls[0][1] ?? {};
    const body = JSON.parse(init.body ?? '{}');
    expect(body.tools?.[0]?.to_date).toBe('2026-05-04');
    expect(body.tools?.[0]?.from_date).toBe('2026-04-27');

    vi.useRealTimers();
  });

  it('envia endpoint /v1/responses (Agent Tools)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: makeAgentResponse([]) }),
    );

    const { fetchXSource } = await import(
      '../../../server/services/news/xSearchProvider'
    );
    await fetchXSource(makeXSource());

    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe('https://api.x.ai/v1/responses');
  });

  it('envia Authorization Bearer XAI_API_KEY', async () => {
    process.env.XAI_API_KEY = 'sk-xai-test-key-99999';
    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockResolvedValue(
      makeFetchResponse({ ok: true, body: makeAgentResponse([]) }),
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
