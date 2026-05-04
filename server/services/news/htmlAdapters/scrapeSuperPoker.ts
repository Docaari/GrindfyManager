/**
 * SuperPoker HTML adapter — Sprint News-3.2 (selectors reais).
 *
 * SuperPoker homepage WordPress sem RSS expostos. Layout custom com
 * varias classes (.bc-latest-post-loop-item, .home-module-text). Articles
 * tem URL pattern `https://superpoker.com.br/noticias/{slug}` e titulo
 * embutido em <a> dentro de <p class="home-module-text">.
 *
 * Limitacao: HOMEPAGE nao expoe data por article (sem <time>, sem JSON-LD).
 * Strategy: usar `now` como publishedAt (data de captura). Layer 2 dedupe
 * (title fingerprint) impede duplicates ao longo dos runs semanais.
 */

import * as cheerio from "cheerio";
import { type AdapterItem, finalizeItems, truncateSummary, resolveUrl } from "./_shared";

const NEWS_URL_RE = /\/noticias\/[a-z0-9-]+\/?$/i;

export function scrapeSuperPoker(html: string, baseUrl: string): AdapterItem[] {
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

    // Title: prefer text content of anchor; skip if anchor is image-only.
    const rawTitle = $a.text().replace(/\s+/g, " ").trim();
    if (!rawTitle || rawTitle.length < 10) return;
    if (rawTitle.length > 250) return; // sanity cap

    seen.add(url);
    items.push({
      title: rawTitle,
      url,
      publishedAt: nowIso,
      summary: truncateSummary(rawTitle),
    });
  });

  return finalizeItems("scrapeSuperPoker", items);
}
