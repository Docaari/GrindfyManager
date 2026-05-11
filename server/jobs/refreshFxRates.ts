/**
 * Sprint FX-1 RF-04: cron refreshFxRates.
 *
 * Schedule: '0 0 17 * * *' UTC = 14:00 America/Sao_Paulo (sem DST).
 * Pipeline:
 *   1. Tenta BCB PTAX para BRL
 *      - Se falhar, frankfurter cobre BRL (cross-fallback)
 *   2. Tenta frankfurter para EUR
 *      - Sem cross-fallback (BCB nao serve EUR)
 *   3. upsertDailyRates(today, rows)
 *   4. invalidateLatestCache + fxResolver.invalidateCache global
 *
 * Idempotente via ON CONFLICT DO NOTHING. try/catch top-level garante
 * que falhas nao derrubam server.
 *
 * FX_CRON_DISABLED=true → skip register (CI / tests).
 */

import cron from "node-cron";
import { withAdvisoryLock } from "../lib/advisoryLock";
import { nanoid } from "nanoid";

import { fetchLatestBrl } from "../services/fx/adapters/bcbPtaxAdapter";
import { fetchLatest as frankfurterFetchLatest } from "../services/fx/adapters/frankfurterAdapter";
import {
  upsertDailyRates,
  invalidateLatestCache,
} from "../services/fx/fxRatesPersistence";
import { invalidateCache as invalidateResolverCache } from "../services/fxResolver";
import type { FxRow } from "../services/fx/adapters/types";

const CRON_EXPR = "0 0 17 * * *";

export interface FxRefreshResult {
  runId: string;
  status: "ok" | "partial" | "failed";
  inserted: number;
  skipped: number;
  currencies_fetched: string[];
  currencies_failed: string[];
  duration_ms: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pipeline cron exportado tambem para admin manual.
 */
export async function runFxRatesRefresh(): Promise<FxRefreshResult> {
  const runId = nanoid(10);
  const startedAt = Date.now();
  const today = todayIso();

  const fetched: string[] = [];
  const failed: string[] = [];
  const rows: FxRow[] = [];

  // 1. BRL via BCB PTAX (primary).
  let brlRow: FxRow | null = null;
  try {
    const adapterStart = Date.now();
    brlRow = await fetchLatestBrl();
    console.info(
      "[fx/adapter]",
      JSON.stringify({
        runId,
        name: "bcb_ptax",
        status: "ok",
        latency_ms: Date.now() - adapterStart,
      }),
    );
  } catch (err: any) {
    console.warn(
      "[fx/adapter]",
      JSON.stringify({
        runId,
        name: "bcb_ptax",
        status: "failed",
        error: err?.message ?? String(err),
        code: err?.code,
      }),
    );
    // Cross-fallback: frankfurter cobre BRL.
    try {
      const fallback = await frankfurterFetchLatest(["BRL"]);
      const fb = fallback.find((r) => r.currency === "BRL");
      if (fb) {
        brlRow = fb;
      }
    } catch (err2: any) {
      console.warn(
        "[fx/adapter]",
        JSON.stringify({
          runId,
          name: "frankfurter",
          target: "BRL_fallback",
          status: "failed",
          error: err2?.message ?? String(err2),
        }),
      );
    }
  }

  if (brlRow) {
    rows.push(brlRow);
    fetched.push("BRL");
  } else {
    failed.push("BRL");
  }

  // 2. EUR via frankfurter.
  try {
    const adapterStart = Date.now();
    const eurRows = await frankfurterFetchLatest(["EUR"]);
    const eur = eurRows.find((r) => r.currency === "EUR");
    if (eur) {
      rows.push(eur);
      fetched.push("EUR");
    } else {
      failed.push("EUR");
    }
    console.info(
      "[fx/adapter]",
      JSON.stringify({
        runId,
        name: "frankfurter",
        target: "EUR",
        status: "ok",
        latency_ms: Date.now() - adapterStart,
      }),
    );
  } catch (err: any) {
    console.warn(
      "[fx/adapter]",
      JSON.stringify({
        runId,
        name: "frankfurter",
        target: "EUR",
        status: "failed",
        error: err?.message ?? String(err),
      }),
    );
    failed.push("EUR");
  }

  // 3. Upsert.
  let inserted = 0;
  let skipped = 0;
  if (rows.length > 0) {
    try {
      const result = await upsertDailyRates(today, rows);
      inserted = result.inserted;
      skipped = result.skipped;
    } catch (err: any) {
      console.error(
        "[fx/persistence]",
        JSON.stringify({
          runId,
          op: "upsertDailyRates",
          status: "failed",
          error: err?.message ?? String(err),
        }),
      );
    }
  }

  // 4. Invalidate caches.
  try {
    invalidateLatestCache();
    invalidateResolverCache();
  } catch (err: any) {
    console.warn(
      "[fx/cron]",
      JSON.stringify({
        runId,
        op: "invalidateCache",
        error: err?.message ?? String(err),
      }),
    );
  }

  let status: FxRefreshResult["status"];
  if (failed.length === 0) status = "ok";
  else if (fetched.length === 0) status = "failed";
  else status = "partial";

  const result: FxRefreshResult = {
    runId,
    status,
    inserted,
    skipped,
    currencies_fetched: fetched,
    currencies_failed: failed,
    duration_ms: Date.now() - startedAt,
  };

  const logFn =
    status === "failed"
      ? console.error
      : status === "partial"
        ? console.warn
        : console.info;
  logFn(
    "[fx/cron]",
    JSON.stringify({
      runId,
      status,
      currencies_fetched: fetched.join(","),
      currencies_failed: failed.join(","),
      inserted,
      skipped,
      duration_ms: result.duration_ms,
    }),
  );

  return result;
}

function isDisabled(): boolean {
  const v = process.env.FX_CRON_DISABLED;
  return v === "true" || v === "1";
}

/**
 * Registra cron. No-op se FX_CRON_DISABLED=true (CI / tests).
 */
export function registerFxRatesCron(): void {
  if (isDisabled()) {
    console.info("[fx/cron] skipped — FX_CRON_DISABLED=true");
    return;
  }
  cron.schedule(
    CRON_EXPR,
    () => {
      // Wave D (ADR-144): advisory lock single-instance. BCB PTAX rate-limita;
      // N replicas chamando o mesmo tick explodiria 429.
      withAdvisoryLock("cron:fx-rates", runFxRatesRefresh).catch((err) => {
        console.error("[fx/cron] runFxRatesRefresh erro top-level", err);
      });
    },
    { timezone: "UTC" },
  );
  console.info("[fx/cron] registrado", { expr: CRON_EXPR, tz: "UTC" });
}
