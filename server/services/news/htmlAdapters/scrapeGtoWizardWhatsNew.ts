/**
 * GTO Wizard What's New HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/gto-wizard-whatsnew.html`):
 *   .changelog article.changelog-entry
 *     h3 > a (title + href)
 *     time[datetime] (ISO YYYY-MM-DD)
 *     p (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeGtoWizardWhatsNew(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeGtoWizardWhatsNew",
    itemSelector: "article.changelog-entry",
    titleAnchor: ($el) => $el.find("h3 a"),
    dateSelector: ($el) => $el.find("time"),
    dateMode: "datetime-attr-or-text",
    summarySelector: ($el) => $el.find("p").first(),
  });
}
