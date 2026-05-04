/**
 * Hand2Note HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/hand2note.html`):
 *   #blog-posts article
 *     h1 > a (title + href)
 *     .meta-date (DD Month YYYY EN)
 *     p.excerpt (summary)
 */

import { AdapterItem, runAdapter } from "./_shared";

export function scrapeHand2Note(html: string, baseUrl: string): AdapterItem[] {
  return runAdapter(html, baseUrl, {
    name: "scrapeHand2Note",
    itemSelector: "#blog-posts article",
    titleAnchor: ($el) => $el.find("h1 a"),
    dateSelector: ($el) => $el.find(".meta-date"),
    dateMode: "text",
    summarySelector: ($el) => $el.find(".excerpt"),
  });
}
