/**
 * News Orchestrator — Sprint News-3 RF-07 + RF-11.
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-07 + §RF-11
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §3
 *
 * Coordena providers (BlogScraper, XSearch) por source segundo scrape_strategy:
 *   rss / html / rss_or_html → BlogScraperProvider
 *   x_only                   → XSearchProvider
 *   rss_and_x / html_and_x   → ambos providers em paralelo, concat
 *
 * Aplica pipeline dedupe (3 layers) + insert idempotente.
 *
 * Concurrency: max 3 sources em paralelo (politeness + xAI rate limit).
 *
 * Logs estruturados:
 *   [news/source]  per-source JSON
 *   [news/metric]  per-run JSON
 *   [news/dedupe]  drop por layer (RF-08 ja loga)
 */

import { nanoid } from "nanoid";
import { storage } from "../../storage";
import { fetchBlogSource } from "./blogScraperProvider";
import { fetchXSource } from "./xSearchProvider";
import { applyDedupe } from "./dedupeLayers";
import { canonicalizeUrl } from "./urlCanonicalize";
import { titleFingerprint } from "./titleFingerprint";
import type { NewsSourceLike, ScrapedNewsItem } from "./blogScraperProvider";

const CONCURRENCY = 3;
const NEWS_TTL_DAYS = 30; // Layer 1/2 windows = 30 dias.

export interface OrchestrationResult {
  runId: string;
  sources: number;
  fetched: number;
  inserted: number;
  skipped: { layer1: number; layer2: number; layer3: number };
  errors: Array<{ sourceId: string; error: string }>;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

interface SourceOutcome {
  source: NewsSourceLike;
  fetched: number;
  inserted: number;
  errored: boolean;
}

/**
 * Despacha providers conforme strategy. Concat resultados se hibrido.
 */
async function fetchForSource(source: NewsSourceLike): Promise<ScrapedNewsItem[]> {
  const strategy = source.scrapeStrategy;
  if (strategy === "x_only") {
    return await fetchXSource(source);
  }
  if (strategy === "rss_and_x" || strategy === "html_and_x") {
    const [blog, x] = await Promise.all([
      fetchBlogSource(source),
      fetchXSource(source),
    ]);
    return [...blog, ...x];
  }
  // rss / html / rss_or_html
  return await fetchBlogSource(source);
}

/**
 * Itera sources em chunks de tamanho `concurrency`. Promise.allSettled garante
 * que UMA source com throw nao mata as outras.
 */
async function processInChunks(
  sources: NewsSourceLike[],
  runId: string,
  totalSkipped: { layer1: number; layer2: number; layer3: number },
  errors: Array<{ sourceId: string; error: string }>,
): Promise<SourceOutcome[]> {
  const outcomes: SourceOutcome[] = [];
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const chunk = sources.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((source) =>
        processOneSource(source, runId, totalSkipped, errors),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") outcomes.push(r.value);
    }
  }
  return outcomes;
}

async function processOneSource(
  source: NewsSourceLike,
  runId: string,
  totalSkipped: { layer1: number; layer2: number; layer3: number },
  errors: Array<{ sourceId: string; error: string }>,
): Promise<SourceOutcome> {
  let fetched = 0;
  let inserted = 0;
  let errored = false;
  const s = storage as any;

  try {
    const items = await fetchForSource(source);
    fetched = items.length;

    const dedupeResult = await applyDedupe(items, {
      existsByCanonical: async (url: string, days: number) =>
        await s.existsByCanonical(url, days),
      existsByFingerprint: async (fp: string, days: number) =>
        await s.existsByFingerprint(fp, days),
    });
    totalSkipped.layer1 += dedupeResult.skipped.layer1;
    totalSkipped.layer2 += dedupeResult.skipped.layer2;
    totalSkipped.layer3 += dedupeResult.skipped.layer3;

    for (const survivor of dedupeResult.survivors) {
      const canonical = canonicalizeUrl(survivor.url);
      const fp = titleFingerprint(survivor.title);
      const expiresAt = new Date(
        new Date(survivor.publishedAt).getTime() +
          NEWS_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      try {
        const ok = await s.insertNewsItem({
          ...survivor,
          urlCanonical: canonical,
          titleFingerprint: fp,
          expiresAt,
        });
        if (ok) inserted += 1;
      } catch (err) {
        // erro de insert por item nao quebra source — segue
        console.error(
          `[news/orchestrator] insert falhou ${survivor.sourceId}`,
          err,
        );
      }
    }
  } catch (err: any) {
    errored = true;
    errors.push({
      sourceId: source.id,
      error: err?.message ?? String(err),
    });
    console.error(`[news/orchestrator] source ${source.id} falhou`, err);
  }

  // RF-11: per-source structured log.
  console.info(
    `[news/source] ${JSON.stringify({
      runId,
      sourceId: source.id,
      strategy: source.scrapeStrategy,
      fetched,
      inserted,
      errored,
    })}`,
  );

  return { source, fetched, inserted, errored };
}

export async function runOrchestration(): Promise<OrchestrationResult> {
  const runId = nanoid(10);
  const startedAtTs = Date.now();
  const startedAt = new Date(startedAtTs).toISOString();

  const s = storage as any;
  let sourcesList: NewsSourceLike[] = [];
  try {
    const raw = (await s.listEnabledNewsSources?.()) ?? [];
    sourcesList = raw.filter((src: any) => src?.enabled !== false);
  } catch (err) {
    console.error(`[news/orchestrator] listEnabledNewsSources falhou`, err);
    sourcesList = [];
  }

  const totalSkipped = { layer1: 0, layer2: 0, layer3: 0 };
  const errors: Array<{ sourceId: string; error: string }> = [];

  const outcomes = await processInChunks(
    sourcesList,
    runId,
    totalSkipped,
    errors,
  );

  const fetched = outcomes.reduce((sum, o) => sum + o.fetched, 0);
  const inserted = outcomes.reduce((sum, o) => sum + o.inserted, 0);

  const completedAtTs = Date.now();
  const completedAt = new Date(completedAtTs).toISOString();
  const durationMs = completedAtTs - startedAtTs;

  const result: OrchestrationResult = {
    runId,
    sources: sourcesList.length,
    fetched,
    inserted,
    skipped: totalSkipped,
    errors,
    durationMs,
    startedAt,
    completedAt,
  };

  // RF-11: structured metric log.
  console.info(
    `[news/metric] ${JSON.stringify({
      runId,
      sources: sourcesList.length,
      fetched,
      inserted,
      skippedLayer1: totalSkipped.layer1,
      skippedLayer2: totalSkipped.layer2,
      skippedLayer3: totalSkipped.layer3,
      errors: errors.length,
      durationMs,
      startedAt,
      completedAt,
    })}`,
  );

  return result;
}

/** Alias para preservar assinatura compativel com handler admin existente. */
export const runNewsRefresh = runOrchestration;
