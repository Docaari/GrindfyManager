/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-B2 (endpoint GET /api/news/feed).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-B2
 * ADR : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md §2.1
 *
 * Endpoint retorna { enabled, items: NewsItem[] (top 10), cachedAt, nextRefreshAt }.
 *
 * Status RED: handler `handleGetNewsFeed` NAO existe ainda em
 * server/routes/news.ts. Implementer vai adicionar.
 *
 * Lessons aplicadas:
 *   #3 shape REAL — mocks refletem retorno de storage.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mock storage methods consumidos pelo handler.
// =============================================================================

vi.mock('../../server/storage', () => ({
  storage: {
    listUserNewsPreferences: vi.fn(),
    getUserNewsPreferencesPayload: vi.fn(),
    listNewsItems: vi.fn(),
    listNewsSources: vi.fn(),
  },
}));

import { storage as storageBase } from '../../server/storage';
const storage = storageBase as any;

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-FEED-1' },
    query: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} as Record<string, string> };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  };
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
// Auth
// =============================================================================

describe('GET /api/news/feed — auth', () => {
  it('retorna 401 quando user ausente', async () => {
    const { handleGetNewsFeed } = await import('../../server/routes/news');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// NEWS_FEED_ENABLED flag
// =============================================================================

describe('GET /api/news/feed — NEWS_FEED_ENABLED', () => {
  it('flag desligada => enabled:false items:[]', async () => {
    const { handleGetNewsFeed } = await import('../../server/routes/news');
    process.env.NEWS_FEED_ENABLED = 'false';
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.items).toEqual([]);
  });

  it('flag ausente => enabled:false items:[]', async () => {
    const { handleGetNewsFeed } = await import('../../server/routes/news');
    delete process.env.NEWS_FEED_ENABLED;
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);
    expect(res.body.enabled).toBe(false);
    expect(res.body.items).toEqual([]);
  });
});

// =============================================================================
// Happy path
// =============================================================================

describe('GET /api/news/feed — happy path', () => {
  it('flag on + prefs habilitadas + items presentes => retorna top 10 ranqueados', async () => {
    process.env.NEWS_FEED_ENABLED = 'true';
    storage.getUserNewsPreferencesPayload.mockResolvedValue({
      preferences: [
        { category: 'tools', enabled: true, platformToggles: { 'hand2note': true } },
        { category: 'sites', enabled: true, platformToggles: { 'pokerstars': true } },
      ],
      detectedPlatforms: [],
      catalog: {},
    });
    storage.listUserNewsPreferences = vi.fn().mockResolvedValue([
      { category: 'tools', enabled: true, platformToggles: { 'hand2note': true } },
      { category: 'sites', enabled: true, platformToggles: { 'pokerstars': true } },
    ]);
    storage.listNewsItems.mockResolvedValue(
      Array.from({ length: 15 }).map((_, i) => ({
        id: `it-${i}`,
        source: i % 2 === 0 ? 'tools' : 'sites',
        platform: 'hand2note',
        title: `Item ${i}`,
        summary: 'summary',
        url: `https://x.com/${i}`,
        publishedAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        engagement: { likes: i, views: i * 10, comments: i },
      })),
    );

    const { handleGetNewsFeed } = await import('../../server/routes/news');
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(10);
    expect(res.body.cachedAt).toBeDefined();
    expect(res.body.nextRefreshAt).toBeDefined();
  });

  it('truncates a 10 mesmo com 50+ items elegiveis', async () => {
    process.env.NEWS_FEED_ENABLED = 'true';
    storage.getUserNewsPreferencesPayload.mockResolvedValue({
      preferences: [
        { category: 'tools', enabled: true, platformToggles: { 'hand2note': true } },
      ],
      detectedPlatforms: [],
      catalog: {},
    });
    storage.listUserNewsPreferences = vi.fn().mockResolvedValue([
      { category: 'tools', enabled: true, platformToggles: { 'hand2note': true } },
    ]);
    storage.listNewsItems.mockResolvedValue(
      Array.from({ length: 50 }).map((_, i) => ({
        id: `it-${i}`,
        source: 'tools',
        platform: 'hand2note',
        title: `Item ${i}`,
        summary: 'summary',
        url: `https://x.com/${i}`,
        publishedAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
        fetchedAt: new Date().toISOString(),
        engagement: { likes: i, views: i * 10 },
      })),
    );

    const { handleGetNewsFeed } = await import('../../server/routes/news');
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);

    expect(res.body.items.length).toBe(10);
  });

  it('usuario sem prefs habilitadas => enabled:false items:[]', async () => {
    process.env.NEWS_FEED_ENABLED = 'true';
    storage.getUserNewsPreferencesPayload.mockResolvedValue({
      preferences: [
        { category: 'tools', enabled: false, platformToggles: {} },
        { category: 'sites', enabled: false, platformToggles: {} },
      ],
      detectedPlatforms: [],
      catalog: {},
    });
    storage.listUserNewsPreferences = vi.fn().mockResolvedValue([
      { category: 'tools', enabled: false, platformToggles: {} },
      { category: 'sites', enabled: false, platformToggles: {} },
    ]);

    const { handleGetNewsFeed } = await import('../../server/routes/news');
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);

    expect(res.body.enabled).toBe(false);
    expect(res.body.items).toEqual([]);
  });
});

// =============================================================================
// Cache headers
// =============================================================================

describe('GET /api/news/feed — Cache-Control', () => {
  it('seta Cache-Control: private, max-age=60', async () => {
    process.env.NEWS_FEED_ENABLED = 'true';
    storage.getUserNewsPreferencesPayload.mockResolvedValue({
      preferences: [],
      detectedPlatforms: [],
      catalog: {},
    });
    storage.listUserNewsPreferences = vi.fn().mockResolvedValue([]);
    const { handleGetNewsFeed } = await import('../../server/routes/news');
    const req = makeReq();
    const res = makeRes();
    await (handleGetNewsFeed as any)(req, res);
    const header = res.headers['cache-control'];
    expect(header).toBeDefined();
    expect(String(header)).toMatch(/private/i);
    expect(String(header)).toMatch(/max-age=60/);
  });
});
