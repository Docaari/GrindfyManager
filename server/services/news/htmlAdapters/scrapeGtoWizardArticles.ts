/**
 * GTO Wizard Articles HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/gto-wizard-articles.html`):
 *   .articles-list article.article-card
 *     a (href) > h3 (title)
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

export function scrapeGtoWizardArticles(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.article-card").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("a").first();
    const href = $anchor.attr("href");
    const title = $anchor.find("h3").text().trim();
    const url = resolveUrl(href, baseUrl);
    const $time = $el.find("time").first();
    const datetimeRaw = $time.attr("datetime") ?? $time.text().trim();
    const publishedAt = parseDateMulti(datetimeRaw);
    const summary = truncateSummary($el.find("p").first().text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeGtoWizardArticles", items);
}
