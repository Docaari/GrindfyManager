/**
 * Jurojin HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/jurojin.html`):
 *   .blog article.blog-entry
 *     h2.blog-entry__title > a (title + href)
 *     .blog-entry__date (DD/MM/YYYY)
 *     .blog-entry__excerpt (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeJurojin(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeJurojin",
    itemSelector: "article.blog-entry",
    titleAnchor: ($el) => $el.find("h2.blog-entry__title a"),
    dateSelector: ($el) => $el.find(".blog-entry__date"),
    dateMode: "text",
    summarySelector: ($el) => $el.find(".blog-entry__excerpt"),
  });
}
