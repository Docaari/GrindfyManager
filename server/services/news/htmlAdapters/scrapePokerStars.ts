/**
 * PokerStars HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/pokerstars.html`):
 *   .news-list article.news-item
 *     h2.news-item__title > a (title + href)
 *     time.news-item__date[datetime] (ISO 8601 YYYY-MM-DD)
 *     .news-item__summary (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapePokerStars(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.news-item").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("h2.news-item__title a").first();
    const title = $anchor.text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const $time = $el.find("time.news-item__date").first();
    const datetimeRaw = $time.attr("datetime") ?? $time.text().trim();
    const publishedAt = parseDateMulti(datetimeRaw);
    const summary = truncateSummary($el.find(".news-item__summary").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapePokerStars", items);
}
