/**
 * Extract Tweet URLs — Sprint News-3 RF-04 (Layer 3 dedupe support).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-04
 *
 * Extrai URLs externas de um summary de tweet. Filtra URLs do proprio X
 * (x.com, twitter.com, t.co) — interessam apenas links externos.
 *
 * Aplicar canonicalizeUrl em cada match. Set-dedupe interno.
 */

import { canonicalizeUrl } from "./urlCanonicalize";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const SELF_X_HOSTS = new Set(["x.com", "twitter.com", "t.co"]);

export function extractTweetUrls(summary: string): string[] {
  if (typeof summary !== "string" || summary.length === 0) return [];
  const matches = summary.match(URL_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    // Strip trailing punctuation that the regex may have captured.
    // Review LOW-1 fix: incluir `]!?` que tambem aparecem como trailing real.
    const trimmed = raw.replace(/[.,;)\]!?]+$/, "");
    let host = "";
    try {
      host = new URL(trimmed).hostname.toLowerCase();
      if (host.startsWith("www.")) host = host.slice(4);
    } catch {
      continue;
    }
    if (SELF_X_HOSTS.has(host)) continue;
    const canonical = canonicalizeUrl(trimmed);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
