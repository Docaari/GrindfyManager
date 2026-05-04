/**
 * GGPoker HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/ggpoker.html`):
 *   .blog-list .blog-post
 *     h2 > a (title + href)
 *     .post-date (Month Day, Year)
 *     p.post-summary (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeGgPoker(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeGgPoker",
    itemSelector: ".blog-post",
    titleAnchor: ($el) => $el.find("h2 a"),
    dateSelector: ($el) => $el.find(".post-date"),
    dateMode: "text",
    summarySelector: ($el) => $el.find(".post-summary"),
  });
}
