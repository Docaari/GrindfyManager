/**
 * X Search Provider — Sprint News-3.1 (migrado para Agent Tools API).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-06
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §2
 *
 * Wrapper xAI Agent Tools API — supersede Live Search (deprecated 410 em 2026-05).
 *
 * Endpoint:
 *   POST https://api.x.ai/v1/responses
 *   {
 *     model: 'grok-4-fast-non-reasoning',
 *     input: [{ role: 'user', content: '...prompt JSON-only...' }],
 *     tools: [{
 *       type: 'x_search',
 *       allowed_x_handles: [handle],
 *       from_date: 'YYYY-MM-DD',
 *       to_date: 'YYYY-MM-DD',
 *     }]
 *   }
 *
 * Estrategia anti-hallucination (defesa em profundidade):
 *   (1) Tool x_search executa busca real no X. URLs em `annotations[].url`
 *       sao a fonte de verdade (xAI nao pode inventar — IDs vem do search).
 *   (2) Modelo retorna JSON com tweet_url + title + summary + published_at.
 *   (3) Cross-validate: tweet ID do output_text DEVE estar tambem em
 *       annotations[]. Se nao bate, drop como halucinacao.
 *   (4) Regex: /^https:\/\/x\.com\/[^/]+\/status\/\d{15,20}$/
 *   (5) Trailing-zeros guard: tweet ID nao pode terminar em 0{10,}.
 *
 * Failure handling: log + retorna [] (NUNCA throw).
 */

import { truncateSummary } from "./htmlAdapters/_shared";
import type { NewsSourceLike, ScrapedNewsItem } from "./blogScraperProvider";

const XAI_ENDPOINT = "https://api.x.ai/v1/responses";
const TIMEOUT_MS = 60_000;
const MAX_SEARCH_RESULTS = 10;
const SEARCH_WINDOW_DAYS = 7;
const TWEET_URL_RE = /^https:\/\/x\.com\/[^/]+\/status\/(\d{15,20})$/;
const TWEET_ID_FROM_ANY_URL_RE = /\/status\/(\d{15,20})/;
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

function isValidIsoDate(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  return !Number.isNaN(new Date(s).getTime());
}

interface ParsedTweet {
  tweet_url: string;
  title: string;
  summary: string;
  published_at: string;
}

/**
 * Extrai tweet IDs reais do array `annotations[]` da resposta xAI.
 * Annotations usam path universal `https://x.com/i/status/{id}` ou
 * `https://x.com/{handle}/status/{id}` — ambos contem o ID, que eh
 * a fonte de verdade da busca.
 */
function extractCitationIds(json: unknown): Set<string> {
  const ids = new Set<string>();
  if (typeof json !== "object" || json === null) return ids;
  const root = json as { output?: unknown[]; citations?: unknown };

  // citations top-level (string[] ou object[])
  if (Array.isArray(root.citations)) {
    for (const c of root.citations) {
      const url = typeof c === "string" ? c : (c as { url?: string })?.url;
      if (typeof url !== "string") continue;
      const m = TWEET_ID_FROM_ANY_URL_RE.exec(url);
      if (m) ids.add(m[1]);
    }
  }

  // annotations dentro de output[].content[].annotations[]
  if (Array.isArray(root.output)) {
    for (const out of root.output) {
      if (typeof out !== "object" || out === null) continue;
      const content = (out as { content?: unknown[] }).content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (typeof c !== "object" || c === null) continue;
        const annotations = (c as { annotations?: unknown[] }).annotations;
        if (!Array.isArray(annotations)) continue;
        for (const a of annotations) {
          if (typeof a !== "object" || a === null) continue;
          const url = (a as { url?: string }).url;
          if (typeof url !== "string") continue;
          const m = TWEET_ID_FROM_ANY_URL_RE.exec(url);
          if (m) ids.add(m[1]);
        }
      }
    }
  }
  return ids;
}

/**
 * Extrai output_text consolidado do response.output[].content[].text
 * onde type === "output_text".
 */
function extractOutputText(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const root = json as { output?: unknown[] };
  if (!Array.isArray(root.output)) return "";
  let text = "";
  for (const out of root.output) {
    if (typeof out !== "object" || out === null) continue;
    const content = (out as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c !== "object" || c === null) continue;
      const t = c as { type?: string; text?: string };
      if (t.type === "output_text" && typeof t.text === "string") {
        text += t.text;
      }
    }
  }
  return text;
}

/**
 * Tenta parsear JSON array de tweets do output_text.
 * O modelo eh prompted a retornar JSON-only mas pode incluir prose.
 * Strategy: encontrar primeiro `[` e ultimo `]` e parsear.
 */
function parseTweetsFromText(text: string): ParsedTweet[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  const candidate = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ParsedTweet[] = [];
  for (const p of parsed) {
    if (typeof p !== "object" || p === null) continue;
    const obj = p as Record<string, unknown>;
    if (
      typeof obj.tweet_url === "string" &&
      typeof obj.title === "string" &&
      typeof obj.summary === "string" &&
      typeof obj.published_at === "string"
    ) {
      out.push({
        tweet_url: obj.tweet_url,
        title: obj.title,
        summary: obj.summary,
        published_at: obj.published_at,
      });
    }
  }
  return out;
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
  const fromDate = new Date(
    now.getTime() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const promptContent =
    `List up to ${MAX_SEARCH_RESULTS} most relevant recent posts from @${source.xHandle} ` +
    `about poker (MTT tournaments, news, promotions, software updates). ` +
    `Only include posts you actually found via x_search. ` +
    `Return ONLY a JSON array, no prose, no markdown fences:\n` +
    `[{"tweet_url":"https://x.com/${source.xHandle}/status/...","title":"...","summary":"...","published_at":"YYYY-MM-DD"}]\n` +
    `If no relevant posts found, return [].`;

  const body = {
    model: process.env.XAI_MODEL ?? "grok-4-fast-non-reasoning",
    input: [{ role: "user", content: promptContent }],
    tools: [
      {
        type: "x_search",
        allowed_x_handles: [source.xHandle],
        from_date: isoDateUtc(fromDate),
        to_date: isoDateUtc(now),
      },
    ],
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
    } as RequestInit);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[news/xsearch] ${source.id} HTTP ${res.status}`,
        errText.slice(0, 300),
      );
      return [];
    }
    const json: unknown = await res.json();
    const realIds = extractCitationIds(json);
    const text = extractOutputText(json);
    const tweets = parseTweetsFromText(text);

    const out: ScrapedNewsItem[] = [];
    for (const tw of tweets) {
      const url = tw.tweet_url.trim();
      const match = TWEET_URL_RE.exec(url);
      if (!match) {
        console.warn(`[news/xsearch] ${source.id} dropping malformed url`, url);
        continue;
      }
      const tweetId = match[1];
      if (TRAILING_ZEROS_RE.test(tweetId)) {
        console.warn(
          `[news/xsearch] ${source.id} suspicious tweet id (trailing zeros) dropped`,
          url,
        );
        continue;
      }
      // Cross-validate contra IDs reais retornados pelo x_search tool.
      // Se ID nao esta nas citations, modelo halucinou — drop.
      if (realIds.size > 0 && !realIds.has(tweetId)) {
        console.warn(
          `[news/xsearch] ${source.id} tweet id NOT in citations — drop`,
          url,
        );
        continue;
      }
      const title = tw.title.trim();
      const summary = truncateSummary(tw.summary ?? "");
      const publishedAt = tw.published_at;
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
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      console.error(`[news/xsearch] ${source.id} timeout apos ${TIMEOUT_MS}ms`);
    } else {
      console.error(`[news/xsearch] ${source.id} fetch erro`, e?.message ?? err);
    }
    return [];
  } finally {
    clearTimeout(t);
  }
}
