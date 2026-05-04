/**
 * Dedupe Layers — Sprint News-3 RF-08.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-08
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §4
 * Diagrama: Docs/architecture/news-3-dedupe-flow.mermaid
 *
 * Pipeline 3-layer (ordem fixa):
 *   1. URL canonical (janela 30d) — drop se canonical match em news_items.
 *   2. Title fingerprint (janela 30d) — drop se fingerprint match.
 *   3. URL-in-tweet externo (janela 7d) — apenas para items X. Drop se
 *      ALGUMA URL externa no summary ja indexada como blog item.
 */

import { canonicalizeUrl } from "./urlCanonicalize";
import { titleFingerprint } from "./titleFingerprint";
import { extractTweetUrls } from "./extractTweetUrls";
import type { ScrapedNewsItem } from "./blogScraperProvider";

export interface DedupeDeps {
  existsByCanonical: (canonicalUrl: string, days: number) => Promise<boolean>;
  existsByFingerprint: (fingerprint: string, days: number) => Promise<boolean>;
}

export interface DedupeResult {
  survivors: ScrapedNewsItem[];
  skipped: { layer1: number; layer2: number; layer3: number };
}

const SELF_X_HOSTS = new Set(["x.com", "twitter.com", "www.x.com", "www.twitter.com"]);

function isXItem(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SELF_X_HOSTS.has(host);
  } catch {
    return false;
  }
}

export async function applyDedupe(
  items: ScrapedNewsItem[],
  deps: DedupeDeps,
): Promise<DedupeResult> {
  const survivors: ScrapedNewsItem[] = [];
  const skipped = { layer1: 0, layer2: 0, layer3: 0 };

  for (const item of items) {
    const canonical = canonicalizeUrl(item.url);

    // Layer 1: URL canonical (janela 30d).
    const layer1Hit = await deps.existsByCanonical(canonical, 30);
    if (layer1Hit) {
      console.info("[news/dedupe] drop", {
        layer: 1,
        sourceId: item.sourceId,
        url: item.url,
        reason: "canonical-match-30d",
      });
      skipped.layer1 += 1;
      continue;
    }

    // Layer 2: Title fingerprint (janela 30d).
    const fp = titleFingerprint(item.title);
    const layer2Hit = await deps.existsByFingerprint(fp, 30);
    if (layer2Hit) {
      console.info("[news/dedupe] drop", {
        layer: 2,
        sourceId: item.sourceId,
        url: item.url,
        reason: "fingerprint-match-30d",
      });
      skipped.layer2 += 1;
      continue;
    }

    // Layer 3: URL-in-tweet externo (janela 7d). Apenas items X.
    if (isXItem(item.url)) {
      const externalUrls = extractTweetUrls(item.summary);
      let layer3Hit = false;
      for (const ext of externalUrls) {
        const hit = await deps.existsByCanonical(ext, 7);
        if (hit) {
          layer3Hit = true;
          break;
        }
      }
      if (layer3Hit) {
        console.info("[news/dedupe] drop", {
          layer: 3,
          sourceId: item.sourceId,
          url: item.url,
          reason: "tweet-cites-indexed-blog-7d",
        });
        skipped.layer3 += 1;
        continue;
      }
    }

    survivors.push(item);
  }

  return { survivors, skipped };
}
