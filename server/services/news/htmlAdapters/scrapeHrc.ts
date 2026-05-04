/**
 * HRC (HoldemResources) HTML adapter — Sprint News-3.2 (selectors reais).
 *
 * Site Next.js sem RSS (/blog/feed retorna 404). Posts em URLs com pattern
 * `/blog/{YYYY}-{slug}/`. Year prefix no slug eh convencao do site —
 * usado como aproximacao da publishedAt (Jan 1 do ano).
 *
 * Limitacao: data so tem precisao de ano. Aceitavel — HRC publica raramente
 * (release notes), entao items distintos por ano nao colidem em fingerprint.
 */

import * as cheerio from "cheerio";
import { type AdapterItem, finalizeItems, truncateSummary, resolveUrl } from "./_shared";

const BLOG_SLUG_RE = /^\/blog\/(\d{4})-([a-z0-9-]+)\/?$/i;

export function scrapeHrc(html: string, baseUrl: string): AdapterItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: AdapterItem[] = [];

  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const m = BLOG_SLUG_RE.exec(href);
    if (!m) return;
    const url = resolveUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    const rawTitle = $a.text().replace(/\s+/g, " ").trim();
    if (!rawTitle || rawTitle.length < 5) return;
    if (rawTitle.length > 250) return;

    const year = parseInt(m[1], 10);
    if (year < 2015 || year > new Date().getUTCFullYear() + 1) return;
    const publishedAt = new Date(Date.UTC(year, 0, 1)).toISOString();

    seen.add(url);
    items.push({
      title: rawTitle,
      url,
      publishedAt,
      summary: truncateSummary(rawTitle),
    });
  });

  return finalizeItems("scrapeHrc", items);
}
