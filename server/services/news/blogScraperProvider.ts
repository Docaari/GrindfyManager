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
import { safeFetch } from "../../lib/safeFetch";

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
  thumbnailUrl?: string | null;
}

const USER_AGENT = "GrindfyNewsBot/1.0 (+https://grindfy.com)";
const TIMEOUT_MS = 60_000;
const TOP_LIMIT = 10;

const RSS_FIRST_STRATEGIES = new Set(["rss", "rss_or_html", "rss_and_x"]);
const HTML_DIRECT_STRATEGIES = new Set(["html", "html_and_x"]);

type FetchResult = { ok: boolean; status: number; text: string };

async function fetchText(url: string): Promise<FetchResult> {
  try {
    // safeFetch enforces the SSRF allowlist + manual redirect re-validation.
    const res = await safeFetch(url, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: TIMEOUT_MS,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err: any) {
    // A blocked destination (or network error) is treated like an unreachable
    // source — the orchestrator already tolerates ok:false / empty results.
    console.error("news.blogScraper.fetch_blocked_or_failed", { url, err: err?.message ?? String(err) });
    return { ok: false, status: 0, text: "" };
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

  const parser = new RssParser({
    timeout: TIMEOUT_MS,
    customFields: {
      item: [
        ["media:content", "mediaContent", { keepArray: true }],
        ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
        ["content:encoded", "contentEncoded"],
      ],
    },
  });
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
    const thumbnailUrl = extractRssThumbnail(entry, link);
    items.push({
      title,
      url: link,
      summary,
      publishedAt: pubDate.toISOString(),
      sourceId: source.id,
      category: source.category,
      platform: source.platform,
      thumbnailUrl,
    });
    if (items.length >= TOP_LIMIT) break;
  }
  return items;
}

/**
 * Extrai thumbnail de RSS entry. Ordem prioridade:
 *   1. enclosure type=image/* (rss-parser nativo)
 *   2. media:content url (custom field)
 *   3. media:thumbnail url (custom field)
 *   4. itunes/image href (rare em poker mas defensivo)
 *   5. primeira <img src> em content:encoded
 *
 * Resolve URL relativa contra link do entry. Retorna null se nada extraivel.
 */
function extractRssThumbnail(entry: any, baseUrl: string): string | null {
  // Layer 1: enclosure
  const encUrl = entry?.enclosure?.url;
  const encType = entry?.enclosure?.type ?? "";
  if (typeof encUrl === "string" && encUrl.length > 0) {
    if (!encType || encType.startsWith("image/")) {
      const abs = resolveAbs(encUrl, baseUrl);
      if (abs) return abs;
    }
  }
  // Layer 2: media:content (array de {$: {url, medium, type}})
  const mc = entry?.mediaContent;
  if (Array.isArray(mc)) {
    for (const m of mc) {
      const attrs = m?.$ ?? m;
      const url = attrs?.url;
      const medium = attrs?.medium ?? "";
      const type = attrs?.type ?? "";
      if (typeof url === "string" && url.length > 0) {
        if (medium === "image" || type.startsWith("image/") || (!medium && !type)) {
          const abs = resolveAbs(url, baseUrl);
          if (abs) return abs;
        }
      }
    }
  }
  // Layer 3: media:thumbnail
  const mt = entry?.mediaThumbnail;
  if (Array.isArray(mt)) {
    for (const m of mt) {
      const url = m?.$?.url ?? m?.url;
      if (typeof url === "string" && url.length > 0) {
        const abs = resolveAbs(url, baseUrl);
        if (abs) return abs;
      }
    }
  }
  // Layer 4: itunes:image
  const itunesImg = entry?.itunes?.image;
  if (typeof itunesImg === "string" && itunesImg.length > 0) {
    const abs = resolveAbs(itunesImg, baseUrl);
    if (abs) return abs;
  }
  // Layer 5: scan content:encoded ou content
  const html = entry?.contentEncoded ?? entry?.content ?? "";
  if (typeof html === "string" && html.length > 0) {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m && m[1]) {
      const abs = resolveAbs(m[1], baseUrl);
      if (abs) return abs;
    }
  }
  return null;
}

function resolveAbs(href: string, baseUrl: string): string | null {
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return null;
  }
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

const ENRICH_IMAGE_RES = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  /"image"\s*:\s*"([^"]+)"/,
];

interface ArticleMeta {
  date: string | null;
  image: string | null;
}

/**
 * Sprint News-3.6: enrichment co-locado.
 *
 * Single HTTP request extrai date (RF anterior) + og:image em paralelo.
 * Image fica na ordem prioridade: og:image > twitter:image > rel=image_src
 * > schema.org "image". URL relativa resolvida contra articleUrl.
 */
async function fetchArticleMeta(articleUrl: string): Promise<ArticleMeta> {
  try {
    const res = await safeFetch(articleUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: ENRICH_TIMEOUT_MS,
    });
    if (!res.ok) return { date: null, image: null };
    const text = await res.text();
    let date: string | null = null;
    for (const re of ENRICH_DATE_RES) {
      const m = re.exec(text);
      if (m && m[1]) {
        const d = new Date(m[1]);
        if (isValidDate(d)) {
          date = d.toISOString();
          break;
        }
      }
    }
    let image: string | null = null;
    for (const re of ENRICH_IMAGE_RES) {
      const m = re.exec(text);
      if (m && m[1]) {
        try {
          image = new URL(m[1].trim(), articleUrl).toString();
          break;
        } catch {
          // ignora url invalida, segue
        }
      }
    }
    return { date, image };
  } catch {
    return { date: null, image: null };
  }
}

/**
 * Enriquece items HTML com date real (quando publishedAt eh "now sentinel")
 * + thumbnail og:image (sempre que ainda nao tiver). Reusa um unico HTTP
 * por article com concurrency limitada.
 */
async function enrichArticles(items: ScrapedNewsItem[]): Promise<ScrapedNewsItem[]> {
  const nowMs = Date.now();
  const needsDate = (it: ScrapedNewsItem) => {
    const d = new Date(it.publishedAt).getTime();
    return Math.abs(nowMs - d) < NOW_THRESHOLD_MS;
  };
  const needsImage = (it: ScrapedNewsItem) => !it.thumbnailUrl;
  const needs = items.filter((it) => needsDate(it) || needsImage(it));
  if (needs.length === 0) return items;

  const metas = new Map<string, ArticleMeta>();
  let i = 0;
  async function worker() {
    while (i < needs.length) {
      const idx = i++;
      const it = needs[idx];
      const meta = await fetchArticleMeta(it.url);
      metas.set(it.url, meta);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, needs.length) }, worker),
  );

  return items.map((it) => {
    const meta = metas.get(it.url);
    if (!meta) return it;
    const next: ScrapedNewsItem = { ...it };
    if (meta.date && needsDate(it)) next.publishedAt = meta.date;
    if (meta.image && !it.thumbnailUrl) next.thumbnailUrl = meta.image;
    return next;
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
    thumbnailUrl: (it as any).thumbnailUrl ?? null,
  }));
  return await enrichArticles(baseItems);
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
