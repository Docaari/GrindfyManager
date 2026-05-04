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
import { truncateSummary } from "./htmlAdapters/_shared";
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

const RSS_FIRST_STRATEGIES = new Set(["rss", "rss_or_html", "rss_and_x"]);
const HTML_DIRECT_STRATEGIES = new Set(["html", "html_and_x"]);

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

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
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

/**
 * Sprint News-3.4: per-article date enrichment.
 *
 * Adapters HTML setam publishedAt = now() quando homepage nao expoe data.
 * Para items "fresh now", fetch da pagina do article + extract date real
 * via JSON-LD `datePublished` ou meta `article:published_time`.
 *
 * Timeout curto (8s) — failures retornam null + mantem now() como fallback.
 * Concurrency limitada para evitar burst contra o site.
 */
const ENRICH_TIMEOUT_MS = 8000;
const ENRICH_CONCURRENCY = 5;
const NOW_THRESHOLD_MS = 60_000; // items com publishedAt < 60s ago = "now sentinel"

const ENRICH_DATE_RES = [
  /"datePublished"\s*:\s*"([^"]+)"/,
  /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
  /<time[^>]+datetime=["']([^"']+)["']/,
];

async function fetchArticleDate(articleUrl: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ENRICH_TIMEOUT_MS);
  try {
    const res = await fetch(articleUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
    } as any);
    if (!res.ok) return null;
    const text = await res.text();
    for (const re of ENRICH_DATE_RES) {
      const m = re.exec(text);
      if (m && m[1]) {
        const d = new Date(m[1]);
        if (isValidDate(d)) return d.toISOString();
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function enrichDates(items: ScrapedNewsItem[]): Promise<ScrapedNewsItem[]> {
  const nowMs = Date.now();
  const needs = items.filter((it) => {
    const d = new Date(it.publishedAt).getTime();
    return Math.abs(nowMs - d) < NOW_THRESHOLD_MS;
  });
  if (needs.length === 0) return items;

  const enriched = new Map<string, string>();
  let i = 0;
  async function worker() {
    while (i < needs.length) {
      const idx = i++;
      const it = needs[idx];
      const real = await fetchArticleDate(it.url);
      if (real) enriched.set(it.url, real);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, needs.length) }, worker),
  );

  return items.map((it) => {
    const real = enriched.get(it.url);
    return real ? { ...it, publishedAt: real } : it;
  });
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
  const baseItems: ScrapedNewsItem[] = raw.slice(0, TOP_LIMIT).map((it) => ({
    title: it.title,
    url: it.url,
    summary: it.summary,
    publishedAt: it.publishedAt,
    sourceId: source.id,
    category: source.category,
    platform: source.platform,
  }));
  return await enrichDates(baseItems);
}

export async function fetchBlogSource(
  source: NewsSourceLike,
): Promise<ScrapedNewsItem[]> {
  // x_only nao eh com este provider — Orchestrator dispatches differently.
  if (source.scrapeStrategy === "x_only") return [];

  try {
    if (RSS_FIRST_STRATEGIES.has(source.scrapeStrategy)) {
      const rssItems = await fetchViaRss(source);
      if (rssItems.length > 0) return rssItems.slice(0, TOP_LIMIT);
      // Fallback HTML so quando strategy === 'rss_or_html'.
      if (source.scrapeStrategy === "rss_or_html") {
        return (await fetchViaHtml(source)).slice(0, TOP_LIMIT);
      }
      return [];
    }

    if (HTML_DIRECT_STRATEGIES.has(source.scrapeStrategy)) {
      return (await fetchViaHtml(source)).slice(0, TOP_LIMIT);
    }

    return [];
  } catch (err) {
    // Defesa final — qualquer erro nao previsto retorna [] sem propagar.
    console.error(`[news/scraper] ${source.id} unexpected error`, err);
    return [];
  }
}
