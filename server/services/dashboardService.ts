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
  /**
   * Sprint Bankroll-3 (Implementer Round UX #3): quando true, computa
   * uma segunda agregacao no periodo IMEDIATAMENTE anterior ao selecionado
   * (mesma duracao). Resultado embute previousProfitUSD/previousRoi em cada
   * entry para mostrar delta visual no card. Sem efeito quando period='all'.
   */
  compareWithPrevious?: boolean;
}

export interface RoiByPlatformEntry {
  site: string;
  sessionsCount: number;
  tournamentsCount: number;
  investedUSD: number;
  profitUSD: number;
  roiPct: number;
  /** delta vs periodo anterior (Implementer Round UX #3, opcional). */
  previousProfitUSD?: number;
  previousRoiPct?: number;
}

export interface RoiByPlatformResult {
  period: string;
  generatedAt: string;
  platforms: RoiByPlatformEntry[];
  /** true quando compareWithPrevious foi atendido com sucesso. */
  hasPreviousComparison?: boolean;
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

/**
 * Periodo imediatamente anterior, mesma duracao. Ex: period=30d ->
 * sinceDate=hoje-60d, untilDate=hoje-30d. Para 'all' retorna null
 * (nao faz sentido comparar).
 */
function previousPeriodWindow(period: RoiPeriod): { sinceDate: Date; untilDate: Date } | null {
  const days = PERIOD_DAYS[period];
  if (days == null) return null;
  const untilDate = new Date();
  untilDate.setUTCDate(untilDate.getUTCDate() - days);
  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
  return { sinceDate, untilDate };
}

interface RoiRawRow {
  site: string;
  sessionsCount: number;
  tournamentsCount: number;
  investedNative: string;
  profitNative: string;
}

async function getRoiByPlatform(
  userId: string,
  opts: RoiByPlatformOptions = {},
): Promise<RoiByPlatformResult> {
  const period: RoiPeriod = (opts.period ?? "30d") as RoiPeriod;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const sinceDate = periodToSinceDate(period);

  // HIGH-7 fix (round 2): gate por bankrollManagementEnabled.
  // Quando opt-out, dashboard ROI retorna vazio (consistente com createTransfer).
  try {
    const settings: any = await storage.getUserSettings(userId);
    if (settings && settings.bankrollManagementEnabled === false) {
      return {
        period,
        generatedAt: new Date().toISOString(),
        platforms: [],
      };
    }
  } catch (err) {
    // Erro ao ler settings: continua com default=true (read-only path).
    console.warn(
      "[dashboardService.getRoiByPlatform] getUserSettings falhou:",
      (err as any)?.message,
    );
  }

  const storageAny = storage as any;
  let rows: RoiRawRow[] = [];
  if (typeof storageAny.getRoiByPlatform === "function") {
    try {
      rows = (await storageAny.getRoiByPlatform(userId, { sinceDate, limit })) ?? [];
    } catch (err) {
      console.error(
        "[dashboardService.getRoiByPlatform] storage call failed:",
        (err as any)?.message,
      );
    }
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  const toUSD = (r: RoiRawRow) => {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const investedNative = parseFloat(r.investedNative ?? "0");
    const profitNative = parseFloat(r.profitNative ?? "0");
    return {
      investedUSD: investedNative / safeRate,
      profitUSD: profitNative / safeRate,
    };
  };

  // Sprint Bankroll-Reports-Detail (RF-08): inclui delta de manual_reports
  // por wallet/platform na soma de profitUSD. Wallet -> platform via catalog.
  // Filtro temporal pelo mesmo sinceDate. Conversao FX usa wallet.nativeCurrency
  // ou usdAmount (delta_usd_at_time) quando disponivel; fallback fxResolver.
  const manualReportProfitBySite = new Map<string, number>();
  try {
    const fromDate = sinceDate ?? undefined;
    const userTxs = (await (storageAny.listWalletTransactionsByUser?.(userId, {
      from: fromDate,
      reason: ["manual_report"],
      limit: 1000,
    })) ?? []) as any[];
    if (userTxs.length > 0) {
      let walletsCatalog: any[] = [];
      try {
        walletsCatalog = (await storage.getActiveWalletsByUser(userId)) ?? [];
      } catch (err) {
        console.warn(
          "[dashboardService.getRoiByPlatform] getActiveWalletsByUser falhou:",
          (err as any)?.message,
        );
      }
      const walletById = new Map<string, any>(walletsCatalog.map((w: any) => [w.id, w]));
      for (const tx of userTxs) {
        const wallet = walletById.get(tx.walletId);
        if (!wallet) continue;
        const site = wallet.platform;
        if (!site) continue;
        // Filtro temporal: storage.listWalletTransactionsByUser ja aplica `from`,
        // mas defesa em profundidade — descarta tx fora do periodo.
        if (fromDate) {
          const txTs = new Date(tx.occurredAt ?? 0).getTime();
          if (txTs < fromDate.getTime()) continue;
        }
        // delta USD: usa usdAmount quando presente; senao reconverte via fxResolver.
        let usd = tx.usdAmount != null ? parseFloat(String(tx.usdAmount)) : NaN;
        if (!Number.isFinite(usd)) {
          const native = parseFloat(String(tx.nativeAmount ?? "0"));
          const ccy = wallet.nativeCurrency ?? "USD";
          const rate = rates[ccy] ?? 1;
          const safeRate = rate > 0 ? rate : 1;
          usd = ccy === "USD" ? native : native / safeRate;
        }
        const signed = tx.direction === "in" ? usd : -usd;
        manualReportProfitBySite.set(site, (manualReportProfitBySite.get(site) ?? 0) + signed);
      }
    }
  } catch (err) {
    console.warn(
      "[dashboardService.getRoiByPlatform] manual_report aggregation falhou:",
      (err as any)?.message,
    );
  }

  const platformsBySite = new Map<string, RoiByPlatformEntry>();
  for (const r of rows) {
    const { investedUSD, profitUSD } = toUSD(r);
    platformsBySite.set(r.site, {
      site: r.site,
      sessionsCount: Number(r.sessionsCount) || 0,
      tournamentsCount: Number(r.tournamentsCount) || 0,
      investedUSD,
      profitUSD,
      roiPct: investedUSD > 0 ? (profitUSD / investedUSD) * 100 : 0,
    });
  }
  // Soma manual_reports — cria entry novo se site nao existe ainda em rows.
  for (const [site, mrProfit] of manualReportProfitBySite.entries()) {
    if (mrProfit === 0) continue;
    const existing = platformsBySite.get(site);
    if (existing) {
      existing.profitUSD += mrProfit;
      existing.roiPct = existing.investedUSD > 0 ? (existing.profitUSD / existing.investedUSD) * 100 : 0;
    } else {
      platformsBySite.set(site, {
        site,
        sessionsCount: 0,
        tournamentsCount: 0,
        investedUSD: 0,
        profitUSD: mrProfit,
        roiPct: 0,
      });
    }
  }

  const platforms: RoiByPlatformEntry[] = Array.from(platformsBySite.values())
    .sort((a, b) => b.investedUSD - a.investedUSD)
    .slice(0, limit);

  // Sprint Bankroll-3 Implementer Round UX #3: comparacao opcional
  // com periodo anterior (mesma duracao). Best-effort: se storage nao
  // suporta filtro por untilDate, ignoramos silenciosamente.
  let hasPreviousComparison = false;
  if (opts.compareWithPrevious) {
    const window = previousPeriodWindow(period);
    if (window && typeof storageAny.getRoiByPlatform === "function") {
      try {
        const prevRows: RoiRawRow[] = (await storageAny.getRoiByPlatform(userId, {
          sinceDate: window.sinceDate,
          untilDate: window.untilDate,
          limit: 50,
        })) ?? [];
        const prevBySite = new Map<string, { investedUSD: number; profitUSD: number }>();
        for (const r of prevRows) {
          prevBySite.set(r.site, toUSD(r));
        }
        for (const p of platforms) {
          const prev = prevBySite.get(p.site);
          if (prev) {
            p.previousProfitUSD = prev.profitUSD;
            p.previousRoiPct = prev.investedUSD > 0
              ? (prev.profitUSD / prev.investedUSD) * 100
              : 0;
          } else {
            p.previousProfitUSD = 0;
            p.previousRoiPct = 0;
          }
        }
        hasPreviousComparison = true;
      } catch (err) {
        console.warn(
          "[dashboardService.getRoiByPlatform] previous-period query failed:",
          (err as any)?.message,
        );
      }
    }
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    platforms,
    ...(hasPreviousComparison ? { hasPreviousComparison: true } : {}),
  };
}

export const dashboardService = {
  getRoiByPlatform,
};
