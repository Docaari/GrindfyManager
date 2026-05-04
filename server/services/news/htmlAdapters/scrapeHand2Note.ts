/**
 * Hand2Note HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/hand2note.html`):
 *   #blog-posts article
 *     h1 > a (title + href)
 *     .meta-date (DD Month YYYY EN)
 *     p.excerpt (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeHand2Note(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("#blog-posts article").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("h1 a").first();
    const title = $anchor.text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const dateRaw = $el.find(".meta-date").text().trim();
    const publishedAt = parseDateMulti(dateRaw);
    const summary = truncateSummary($el.find(".excerpt").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeHand2Note", items);
}
