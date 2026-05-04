/**
 * SuperPoker HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/superpoker.html`):
 *   .news-feed article.news-card
 *     a.news-card__link (href)
 *       h3.news-card__title (title)
 *     .news-card__date (DD/MM/YYYY)
 *     p.news-card__excerpt (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeSuperPoker(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeSuperPoker",
    itemSelector: "article.news-card",
    titleAnchor: ($el) => $el.find("a.news-card__link"),
    titleText: (_$el, $anchor) => $anchor.find("h3.news-card__title").text(),
    dateSelector: ($el) => $el.find(".news-card__date"),
    dateMode: "text",
    summarySelector: ($el) => $el.find(".news-card__excerpt"),
  });
}
