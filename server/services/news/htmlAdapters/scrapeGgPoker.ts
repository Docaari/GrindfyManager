/**
 * GGPoker HTML adapter — Sprint News-3.3 (selectors reais).
 *
 * Site multi-idioma sem RSS. Articles em anchors `/pt-br/blog/{slug}/`.
 * Titulo NAO esta em h-tag — texto direto inside anchor (apos image).
 *
 * Limitacao: homepage sem datas por article. publishedAt = now (data captura).
 */

import * as cheerio from "cheerio";
import { type AdapterItem, finalizeItems, truncateSummary, resolveUrl } from "./_shared";

const BLOG_URL_RE = /\/pt-br\/blog\/[a-z][a-z0-9-]+\/?$/i;

export function scrapeGgPoker(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: AdapterItem[] = [];
  const nowIso = new Date().toISOString();

  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    if (!BLOG_URL_RE.test(href)) return;
    const url = resolveUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    const rawTitle = $a.text().replace(/\s+/g, " ").trim();
    if (!rawTitle || rawTitle.length < 10 || rawTitle.length > 250) return;

    seen.add(url);
    items.push({
      title: rawTitle,
      url,
      publishedAt: nowIso,
      summary: truncateSummary(rawTitle),
    });
  });

  return finalizeItems("scrapeGgPoker", items);
}
