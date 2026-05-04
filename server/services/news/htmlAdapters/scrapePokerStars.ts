/**
 * PokerStars HTML adapter — Sprint News-3.3 (selectors reais).
 *
 * News page custom (sem RSS). Articles em anchors com pattern
 * `/pt-BR/poker/learn/news/{slug}/`. Titulo dentro de <h2>/<h3>/<h4>
 * inside anchor.
 *
 * Limitacao: homepage sem datas. publishedAt = now (data captura).
 */

import * as cheerio from "cheerio";
import { type AdapterItem, finalizeItems, truncateSummary, resolveUrl } from "./_shared";

const NEWS_URL_RE = /\/pt-BR\/poker\/learn\/news\/[^/]+\/?$/i;

export function scrapePokerStars(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: AdapterItem[] = [];
  const nowIso = new Date().toISOString();

  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    if (!NEWS_URL_RE.test(href)) return;
    const url = resolveUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    // Title prefer h2/h3/h4 inside anchor; fallback to anchor text.
    const $heading = $a.find("h2, h3, h4").first();
    const titleText = $heading.length ? $heading.text() : $a.text();
    const rawTitle = titleText.replace(/\s+/g, " ").trim();
    if (!rawTitle || rawTitle.length < 15 || rawTitle.length > 250) return;

    seen.add(url);
    items.push({
      title: rawTitle,
      url,
      publishedAt: nowIso,
      summary: truncateSummary(rawTitle),
    });
  });

  return finalizeItems("scrapePokerStars", items);
}
