/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-02, RF-04 (endpoint stub /api/news + flag NEWS_FEED_ENABLED).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-02, §RF-04
 * ADR  : Docs/architecture/decisions/100-news-feed-deferred-integration.md
 *
 * Onda 1: stub vazio. Onda 3 substitui implementacao xAI Grok (3 pontos
 * de extensao mapeados — fetchNewsItems / getCacheKey / sanitizeNewsItem).
 *
 * Status RED: handler NAO existe (`server/routes/news.ts` sera criado pelo
 * implementer com handleGetNews exportado).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  handleGetNews,
  fetchNewsItems,
} from '../../../server/routes/news';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-NEWS-1' },
    query: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} as Record<string, string> };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; return res; };
  res.set = res.setHeader;
  return res;
}

const ORIGINAL_FLAG = process.env.NEWS_FEED_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.NEWS_FEED_ENABLED;
  else process.env.NEWS_FEED_ENABLED = ORIGINAL_FLAG;
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEWS_FEED_ENABLED;
});

// =============================================================================
// Auth — RF-02
// =============================================================================

describe('GET /api/news — auth', () => {
  it('rejeita sem userPlatformId', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// Flag NEWS_FEED_ENABLED — RF-04
// =============================================================================

describe('GET /api/news — flag NEWS_FEED_ENABLED', () => {
  it('flag ausente => enabled=false, items=[]', async () => {
    delete process.env.NEWS_FEED_ENABLED;
    const req = makeReq();
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it('flag NEWS_FEED_ENABLED=false => enabled=false, items=[]', async () => {
    process.env.NEWS_FEED_ENABLED = 'false';
    const req = makeReq();
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.body.enabled).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it('flag NEWS_FEED_ENABLED=true => enabled=true, items=[] (Onda 1 stub)', async () => {
    process.env.NEWS_FEED_ENABLED = 'true';
    const req = makeReq();
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.body.enabled).toBe(true);
    expect(res.body.items).toEqual([]); // Onda 1 sem provider real
  });

  it('flag truthy somente "true" ou "1" — outros valores => false (defensivo)', async () => {
    process.env.NEWS_FEED_ENABLED = 'yes';
    const req = makeReq();
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.body.enabled).toBe(false);

    process.env.NEWS_FEED_ENABLED = '1';
    const req2 = makeReq();
    const res2 = makeRes();
    await handleGetNews(req2, res2);
    expect(res2.body.enabled).toBe(true);
  });
});

// =============================================================================
// Query params — RF-02
// =============================================================================

describe('GET /api/news — query params (validados, ignorados em Onda 1)', () => {
  it('aceita ?source=poker-software sem erro', async () => {
    const req = makeReq({ query: { source: 'poker-software' } });
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('aceita ?limit=5 sem erro', async () => {
    const req = makeReq({ query: { limit: '5' } });
    const res = makeRes();
    await handleGetNews(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// fetchNewsItems — Ponto de extensao 1 (ADR-100 §2.2)
// =============================================================================

describe('fetchNewsItems — Onda 1 stub', () => {
  it('retorna [] independente de source/limit (Onda 1)', async () => {
    const items = await fetchNewsItems('poker-software', 5);
    expect(items).toEqual([]);
  });

  it('aceita source poker-software e limit numerico', async () => {
    await expect(fetchNewsItems('poker-software', 10)).resolves.toEqual([]);
  });
});

// =============================================================================
// Cache headers — §10.2
// =============================================================================

describe('GET /api/news — Cache-Control headers', () => {
  it('seta Cache-Control: private, max-age=300 (5min)', async () => {
    const req = makeReq();
    const res = makeRes();
    await handleGetNews(req, res);
    const header = res.headers['cache-control'];
    expect(header).toBeDefined();
    expect(String(header)).toMatch(/private/i);
    expect(String(header)).toMatch(/max-age=300/);
  });
});
