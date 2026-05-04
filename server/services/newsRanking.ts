/**
 * News feed ranking — ADR-110 §2.1 + RF-B2.
 *
 * Funcao pura `rankNewsFeed(items)` retorna top 10 ordenados por:
 *   score          = engagement_norm * 0.6 + recency_norm * 0.4
 *   engagement_norm = log1p(views + likes*5 + comments*10) / log1p(maxBatch)
 *   recency_norm    = 1 - clamp((now - publishedAt) / 7d, 0, 1)
 *   tiebreak       = NEWS_CATEGORY_PRIORITY.indexOf(item.source) ASC
 *
 * Output truncado a 10 items.
 */

import type { NewsItem, NewsCategory } from '@shared/types/news';
import { NEWS_CATEGORY_PRIORITY } from '@shared/types/news';

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
// Sprint News-3.5 fix: cap subiu para 200 (todas plataformas/categorias visiveis
// nos chips filter). Antes 10 truncava demais; 50 ainda escondia pokerstars
// (recency menor que ggpoker hoje). 200 cobre o pool real (~95-150 items).
const MAX_FEED_ITEMS = 200;

function engagementRaw(item: NewsItem): number {
  const e = item.engagement ?? {};
  const likes = e.likes ?? 0;
  const views = e.views ?? 0;
  const comments = e.comments ?? 0;
  return views + likes * 5 + comments * 10;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function categoryRank(source: NewsCategory): number {
  const idx = NEWS_CATEGORY_PRIORITY.indexOf(source);
  // Categorias fora da prioridade (legacy market, reserved-future) ficam no fim.
  return idx === -1 ? NEWS_CATEGORY_PRIORITY.length : idx;
}

/**
 * Ranqueia + trunca para top 10.
 */
export function rankNewsFeed(items: NewsItem[]): NewsItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const now = Date.now();

  // 1. engagement raw por item + max do batch.
  const engagementValues = items.map(engagementRaw);
  const maxEngagement = engagementValues.reduce((a, b) => (b > a ? b : a), 0);
  const denom = Math.log1p(maxEngagement); // 0 quando todos zero.

  // 2. score por item.
  const scored = items.map((item, idx) => {
    const engagement = engagementValues[idx];
    const engagementNorm = denom > 0 ? Math.log1p(engagement) / denom : 0;

    const publishedMs = new Date(item.publishedAt).getTime();
    const ageMs = now - publishedMs;
    const recencyNorm = 1 - clamp(ageMs / SEVEN_DAYS_MS, 0, 1);

    const score = engagementNorm * 0.6 + recencyNorm * 0.4;

    return { item, score, categoryRank: categoryRank(item.source) };
  });

  // 3. ordenar por score desc; tiebreak por categoryRank asc.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.categoryRank - b.categoryRank;
  });

  return scored.slice(0, MAX_FEED_ITEMS).map((s) => s.item);
}

export const _internal = { engagementRaw, categoryRank, MAX_FEED_ITEMS };
