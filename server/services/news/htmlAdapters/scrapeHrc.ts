/**
 * HRC (HoldemResources) HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/hrc.html`):
 *   main.blog-content .post-card
 *     a.post-card__link (href) > h2 (title)
 *     time[datetime] (ISO YYYY-MM-DD or "Month Day, Year")
 *     p (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeHrc(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeHrc",
    itemSelector: ".post-card",
    titleAnchor: ($el) => $el.find("a.post-card__link"),
    titleText: (_$el, $anchor) => $anchor.find("h2").text(),
    dateSelector: ($el) => $el.find("time"),
    dateMode: "datetime-attr-or-text",
    summarySelector: ($el) => $el.find("p").first(),
  });
}
