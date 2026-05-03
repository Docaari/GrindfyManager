/**
 * sessionsMonth — Sprint home-reform-4 item 1.
 *
 * Spec: Docs/specs/home-reform-4.md item 1 (Card Sessoes mes atual).
 *
 * Orchestrator que pega rows nativas do storage.getSessionsMonthAggregate,
 * converte para USD via fxResolver + getCurrencyForSite, e devolve totais
 * agregados pro card Sessoes mes atual da home.
 *
 * Diferente de dashboardService.getRoiByPlatform: este aqui usa
 * `session_tournaments` (live grind), nao `tournaments`. CLAUDE.md §6.1.
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export interface SessionsMonthSummary {
  /** ISO YYYY-MM-01 do mes computado. */
  monthStart: string;
  /** Total de tournaments no session_tournaments do mes. */
  count: number;
  /** Profit em USD (returns - invested) somado em todos sites. */
  profitUsd: number;
  /** Investimento total em USD somado em todos sites (denominador ROI). */
  investedUsd: number;
  /** ROI percentual (profit/invested * 100). null se invested=0. */
  roiPct: number | null;
}

export async function getSessionsMonthSummary(userId: string): Promise<SessionsMonthSummary> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const storageAny = storage as any;
  let rows: Array<{ site: string; count: number; investedNative: string; returnsNative: string }> = [];
  if (typeof storageAny.getSessionsMonthAggregate === "function") {
    try {
      rows = (await storageAny.getSessionsMonthAggregate(userId, { monthStart, monthEnd })) ?? [];
    } catch (err) {
      console.error("[sessionsMonth] storage.getSessionsMonthAggregate failed:", (err as any)?.message);
    }
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  let count = 0;
  let investedUsd = 0;
  let returnsUsd = 0;

  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const invNative = parseFloat(r.investedNative ?? "0") || 0;
    const retNative = parseFloat(r.returnsNative ?? "0") || 0;
    investedUsd += invNative / safeRate;
    returnsUsd += retNative / safeRate;
    count += r.count;
  }

  const profitUsd = returnsUsd - investedUsd;
  const roiPct = investedUsd > 0 ? (profitUsd / investedUsd) * 100 : null;

  return {
    monthStart: monthStart.toISOString().slice(0, 10),
    count,
    profitUsd,
    investedUsd,
    roiPct,
  };
}
