/**
 * homeEvolution — Sprint home-reform-4 item 10.
 *
 * Spec: Docs/specs/home-reform-4.md item 10. Grafico de evolucao do mes
 * selecionado abaixo do DashboardMonthCard. Mesma fonte de dados do card
 * (CLAUDE.md §6.1 — `tournaments WHERE grind_session_id IS NULL`), agora
 * agregado por dia.
 *
 * Pega daily rows nativas do storage.getDashboardDailyAggregate, aplica FX
 * por site (igual dashboardMonth.ts), e devolve serie ordenada com profit do
 * dia + cumulativo no mes. Frontend plota cumulativo como linha principal.
 *
 * Limites:
 *   - month inteiro UTC (1o ate 1o do mes seguinte exclusivo).
 *   - Dias sem torneios = profit=0, cumulative herda do dia anterior.
 *   - Mes corrente: serie cobre dias ate hoje (UTC). Meses passados: mes
 *     completo. Mes futuro: serie vazia.
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export interface HomeEvolutionDay {
  /** ISO YYYY-MM-DD UTC. */
  date: string;
  /** Profit USD do dia (pode ser 0 ou negativo). */
  profitUsd: number;
  /** Profit acumulado USD desde o dia 1 do mes ate este dia (inclusive). */
  cumulativeProfitUsd: number;
  /** Numero de torneios no dia (DISTINCT seriesId/id). */
  count: number;
}

export interface HomeEvolutionSummary {
  /** ISO YYYY-MM-01 UTC. */
  monthStart: string;
  /** ISO do dia ate onde a serie vai (YYYY-MM-DD). */
  endDate: string;
  /** Serie continua. Cobre todos os dias entre monthStart e endDate. */
  days: HomeEvolutionDay[];
  /** Total profit USD no periodo coberto. */
  totalProfitUsd: number;
}

/** Parse "YYYY-MM" → { monthStart, monthEnd } UTC. Retorna null se invalido. */
export function parseMonthIso(monthIso: string | null | undefined): { monthStart: Date; monthEnd: Date } | null {
  if (!monthIso || typeof monthIso !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(monthIso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  return { monthStart, monthEnd };
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getHomeEvolution(
  userId: string,
  monthIso?: string | null,
): Promise<HomeEvolutionSummary> {
  const now = new Date();
  const parsed = parseMonthIso(monthIso ?? null);
  const monthStart = parsed?.monthStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = parsed?.monthEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // endDate: para o mes corrente, cobre ate hoje (UTC); para meses passados,
  // cobre o mes inteiro; para meses futuros, retorna serie vazia.
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthLastDay = new Date(monthEnd.getTime() - 24 * 60 * 60 * 1000);
  let endDay: Date;
  if (todayUtc < monthStart) {
    return {
      monthStart: formatIsoDate(monthStart),
      endDate: formatIsoDate(monthStart),
      days: [],
      totalProfitUsd: 0,
    };
  }
  if (todayUtc >= monthEnd) {
    endDay = monthLastDay;
  } else {
    endDay = todayUtc;
  }

  const storageAny = storage as any;
  let rows: Array<{
    date: string;
    site: string;
    count: number;
    investedNative: string;
    profitNative: string;
  }> = [];
  if (typeof storageAny.getDashboardDailyAggregate === "function") {
    try {
      rows = (await storageAny.getDashboardDailyAggregate(userId, { monthStart, monthEnd })) ?? [];
    } catch (err) {
      console.error("[homeEvolution] storage.getDashboardDailyAggregate failed:", (err as any)?.message);
    }
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  const byDate = new Map<string, { profitUsd: number; count: number }>();
  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const profitNative = parseFloat(r.profitNative ?? "0") || 0;
    const profitUsd = profitNative / safeRate;
    const existing = byDate.get(r.date) ?? { profitUsd: 0, count: 0 };
    existing.profitUsd += profitUsd;
    existing.count += r.count;
    byDate.set(r.date, existing);
  }

  const days: HomeEvolutionDay[] = [];
  let cumulative = 0;
  const cursor = new Date(monthStart.getTime());
  while (cursor.getTime() <= endDay.getTime()) {
    const dateIso = formatIsoDate(cursor);
    const entry = byDate.get(dateIso) ?? { profitUsd: 0, count: 0 };
    cumulative += entry.profitUsd;
    days.push({
      date: dateIso,
      profitUsd: entry.profitUsd,
      cumulativeProfitUsd: cumulative,
      count: entry.count,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    monthStart: formatIsoDate(monthStart),
    endDate: formatIsoDate(endDay),
    days,
    totalProfitUsd: cumulative,
  };
}
