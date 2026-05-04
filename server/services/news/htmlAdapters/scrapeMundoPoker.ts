/**
 * MundoPoker HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/mundopoker.html`):
 *   article.post
 *     h2.entry-title > a (title + href)
 *     time[datetime] (publishedAt)
 *     .entry-summary (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeMundoPoker(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeMundoPoker",
    itemSelector: "article.post",
    titleAnchor: ($el) => $el.find("h2.entry-title a"),
    dateSelector: ($el) => $el.find("time"),
    dateMode: "datetime-attr-or-text",
    summarySelector: ($el) => $el.find(".entry-summary"),
  });
}
