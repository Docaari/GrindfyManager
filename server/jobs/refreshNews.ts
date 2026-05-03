/**
 * News refresh cron — Sprint News-1 (ADR-106 §2.7).
 *
 * Cadencia UNICA: toda segunda-feira 12:00 BRT (America/Sao_Paulo).
 * Limite: top 5 items por source ativa por refresh.
 *
 * Skipa se NEWS_FEED_ENABLED !== 'true' OR XAI_API_KEY ausente.
 *
 * Idempotente via content_hash UNIQUE em news_items (insert .onConflictDoNothing).
 */

import cron from "node-cron";
import { fetchGrokNews } from "../services/grokNewsProvider";
import {
  hasAnyUserEnabledForSource,
  listNewsSources,
  upsertNewsItem,
} from "../storage";

const CRON_EXPR = "0 12 * * 1"; // Segunda 12:00
const CRON_TIMEZONE = "America/Sao_Paulo";
const ITEMS_PER_SOURCE = 5;

function isEnabled(): boolean {
  const v = process.env.NEWS_FEED_ENABLED;
  if (v !== "true" && v !== "1") return false;
  const key = process.env.XAI_API_KEY;
  if (typeof key !== "string" || key.length < 10) return false;
  return true;
}

/**
 * Executa refresh imediato (chamado pelo cron OU pelo handler admin manual).
 * Retorna { sources, inserted } pra observabilidade.
 */
export async function runNewsRefresh(): Promise<{ sources: number; inserted: number }> {
  if (!isEnabled()) {
    console.info("[news/cron] skipped — flag off ou XAI_API_KEY ausente");
    return { sources: 0, inserted: 0 };
  }
  const sources = await listNewsSources();
  let inserted = 0;
  let skipped = 0;
  for (const src of sources) {
    if (!src.enabled) continue;
    // Otimizacao tokens (founder feedback 2026-05-03): so pesquisa source
    // se >=1 user tem aquela plataforma ativada. Cron 1x/semana shared.
    const hasUser = await hasAnyUserEnabledForSource({
      id: src.id,
      category: src.category,
    });
    if (!hasUser) {
      skipped += 1;
      continue;
    }
    try {
      const items = await fetchGrokNews({
        category: src.category as any,
        platform: src.platform,
        promptTemplate: src.queryTemplate ?? "",
        liveSearchHandle: src.liveSearchHandle,
        limit: ITEMS_PER_SOURCE,
      });
      for (const it of items) {
        const ok = await upsertNewsItem({
          ...it,
          sourceId: src.id,
        });
        if (ok) inserted += 1;
      }
    } catch (err) {
      console.error("[news/cron] source falhou", src.id, err);
    }
  }
  console.info("[news/cron] refresh ok", {
    sources: sources.length,
    inserted,
    skipped,
  });
  return { sources: sources.length, inserted };
}

export async function registerNewsRefreshCron(): Promise<void> {
  cron.schedule(
    CRON_EXPR,
    () => {
      runNewsRefresh().catch((err) => {
        console.error("[news/cron] runNewsRefresh erro top-level", err);
      });
    },
    { timezone: CRON_TIMEZONE },
  );
  console.info("[news/cron] registrado", { expr: CRON_EXPR, tz: CRON_TIMEZONE });
}
