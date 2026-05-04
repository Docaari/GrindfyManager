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

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeSuperPoker(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.news-card").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a.news-card__link").first();
    const href = $link.attr("href");
    const title = $link.find("h3.news-card__title").text().trim();
    const url = resolveUrl(href, baseUrl);
    const dateRaw = $el.find(".news-card__date").text().trim();
    const publishedAt = parseDateMulti(dateRaw);
    const summary = truncateSummary($el.find(".news-card__excerpt").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeSuperPoker", items);
}
