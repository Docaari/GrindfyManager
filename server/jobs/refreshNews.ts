/**
 * News refresh cron — Sprint News-3 RF-09 (refactor).
 *
 * Spec: Docs/specs/news-3-rss-x-refactor.md §RF-09
 * ADR : Docs/architecture/decisions/107-news-rss-x-search-refactor.md §6
 *
 * Mudancas vs Sprint News-1:
 *   - CRON_EXPR = '0 15 * * 1' (UTC) — equivalent a 12:00 SP sem DST.
 *   - Sem param `timezone: 'America/Sao_Paulo'`.
 *   - Substitui provider Grok-LLM legado por `runOrchestration`.
 *   - XAI_API_KEY ausente OR muito curta → SKIP cron INTEIRO + log error
 *     (decisao founder 2026-05-04: all-or-nothing pra simplificar).
 *
 * Idempotente via dedupe pipeline + content_hash UNIQUE.
 */

import cron from "node-cron";
import { runOrchestration } from "../services/news/orchestrator";
import { withAdvisoryLock } from "../lib/advisoryLock";

const CRON_EXPR = "0 15 * * 1"; // Segunda 15:00 UTC = 12:00 America/Sao_Paulo (UTC-3, sem DST).

function isFlagEnabled(): boolean {
  const v = process.env.NEWS_FEED_ENABLED;
  return v === "true" || v === "1";
}

function isApiKeyValid(): boolean {
  const key = process.env.XAI_API_KEY;
  return typeof key === "string" && key.length > 10;
}

/**
 * Executa refresh imediato (chamado pelo cron OU pelo handler admin manual).
 * RF-09 + RF-07: delega ao orchestrator. Retorna metricas pra observabilidade.
 */
export async function runNewsRefresh(): Promise<any> {
  if (!isFlagEnabled()) {
    console.info("[news/cron] skipped — NEWS_FEED_ENABLED off");
    return null;
  }
  if (!isApiKeyValid()) {
    console.error(
      "[news/cron] XAI_API_KEY missing or invalid — cron skipped",
    );
    return null;
  }
  return await runOrchestration();
}

/**
 * Registra o cron job. Idempotente — chamado uma vez no boot do server.
 */
export async function registerNewsRefreshCron(): Promise<void> {
  cron.schedule(CRON_EXPR, () => {
    // Wave D (ADR-144): advisory lock single-instance. Anthropic/xAI cost N×
    // sem guard; orquestracao tambem grava news_items que tem content_hash
    // unique — duplicacao soft-fail mas desperdiça.
    withAdvisoryLock("cron:news", runNewsRefresh).catch((err) => {
      console.error("[news/cron] runNewsRefresh erro top-level", err);
    });
  });
  console.info("[news/cron] registrado", { expr: CRON_EXPR, tz: "UTC" });
}
