/**
 * Sprint FX-1 RF-03: fxRatesPersistence.
 *
 * Camada entre adapters e storage. Cache memoria 5min para getLatestSystemRates.
 * Storage helpers: storage.insertSystemFxRates, getSystemFxRatesLatest, etc.
 *
 * Convencao QW-1 (ADR-033): rate per USD. USD nunca eh inserido.
 */

import { storage } from "../../storage";
import type { FxRow } from "./adapters/types";
import type { FxSource } from "@shared/schema";

export interface SystemRate {
  currency: string;
  date: string;
  ratePerUsd: number;
  source: FxSource;
  fetchedAt: Date;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface LatestCacheEntry {
  rates: Record<string, SystemRate>;
  expiresAt: number;
}

let _latestCache: LatestCacheEntry | null = null;

function parseRate(raw: any): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  const n = Number(String(raw));
  return Number.isFinite(n) ? n : 0;
}

function rowToSystemRate(row: any): SystemRate {
  return {
    currency: String(row.currency),
    date: typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10),
    ratePerUsd: parseRate(row.ratePerUsd ?? row.rate_per_usd),
    source: (row.source as FxSource) ?? "manual",
    fetchedAt: row.fetchedAt instanceof Date ? row.fetchedAt : new Date(row.fetchedAt ?? Date.now()),
  };
}

function rowsToMap(rows: any[]): Record<string, SystemRate> {
  const out: Record<string, SystemRate> = {};
  for (const r of rows ?? []) {
    const sr = rowToSystemRate(r);
    out[sr.currency] = sr;
  }
  return out;
}

/**
 * Insere rows novas em system_fx_rates. ON CONFLICT DO NOTHING.
 * Filtra USD (nunca inserido — USD=1 implicito).
 */
export async function upsertDailyRates(
  date: string,
  rows: FxRow[],
): Promise<{ inserted: number; skipped: number }> {
  const filtered = (rows ?? []).filter((r) => r.currency !== "USD");
  if (filtered.length === 0) {
    return { inserted: 0, skipped: 0 };
  }
  const result = await (storage as any).insertSystemFxRates(filtered, date);
  return {
    inserted: result?.inserted ?? 0,
    skipped: result?.skipped ?? 0,
  };
}

/**
 * Retorna ultima rate por currency. Cache memoria 5min.
 */
export async function getLatestSystemRates(): Promise<
  Record<string, SystemRate>
> {
  if (_latestCache && _latestCache.expiresAt > Date.now()) {
    return _latestCache.rates;
  }
  const rows = await (storage as any).getSystemFxRatesLatest();
  const rates = rowsToMap(rows);
  _latestCache = {
    rates,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return rates;
}

/**
 * Rates de uma data especifica. Storage helper faz LATERAL fallback descending
 * (retorna ultimo working day anterior se data exata nao existe).
 * Vazio se nao houver row (caller faz fallback constants).
 */
export async function getRatesForDate(
  date: string,
): Promise<Record<string, SystemRate>> {
  const rows = await (storage as any).getSystemFxRatesForDate(date);
  return rowsToMap(rows);
}

/**
 * Historico paginado por currency. DESC.
 */
export async function getRateHistory(
  currency: string,
  days: number,
  offset: number = 0,
): Promise<SystemRate[]> {
  const rows = await (storage as any).getSystemFxRatesHistory(
    currency,
    days,
    offset,
  );
  return (rows ?? []).map(rowToSystemRate);
}

/**
 * Forca proxima call a re-fetchar. Chamado pelo cron pos-upsert.
 */
export function invalidateLatestCache(): void {
  _latestCache = null;
}

/**
 * Test helper. NAO USAR EM PROD.
 */
export function _resetCacheForTests(): void {
  _latestCache = null;
}

export const fxRatesPersistence = {
  upsertDailyRates,
  getLatestSystemRates,
  getRatesForDate,
  getRateHistory,
  invalidateLatestCache,
};
