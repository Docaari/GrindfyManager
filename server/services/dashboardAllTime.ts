/**
 * dashboardAllTime — Sprint home-reform-5 item 7.
 *
 * Spec: Docs/specs/home-reform-5.md Item 7 (Dashboard - All Time + KPIs estendidos).
 *
 * Orchestrators:
 *   - getDashboardAllTimeSummary: 6 KPIs (tournaments, profit, invested, roi,
 *     itm, finalTables, wins) all-time. Fonte: tournaments WHERE
 *     grind_session_id IS NULL (CLAUDE.md §6.1) — uploads/manual/sharkscope.
 *   - getHomeEvolutionAllTime: serie mensal continua para grafico evolucao
 *     all-time. Pega rows nativas mensais do storage, aplica FX por site -> USD
 *     por mes, gera serie continua (preenche meses sem volume) entre primeiro
 *     mes com dados e mes corrente UTC.
 *
 * Lessons aplicadas:
 *   #6 normalizar para USD via fxResolver antes de comparar/somar
 *   #9 log antes de fallback (nao engolir erro silencioso)
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export interface DashboardAllTimeSummary {
  tournaments: number;
  profit: number;
  invested: number;
  roi: number | null;
  itm: number;
  finalTables: number;
  wins: number;
}

const EMPTY_SUMMARY: DashboardAllTimeSummary = {
  tournaments: 0,
  profit: 0,
  invested: 0,
  roi: null,
  itm: 0,
  finalTables: 0,
  wins: 0,
};

export async function getDashboardAllTimeSummary(
  userId: string,
): Promise<DashboardAllTimeSummary> {
  const storageAny = storage as any;
  let rows: Array<{
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }> = [];

  if (typeof storageAny.getDashboardAllTimeAggregate === "function") {
    try {
      rows = (await storageAny.getDashboardAllTimeAggregate(userId)) ?? [];
    } catch (err) {
      console.error(
        "[dashboardAllTime] storage.getDashboardAllTimeAggregate failed:",
        (err as any)?.message,
      );
      return { ...EMPTY_SUMMARY };
    }
  }

  if (rows.length === 0) {
    return { ...EMPTY_SUMMARY };
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  let tournaments = 0;
  let invested = 0;
  let profitUsd = 0;
  let itm = 0;
  let finalTables = 0;
  let wins = 0;

  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const invNative = parseFloat(r.investedNative ?? "0") || 0;
    const prfNative = parseFloat(r.profitNative ?? "0") || 0;
    invested += invNative / safeRate;
    profitUsd += prfNative / safeRate;
    tournaments += Number(r.count) || 0;
    itm += Number(r.itmCount) || 0;
    finalTables += Number(r.finalTablesCount) || 0;
    wins += Number(r.winsCount) || 0;
  }

  const roi = invested > 0 ? (profitUsd / invested) * 100 : null;

  return {
    tournaments,
    profit: profitUsd,
    invested,
    roi,
    itm,
    finalTables,
    wins,
  };
}

export interface HomeEvolutionAllTimeMonth {
  /** ISO YYYY-MM. */
  month: string;
  /** Profit USD do mes. */
  profitUsd: number;
  /** Cumulativo desde o primeiro mes com volume ate este mes (inclusive). */
  cumulativeProfitUsd: number;
  /** Numero de torneios (DISTINCT seriesId/id) no mes. */
  count: number;
}

export interface HomeEvolutionAllTimeSummary {
  months: HomeEvolutionAllTimeMonth[];
  totalProfitUsd: number;
}

function nextMonthIso(monthIso: string): string {
  const [y, m] = monthIso.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthIso;
  const next = new Date(Date.UTC(y, m, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getHomeEvolutionAllTime(
  userId: string,
): Promise<HomeEvolutionAllTimeSummary> {
  const storageAny = storage as any;
  let rows: Array<{
    month: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }> = [];

  if (typeof storageAny.getDashboardAllTimeMonthlyAggregate === "function") {
    try {
      rows =
        (await storageAny.getDashboardAllTimeMonthlyAggregate(userId)) ?? [];
    } catch (err) {
      console.error(
        "[dashboardAllTime] storage.getDashboardAllTimeMonthlyAggregate failed:",
        (err as any)?.message,
      );
      return { months: [], totalProfitUsd: 0 };
    }
  }

  if (rows.length === 0) {
    return { months: [], totalProfitUsd: 0 };
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  const byMonth = new Map<string, { profitUsd: number; count: number }>();
  for (const r of rows) {
    if (!r.month) continue;
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const profitNative = parseFloat(r.profitNative ?? "0") || 0;
    const profitUsd = profitNative / safeRate;
    const existing = byMonth.get(r.month) ?? { profitUsd: 0, count: 0 };
    existing.profitUsd += profitUsd;
    existing.count += Number(r.count) || 0;
    byMonth.set(r.month, existing);
  }

  if (byMonth.size === 0) {
    return { months: [], totalProfitUsd: 0 };
  }

  const sortedMonths = Array.from(byMonth.keys()).sort();
  const firstMonth = sortedMonths[0];
  const lastBoundary = currentMonthIso();
  const lastMonth =
    sortedMonths[sortedMonths.length - 1] > lastBoundary
      ? sortedMonths[sortedMonths.length - 1]
      : lastBoundary;

  const months: HomeEvolutionAllTimeMonth[] = [];
  let cumulative = 0;
  let cursor = firstMonth;
  while (cursor <= lastMonth) {
    const entry = byMonth.get(cursor) ?? { profitUsd: 0, count: 0 };
    cumulative += entry.profitUsd;
    months.push({
      month: cursor,
      profitUsd: entry.profitUsd,
      cumulativeProfitUsd: cumulative,
      count: entry.count,
    });
    cursor = nextMonthIso(cursor);
    // Safety guard: prevent runaway loop in case of malformed input.
    if (months.length > 600) break;
  }

  return { months, totalProfitUsd: cumulative };
}
