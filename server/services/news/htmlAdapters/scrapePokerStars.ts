/**
 * PokerStars HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/pokerstars.html`):
 *   .news-list article.news-item
 *     h2.news-item__title > a (title + href)
 *     time.news-item__date[datetime] (ISO 8601 YYYY-MM-DD)
 *     .news-item__summary (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapePokerStars(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapePokerStars",
    itemSelector: "article.news-item",
    titleAnchor: ($el) => $el.find("h2.news-item__title a"),
    dateSelector: ($el) => $el.find("time.news-item__date"),
    dateMode: "datetime-attr-or-text",
    summarySelector: ($el) => $el.find(".news-item__summary"),
  });
}
