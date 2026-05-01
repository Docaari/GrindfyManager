/**
 * dashboardService — Sprint Bankroll-3 RF-7
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-7)
 *
 * getRoiByPlatform: agrega session_tournaments x tournaments por site,
 *   converte para USD via fxResolver + getCurrencyForSite, retorna top N
 *   ordenado por investedUSD DESC.
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export type RoiPeriod = "7d" | "30d" | "90d" | "180d" | "all";

export interface RoiByPlatformOptions {
  period?: RoiPeriod;
  limit?: number;
}

export interface RoiByPlatformEntry {
  site: string;
  sessionsCount: number;
  tournamentsCount: number;
  investedUSD: number;
  profitUSD: number;
  roiPct: number;
}

export interface RoiByPlatformResult {
  period: string;
  generatedAt: string;
  platforms: RoiByPlatformEntry[];
}

const PERIOD_DAYS: Record<RoiPeriod, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  all: null,
};

function periodToSinceDate(period: RoiPeriod): Date | null {
  const days = PERIOD_DAYS[period];
  if (days == null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function getRoiByPlatform(
  userId: string,
  opts: RoiByPlatformOptions = {},
): Promise<RoiByPlatformResult> {
  const period: RoiPeriod = (opts.period ?? "30d") as RoiPeriod;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const sinceDate = periodToSinceDate(period);

  let rows: Array<{
    site: string;
    sessionsCount: number;
    tournamentsCount: number;
    investedNative: string;
    profitNative: string;
  }> = [];

  try {
    const storageAny = storage as any;
    if (typeof storageAny.getRoiByPlatform === "function") {
      rows = await storageAny.getRoiByPlatform(userId, { sinceDate, limit });
    }
  } catch (err) {
    console.error("[dashboardService.getRoiByPlatform] storage call failed:", (err as any)?.message);
  }

  const fx = await fxResolver.resolveExchangeRates(userId);
  const rates = fx.rates;

  const platforms: RoiByPlatformEntry[] = rows.map((r) => {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const investedNative = parseFloat(r.investedNative ?? "0");
    const profitNative = parseFloat(r.profitNative ?? "0");
    const investedUSD = rate > 0 ? investedNative / rate : investedNative;
    const profitUSD = rate > 0 ? profitNative / rate : profitNative;
    const roiPct = investedUSD > 0 ? (profitUSD / investedUSD) * 100 : 0;
    return {
      site: r.site,
      sessionsCount: Number(r.sessionsCount) || 0,
      tournamentsCount: Number(r.tournamentsCount) || 0,
      investedUSD,
      profitUSD,
      roiPct,
    };
  });

  platforms.sort((a, b) => b.investedUSD - a.investedUSD);
  const sliced = platforms.slice(0, limit);

  return {
    period,
    generatedAt: new Date().toISOString(),
    platforms: sliced,
  };
}

export const dashboardService = {
  getRoiByPlatform,
};
