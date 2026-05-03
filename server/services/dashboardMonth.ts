/**
 * dashboardMonth — Sprint home-reform-4 item 2+6.
 *
 * Spec: Docs/specs/home-reform-4.md item 2 (novo Card Dashboard) + item 6
 * (Performance abaixo de Sessoes, mesmo padrao). Mes corrente UTC.
 *
 * Orchestrator que pega rows nativas do storage.getDashboardMonthAggregate,
 * converte para USD via fxResolver + getCurrencyForSite, e devolve totais
 * agregados. Diferente de sessionsMonth: este usa `tournaments WHERE
 * grind_session_id IS NULL` (CLAUDE.md §6.1) — historico oficial do
 * dashboard (uploads, manual grade, sharkscope).
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export interface DashboardMonthSummary {
  /** ISO YYYY-MM-01 do mes computado. */
  monthStart: string;
  /** Total de tournaments distintos (DISTINCT seriesId OR id) no mes. */
  count: number;
  /** Profit em USD. tournaments.prize ja eh net profit. */
  profitUsd: number;
  /** Investimento total em USD (denominador ROI). */
  investedUsd: number;
  /** ROI percentual (profit/invested * 100). null se invested=0. */
  roiPct: number | null;
}

export async function getDashboardMonthSummary(userId: string): Promise<DashboardMonthSummary> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const storageAny = storage as any;
  let rows: Array<{ site: string; count: number; investedNative: string; profitNative: string }> = [];
  if (typeof storageAny.getDashboardMonthAggregate === "function") {
    try {
      rows = (await storageAny.getDashboardMonthAggregate(userId, { monthStart, monthEnd })) ?? [];
    } catch (err) {
      console.error("[dashboardMonth] storage.getDashboardMonthAggregate failed:", (err as any)?.message);
    }
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  let count = 0;
  let investedUsd = 0;
  let profitUsd = 0;

  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const invNative = parseFloat(r.investedNative ?? "0") || 0;
    const prfNative = parseFloat(r.profitNative ?? "0") || 0;
    investedUsd += invNative / safeRate;
    profitUsd += prfNative / safeRate;
    count += r.count;
  }

  const roiPct = investedUsd > 0 ? (profitUsd / investedUsd) * 100 : null;

  return {
    monthStart: monthStart.toISOString().slice(0, 10),
    count,
    profitUsd,
    investedUsd,
    roiPct,
  };
}
