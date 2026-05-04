/**
 * X Search Provider — Sprint News-3 RF-06.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-06
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §2
 *
 * Wrapper xAI Live Search API. Retorna NewsItem[] de tweets reais via:
 *   POST https://api.x.ai/v1/chat/completions
 *   {
 *     model: 'grok-3-latest',
 *     search_parameters: {
 *       mode: 'on',
 *       sources: [{ type: 'x', x_handles: [...] }],
 *       from_date: now-7d,
 *       to_date: now,
 *       max_search_results: 10,
 *       return_citations: true
 *     }
 *   }
 *
 * Validacao rigorosa:
 *   - URL bate /^https:\/\/x\.com\/[^/]+\/status\/\d{15,20}$/
 *   - tweet ID NAO termina em 10+ zeros (anti-hallucination guard)
 *   - publishedAt eh ISO valido
 *
 * Failure handling: log + retorna [] (NUNCA throw).
 */

import type { NewsSourceLike, ScrapedNewsItem } from "./blogScraperProvider";

const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const TIMEOUT_MS = 60_000;
const TWEET_URL_RE = /^https:\/\/x\.com\/[^/]+\/status\/(\d{15,20})$/;
const TRAILING_ZEROS_RE = /0{10,}$/;

function isApiKeyConfigured(): boolean {
  const key = process.env.XAI_API_KEY;
  return typeof key === "string" && key.length > 10;
}

/** ISO yyyy-mm-dd UTC. */
function isoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function truncateSummary(s: string | null | undefined): string {
  if (!s) return "";
  const cleaned = s.trim().replace(/\s+/g, " ");
  return cleaned.length > 500 ? cleaned.slice(0, 500) : cleaned;
}

function isValidIsoDate(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export async function fetchXSource(
  source: NewsSourceLike,
): Promise<ScrapedNewsItem[]> {
  if (!isApiKeyConfigured()) {
    console.warn(
      `[news/xsearch] XAI_API_KEY ausente — skipping ${source.id}`,
    );
    return [];
  }
  if (!source.xHandle) {
    console.warn(`[news/xsearch] ${source.id} sem xHandle — skipping`);
    return [];
  }

  const now = new Date();
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const body = {
    model: process.env.XAI_MODEL ?? "grok-3-latest",
    messages: [
      {
        role: "user",
        content: `Resuma os ultimos posts de @${source.xHandle} relevantes para jogadores de poker MTT.`,
      },
    ],
    search_parameters: {
      mode: "on",
      return_citations: true,
      sources: [{ type: "x", x_handles: [source.xHandle] }],
      from_date: isoDateUtc(fromDate),
      to_date: isoDateUtc(now),
      max_search_results: 10,
    },
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(XAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    } as any);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[news/xsearch] ${source.id} HTTP ${res.status}`,
        errText.slice(0, 300),
      );
      return [];
    }
    const json: any = await res.json();
    const citations: any[] = Array.isArray(json?.citations) ? json.citations : [];

    const out: ScrapedNewsItem[] = [];
    for (const c of citations) {
      const url: string = (c?.url ?? "").trim();
      const match = TWEET_URL_RE.exec(url);
      if (!match) {
        console.warn(`[news/xsearch] dropping malformed url`, url);
        continue;
      }
      const tweetId = match[1];
      if (TRAILING_ZEROS_RE.test(tweetId)) {
        console.warn(
          `[news/xsearch] suspicious tweet id (trailing zeros) dropped`,
          url,
        );
        continue;
      }
      const title = (c?.title ?? "").trim();
      const summary = truncateSummary(c?.snippet ?? c?.summary ?? "");
      const publishedAt = c?.published_at ?? c?.publishedAt ?? "";
      if (!title) continue;
      if (!isValidIsoDate(publishedAt)) continue;
      out.push({
        title,
        url,
        summary,
        publishedAt,
        sourceId: source.id,
        category: source.category,
        platform: source.platform,
      });
    }
    return out;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.error(`[news/xsearch] ${source.id} timeout apos ${TIMEOUT_MS}ms`);
    } else {
      console.error(`[news/xsearch] ${source.id} fetch erro`, err?.message ?? err);
    }
    return [];
  } finally {
    clearTimeout(t);
  }
}
