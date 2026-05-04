/**
 * HRC (HoldemResources) HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/hrc.html`):
 *   main.blog-content .post-card
 *     a.post-card__link (href) > h2 (title)
 *     time[datetime] (ISO YYYY-MM-DD or "Month Day, Year")
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

export function scrapeHrc(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $(".post-card").each((_, el) => {
    const $el = $(el);
    const $anchor = $el.find("a.post-card__link").first();
    const title = $anchor.find("h2").text().trim();
    const href = $anchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const $time = $el.find("time").first();
    const datetimeRaw = $time.attr("datetime") ?? $time.text().trim();
    const publishedAt = parseDateMulti(datetimeRaw);
    const summary = truncateSummary($el.find("p").first().text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeHrc", items);
}
