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
import { categorizeItem } from "./categorizeItem";
import type { NewsSourceLike, ScrapedNewsItem } from "./blogScraperProvider";
// Review M1: invalida cache do /api/news/feed apos run para que admin trigger
// + cron run reflitam imediatamente no proximo /feed (evita janela 5min stale).
import { _clearFeedCache } from "../../routes/news";

const CONCURRENCY = 3;
const NEWS_TTL_DAYS = 30; // Layer 1/2 windows = 30 dias.
const TTL_MS = NEWS_TTL_DAYS * 24 * 60 * 60 * 1000;

// Helpers do news vivem como funcoes top-level ligadas a `storage` via
// (storage as any).X. Tipagem narrow para os 3 metodos consumidos aqui.
interface NewsStorageBindings {
  listEnabledNewsSources?: () => Promise<unknown[]>;
  insertNewsItem: (input: Record<string, unknown>) => Promise<boolean>;
  existsByCanonical: (url: string, days: number) => Promise<boolean>;
  existsByFingerprint: (fp: string, days: number) => Promise<boolean>;
}

const newsStorage = storage as unknown as NewsStorageBindings;

interface SkippedCounts {
  layer1: number;
  layer2: number;
  layer3: number;
}

interface OrchestrationError {
  sourceId: string;
  error: string;
}

export interface OrchestrationResult {
  runId: string;
  sources: number;
  fetched: number;
  inserted: number;
  skipped: SkippedCounts;
  errors: OrchestrationError[];
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
  totalSkipped: SkippedCounts,
  errors: OrchestrationError[],
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

async function insertSurvivor(
  survivor: ScrapedNewsItem,
): Promise<boolean> {
  const canonical = canonicalizeUrl(survivor.url);
  const fp = titleFingerprint(survivor.title);
  const expiresAt = new Date(
    new Date(survivor.publishedAt).getTime() + TTL_MS,
  ).toISOString();
  // Sprint News-3.5: re-categoriza items de sources gossip via heuristica
  // title-based (resultados vs fofocas reais). Founder requisitou separacao.
  const finalCategory = categorizeItem({
    title: survivor.title,
    summary: survivor.summary,
    sourceCategory: survivor.category,
  });
  try {
    return await newsStorage.insertNewsItem({
      ...survivor,
      category: finalCategory,
      urlCanonical: canonical,
      titleFingerprint: fp,
      expiresAt,
    });
  } catch (err) {
    // erro de insert por item nao quebra source — segue
    console.error(
      `[news/orchestrator] insert falhou ${survivor.sourceId}`,
      err,
    );
    return false;
  }
}

async function processOneSource(
  source: NewsSourceLike,
  runId: string,
  totalSkipped: SkippedCounts,
  errors: OrchestrationError[],
): Promise<SourceOutcome> {
  let fetched = 0;
  let inserted = 0;
  let errored = false;

  try {
    const items = await fetchForSource(source);
    fetched = items.length;

    const dedupeResult = await applyDedupe(items, {
      existsByCanonical: newsStorage.existsByCanonical,
      existsByFingerprint: newsStorage.existsByFingerprint,
    });
    totalSkipped.layer1 += dedupeResult.skipped.layer1;
    totalSkipped.layer2 += dedupeResult.skipped.layer2;
    totalSkipped.layer3 += dedupeResult.skipped.layer3;

    for (const survivor of dedupeResult.survivors) {
      const ok = await insertSurvivor(survivor);
      if (ok) inserted += 1;
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

  let sourcesList: NewsSourceLike[] = [];
  try {
    const raw = (await newsStorage.listEnabledNewsSources?.()) ?? [];
    sourcesList = (raw as NewsSourceLike[]).filter(
      (src) => (src as any)?.enabled !== false,
    );
  } catch (err) {
    console.error(`[news/orchestrator] listEnabledNewsSources falhou`, err);
    sourcesList = [];
  }

  const totalSkipped: SkippedCounts = { layer1: 0, layer2: 0, layer3: 0 };
  const errors: OrchestrationError[] = [];

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

  // Review M1 fix: invalida cache /api/news/feed se algo foi inserido,
  // para que proximo GET ja veja items novos sem aguardar TTL 5min.
  if (inserted > 0) {
    try {
      _clearFeedCache();
    } catch {
      // Defensive — cache module pode nao estar carregado em test env.
    }
  }

  return result;
}

/** Alias para preservar assinatura compativel com handler admin existente. */
export const runNewsRefresh = runOrchestration;
