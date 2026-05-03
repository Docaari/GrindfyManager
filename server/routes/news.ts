/**
 * RF-02, RF-03, RF-04 — /api/news + fetchNewsItems
 *
 * Sprint home-reform-1. Implementacao Onda 1 stub conforme spec §RF-02 + ADR-100.
 *
 * 3 pontos de extensao mapeados pelo ADR-100 §2.2:
 *   - fetchNewsItems(source, limit): provider real em Onda 3
 *   - getCacheKey(userId, source): cache 1-3h por source em Onda 3
 *   - sanitizeNewsItem(raw): Zod parse + URL allowlist em Onda 3
 */

import type { Express, Response } from 'express';
import type { NewsItem, NewsResponse } from '@shared/types/news';
import { requireAuth } from '../auth';

/**
 * Le a flag NEWS_FEED_ENABLED do env. Truthy somente "true" ou "1".
 * Outros valores sao defensivamente tratados como false.
 */
function isNewsFeedEnabled(): boolean {
  const v = process.env.NEWS_FEED_ENABLED;
  if (v === undefined || v === null) return false;
  return v === 'true' || v === '1';
}

/**
 * Handler do GET /api/news.
 *
 * Onda 1: stub. Auth obrigatorio. Retorna { enabled, items: [] }.
 * Aceita query params source/limit (validados, ignorados).
 * Onda 3: substitui fetchNewsItems por integracao real (xAI Grok).
 */
export async function handleGetNews(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const enabled = isNewsFeedEnabled();
    // Onda 1: provider real desligado; sempre items=[].
    const source = (req?.query?.source as string) || 'poker-software';
    const limitRaw = req?.query?.limit;
    const limit =
      typeof limitRaw === 'string' && /^\d+$/.test(limitRaw)
        ? parseInt(limitRaw, 10)
        : 5;

    let items: NewsItem[] = [];
    try {
      // Stub Onda 1: retorna [] mesmo se enabled=true.
      items = await fetchNewsItems(source as NewsItem['source'], limit);
    } catch (err) {
      console.error('[news/get] fetchNewsItems failed', err);
      items = [];
    }

    const body: NewsResponse = {
      enabled,
      items,
    };

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).json(body);
  } catch (err) {
    console.error('[news/get] failed', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

/**
 * Ponto de extensao 1 (ADR-100 §2.2). Onda 1: sempre [].
 * Onda 3: substitui por chamada xAI Grok ou outro provider real.
 */
export async function fetchNewsItems(
  _source: NewsItem['source'],
  _limit: number,
): Promise<NewsItem[]> {
  return [];
}

/**
 * Ponto de extensao 2 (ADR-100 §2.2). Onda 1: nao usa.
 */
export function getCacheKey(userId: string | null, source: string): string {
  return `news:${userId ?? 'anon'}:${source}`;
}

/**
 * Ponto de extensao 3 (ADR-100 §2.2). Onda 1: pass-through identidade.
 * Onda 3: substituira por Zod parse + allowlist de URL.
 */
export function sanitizeNewsItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as NewsItem;
}

export function registerNewsRoutes(app: Express): void {
  app.get('/api/news', requireAuth, handleGetNews);
}
