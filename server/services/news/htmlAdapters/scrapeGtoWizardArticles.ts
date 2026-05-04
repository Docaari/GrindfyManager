/**
 * GTO Wizard Articles HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/gto-wizard-articles.html`):
 *   .articles-list article.article-card
 *     a (href) > h3 (title)
 *     time[datetime] (ISO YYYY-MM-DD)
 *     p (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeGtoWizardArticles(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeGtoWizardArticles",
    itemSelector: "article.article-card",
    titleAnchor: ($el) => $el.find("a"),
    titleText: (_$el, $anchor) => $anchor.find("h3").text(),
    dateSelector: ($el) => $el.find("time"),
    dateMode: "datetime-attr-or-text",
    summarySelector: ($el) => $el.find("p").first(),
  });
}
