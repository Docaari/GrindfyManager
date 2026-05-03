/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-3 — RF-B2 (server/services/newsRanking.ts).
 *
 * Spec: Docs/specs/home-reform-3.md §RF-B2
 * ADR : Docs/architecture/decisions/110-news-feed-ranking-and-zoning.md
 *
 * Funcao pura `rankNewsFeed(items, prefs?)` retorna top 10 items ordenados:
 *   score = engagement_norm * 0.6 + recency_norm * 0.4
 *   engagement_norm = log1p(views + likes*5 + comments*10) / log1p(maxBatch)
 *   recency_norm    = 1 - clamp((now - publishedAt) / 7d, 0, 1)
 *   tiebreak        = NEWS_CATEGORY_PRIORITY.indexOf(item.source) ASC
 *
 * Status RED: `server/services/newsRanking.ts` NAO existe ainda.
 *
 * Lessons aplicadas:
 *   #3  shape REAL — items espelham retorno de storage.listNewsItems
 *   #14 vi.hoisted nao necessario aqui (sem const spy top-level)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NewsItem, NewsSource } from '@shared/types/news';

function mkItem(overrides: Partial<NewsItem> & { id: string }): NewsItem {
  const base: NewsItem = {
    id: overrides.id,
    source: 'tools',
    platform: 'hand2note',
    title: `Item ${overrides.id}`,
    summary: 'Summary',
    url: `https://example.com/${overrides.id}`,
    publishedAt: '2026-05-03T10:00:00Z',
    fetchedAt: '2026-05-03T11:00:00Z',
    engagement: { likes: 0, views: 0, comments: 0 },
  };
  return { ...base, ...overrides };
}

const NOW = new Date('2026-05-03T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rankNewsFeed — RF-B2 ranking puro', () => {
  it('retorna no maximo 10 items mesmo com 100 elegiveis', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const items = Array.from({ length: 100 }).map((_, i) =>
      mkItem({ id: `it-${i}`, engagement: { likes: i, views: i * 10, comments: 0 } }),
    );
    const out = rankNewsFeed(items);
    expect(out.length).toBe(10);
  });

  it('items vazios retornam []', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    expect(rankNewsFeed([])).toEqual([]);
  });

  it('engagement zerado em todos => ranking puro por recencia desc', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const items: NewsItem[] = [
      mkItem({ id: 'old', publishedAt: new Date(NOW - 5 * 24 * 3600 * 1000).toISOString() }),
      mkItem({ id: 'new', publishedAt: new Date(NOW - 1 * 3600 * 1000).toISOString() }),
      mkItem({ id: 'mid', publishedAt: new Date(NOW - 2 * 24 * 3600 * 1000).toISOString() }),
    ];
    const out = rankNewsFeed(items);
    expect(out.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('todos publishedAt iguais => ranking puro por engagement desc', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const sameTime = new Date(NOW - 3600 * 1000).toISOString();
    const items: NewsItem[] = [
      mkItem({ id: 'low', publishedAt: sameTime, engagement: { likes: 1, views: 1, comments: 0 } }),
      mkItem({ id: 'high', publishedAt: sameTime, engagement: { likes: 100, views: 1000, comments: 50 } }),
      mkItem({ id: 'mid', publishedAt: sameTime, engagement: { likes: 10, views: 50, comments: 5 } }),
    ];
    const out = rankNewsFeed(items);
    expect(out.map((i) => i.id)).toEqual(['high', 'mid', 'low']);
  });

  it('item com publishedAt no futuro (clock skew) clamp recency=1', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const items: NewsItem[] = [
      mkItem({ id: 'future', publishedAt: new Date(NOW + 3600 * 1000).toISOString() }),
      mkItem({ id: 'old', publishedAt: new Date(NOW - 5 * 24 * 3600 * 1000).toISOString() }),
    ];
    const out = rankNewsFeed(items);
    // Future deve ficar antes pois recency=1 (clamp).
    expect(out[0].id).toBe('future');
  });

  it('item com publishedAt > 7d atras => recency=0', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const items: NewsItem[] = [
      // ancient: muito antigo, mas com engagement gigante
      mkItem({
        id: 'ancient-but-viral',
        publishedAt: new Date(NOW - 30 * 24 * 3600 * 1000).toISOString(),
        engagement: { likes: 10000, views: 100000, comments: 5000 },
      }),
      // recent: novo mas com engagement zero
      mkItem({
        id: 'fresh-no-engagement',
        publishedAt: new Date(NOW - 3600 * 1000).toISOString(),
        engagement: { likes: 0, views: 0, comments: 0 },
      }),
    ];
    const out = rankNewsFeed(items);
    // ancient-but-viral tem recency=0 mas engagement_norm=1 -> score=0.6
    // fresh-no-engagement tem recency~1 mas engagement_norm=0 -> score=~0.4
    expect(out[0].id).toBe('ancient-but-viral');
  });

  it('tiebreak por NEWS_CATEGORY_PRIORITY: tools > sites > studies > tournament-results > gossip', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const sameTime = new Date(NOW - 3600 * 1000).toISOString();
    // todos com mesmo engagement e mesma recencia -> mesmo score, tiebreak por categoria
    const sources: NewsSource[] = ['gossip', 'tournament-results', 'studies', 'sites', 'tools'];
    const items: NewsItem[] = sources.map((s) =>
      mkItem({
        id: `it-${s}`,
        source: s,
        publishedAt: sameTime,
        engagement: { likes: 5, views: 10, comments: 1 },
      }),
    );
    const out = rankNewsFeed(items);
    expect(out.map((i) => i.source)).toEqual([
      'tools',
      'sites',
      'studies',
      'tournament-results',
      'gossip',
    ]);
  });

  it('score = engagement_norm * 0.6 + recency_norm * 0.4 (formula explicita)', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    // 2 items: A com engagement maximo do batch + 0 recencia, B com 0 engagement + maxima recencia
    const items: NewsItem[] = [
      mkItem({
        id: 'A',
        publishedAt: new Date(NOW - 8 * 24 * 3600 * 1000).toISOString(), // recency=0
        engagement: { likes: 100, views: 1000, comments: 50 },
      }),
      mkItem({
        id: 'B',
        publishedAt: new Date(NOW).toISOString(), // recency=1
        engagement: { likes: 0, views: 0, comments: 0 },
      }),
    ];
    const out = rankNewsFeed(items);
    // A tem score = 1 * 0.6 + 0 * 0.4 = 0.6
    // B tem score = 0 * 0.6 + 1 * 0.4 = 0.4
    expect(out[0].id).toBe('A');
    expect(out[1].id).toBe('B');
  });

  it('maxBatch=0 (todos engagement zero) => engagement_norm=0 sem NaN', async () => {
    const { rankNewsFeed } = await import('../../server/services/newsRanking');
    const items: NewsItem[] = [
      mkItem({ id: 'x', publishedAt: new Date(NOW - 3600 * 1000).toISOString() }),
      mkItem({ id: 'y', publishedAt: new Date(NOW - 7200 * 1000).toISOString() }),
    ];
    const out = rankNewsFeed(items);
    expect(out.length).toBe(2);
    expect(out[0].id).toBe('x'); // mais recente
  });
});
