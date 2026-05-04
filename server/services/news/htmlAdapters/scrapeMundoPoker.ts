/**
 * MundoPoker HTML adapter — Sprint News-3 RF-05.1.
 *
 * Selectors (fixture `tests/fixtures/news-html/mundopoker.html`):
 *   article.post
 *     h2.entry-title > a (title + href)
 *     time[datetime] (publishedAt)
 *     .entry-summary (summary)
 */

import * as cheerio from "cheerio";
import {
  AdapterItem,
  finalizeItems,
  parseDateMulti,
  resolveUrl,
  truncateSummary,
} from "./_shared";

export function scrapeMundoPoker(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const items: AdapterItem[] = [];

  $("article.post").each((_, el) => {
    const $el = $(el);
    const $titleAnchor = $el.find("h2.entry-title a").first();
    const title = $titleAnchor.text().trim();
    const href = $titleAnchor.attr("href");
    const url = resolveUrl(href, baseUrl);
    const datetimeRaw =
      $el.find("time").attr("datetime") ?? $el.find("time").text().trim();
    const publishedAt = parseDateMulti(datetimeRaw);
    const summary = truncateSummary($el.find(".entry-summary").text());

    if (!title || !url || !publishedAt) return;
    items.push({ title, url, publishedAt, summary });
  });

  return finalizeItems("scrapeMundoPoker", items);
}
