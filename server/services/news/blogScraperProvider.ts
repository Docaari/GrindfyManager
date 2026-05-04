/**
 * Blog Scraper Provider — Sprint News-3 RF-05.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-05
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §1
 *
 * Provider que faz fetch de uma source de blog e retorna NewsItem[]:
 *   - RSS first (rss / rss_or_html / rss_and_x)
 *   - HTML fallback se strategy === 'rss_or_html' AND RSS retornou 0 items
 *   - HTML direto (html / html_and_x)
 *
 * NUNCA throw — uma source down nao para o batch. Erro → [] + log error.
 */

import RssParser from "rss-parser";
import { getHtmlAdapter } from "./htmlAdapters/registry";

export interface NewsSourceLike {
  id: string;
  category: string;
  platform: string;
  rssUrl: string | null;
  homepageUrl: string | null;
  scrapeStrategy: string;
  xHandle: string | null;
}

export interface ScrapedNewsItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  category: string;
  platform: string;
  sourceId: string;
}

const USER_AGENT = "GrindfyNewsBot/1.0 (+https://grindfy.com)";
const TIMEOUT_MS = 60_000;
const TOP_LIMIT = 10;

type FetchResult = { ok: boolean; status: number; text: string };

async function fetchText(url: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    } as any);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

function truncateSummary(s: string | null | undefined): string {
  if (!s) return "";
  const cleaned = s.trim().replace(/\s+/g, " ");
  return cleaned.length > 500 ? cleaned.slice(0, 500) : cleaned;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

async function fetchViaRss(
  source: NewsSourceLike,
): Promise<ScrapedNewsItem[]> {
  if (!source.rssUrl) return [];
  let res: FetchResult;
  try {
    res = await fetchText(source.rssUrl);
  } catch (err) {
    console.error(`[news/scraper] ${source.id} RSS fetch failed`, err);
    return [];
  }
  if (!res.ok) {
    console.error(
      `[news/scraper] ${source.id} RSS HTTP ${res.status}`,
      res.text.slice(0, 200),
    );
    return [];
  }

  const parser = new RssParser({ timeout: TIMEOUT_MS });
  let feed: any;
  try {
    feed = await parser.parseString(res.text);
  } catch (err) {
    console.error(`[news/scraper] ${source.id} RSS parse failed`, err);
    return [];
  }

  const items: ScrapedNewsItem[] = [];
  for (const entry of feed.items ?? []) {
    const link = (entry.link ?? "").trim();
    const title = (entry.title ?? "").trim();
    if (!link || !title) continue;
    const pubDateRaw = entry.pubDate ?? entry.isoDate ?? "";
    if (!pubDateRaw) continue;
    const pubDate = new Date(pubDateRaw);
    if (!isValidDate(pubDate)) continue;
    const summary = truncateSummary(entry.contentSnippet ?? entry.content ?? "");
    items.push({
      title,
      url: link,
      summary,
      publishedAt: pubDate.toISOString(),
      sourceId: source.id,
      category: source.category,
      platform: source.platform,
    });
    if (items.length >= TOP_LIMIT) break;
  }
  return items;
}

async function fetchViaHtml(
  source: NewsSourceLike,
): Promise<ScrapedNewsItem[]> {
  const adapter = getHtmlAdapter(source.id);
  if (!adapter) {
    console.warn(
      `[news/scraper] ${source.id} HTML adapter not registered, skipping`,
    );
    return [];
  }
  const url = source.homepageUrl ?? source.rssUrl;
  if (!url) {
    console.warn(`[news/scraper] ${source.id} HTML has no homepage_url`);
    return [];
  }
  let res: FetchResult;
  try {
    res = await fetchText(url);
  } catch (err) {
    console.error(`[news/scraper] ${source.id} HTML fetch failed`, err);
    return [];
  }
  if (!res.ok) {
    console.error(
      `[news/scraper] ${source.id} HTML HTTP ${res.status}`,
      res.text.slice(0, 200),
    );
    return [];
  }
  let raw;
  try {
    raw = adapter(res.text, url);
  } catch (err) {
    console.error(`[news/scraper] ${source.id} HTML adapter threw`, err);
    return [];
  }
  return raw.slice(0, TOP_LIMIT).map((it) => ({
    title: it.title,
    url: it.url,
    summary: it.summary,
    publishedAt: it.publishedAt,
    sourceId: source.id,
    category: source.category,
    platform: source.platform,
  }));
}

export async function fetchBlogSource(
  source: NewsSourceLike,
): Promise<ScrapedNewsItem[]> {
  // x_only nao eh com este provider — Orchestrator dispatches differently.
  if (source.scrapeStrategy === "x_only") return [];

  try {
    const wantsRssFirst = ["rss", "rss_or_html", "rss_and_x"].includes(
      source.scrapeStrategy,
    );
    const wantsHtml = ["html", "html_and_x"].includes(source.scrapeStrategy);

    if (wantsRssFirst) {
      const rssItems = await fetchViaRss(source);
      if (rssItems.length > 0) return rssItems.slice(0, TOP_LIMIT);
      // Fallback HTML so quando strategy === 'rss_or_html'.
      if (source.scrapeStrategy === "rss_or_html") {
        return (await fetchViaHtml(source)).slice(0, TOP_LIMIT);
      }
      return [];
    }

    if (wantsHtml) {
      return (await fetchViaHtml(source)).slice(0, TOP_LIMIT);
    }

    return [];
  } catch (err) {
    // Defesa final — qualquer erro nao previsto retorna [] sem propagar.
    console.error(`[news/scraper] ${source.id} unexpected error`, err);
    return [];
  }
}
