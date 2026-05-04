/**
 * Jurojin HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/jurojin.html`):
 *   .blog article.blog-entry
 *     h2.blog-entry__title > a (title + href)
 *     .blog-entry__date (DD/MM/YYYY)
 *     .blog-entry__excerpt (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeJurojin(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.blog-entry").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("h2.blog-entry__title a").first();
    const title = $anchor.text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const dateRaw = $el.find(".blog-entry__date").text().trim();
    const publishedAt = parseDateMulti(dateRaw);
    const summary = truncateSummary($el.find(".blog-entry__excerpt").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeJurojin", items);
}
