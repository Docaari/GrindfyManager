/**
 * GTO Wizard What's New HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/gto-wizard-whatsnew.html`):
 *   .changelog article.changelog-entry
 *     h3 > a (title + href)
 *     time[datetime] (ISO YYYY-MM-DD)
 *     p (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeGtoWizardWhatsNew(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.changelog-entry").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("h3 a").first();
    const title = $anchor.text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const $time = $el.find("time").first();
    const datetimeRaw = $time.attr("datetime") ?? $time.text().trim();
    const publishedAt = parseDateMulti(datetimeRaw);
    const summary = truncateSummary($el.find("p").first().text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeGtoWizardWhatsNew", items);
}
