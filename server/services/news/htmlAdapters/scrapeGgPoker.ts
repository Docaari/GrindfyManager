/**
 * GGPoker HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/ggpoker.html`):
 *   .blog-list .blog-post
 *     h2 > a (title + href)
 *     .post-date (Month Day, Year)
 *     p.post-summary (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeGgPoker(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $(".blog-post").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("h2 a").first();
    const title = $anchor.text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const dateRaw = $el.find(".post-date").text().trim();
    const publishedAt = parseDateMulti(dateRaw);
    const summary = truncateSummary($el.find(".post-summary").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeGgPoker", items);
}
