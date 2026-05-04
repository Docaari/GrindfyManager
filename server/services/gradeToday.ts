/**
 * gradeToday — Sprint home-reform-4 item 5 + home-reform-5 item 5.
 *
 * Spec home-reform-4 item 5: Card "Grade do dia" — chips A|B|C +
 * count/totalInvestmentUsd/abi.
 * Spec home-reform-5 item 5: Adiciona firstEntry + lastEntry (primeiro e
 * ultimo registro do dia para o profile selecionado).
 *
 * Orchestrator: pega rows nativas do storage.getGradeTodayAggregate (filtrado
 * por user + dayOfWeek + profile), converte buy-in nativo para USD via
 * fxResolver + getCurrencyForSite, devolve totals USD + ABI. Mesma cascata FX
 * dos outros cards de mes (sessionsMonth, dashboardMonth) — ADR-061.
 *
 * date e dayOfWeek sao calculados pelo caller (route handler) considerando o
 * users.timezone. Aqui o service eh agnostico de timezone.
 *
 * Boundaries via storage.getDayPlanBoundaries(userId, weekday, [profile]).
 * Retorno do storage e null-tolerant; falha eh logada e degrada para null.
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export type GradeProfile = 'A' | 'B' | 'C';

export interface GradeTodayEntry {
  /** HH:MM (registrationTime quando preenchido, senao time padrao da grade). */
  time: string;
  /** Nome do torneio. */
  name: string;
}

export interface GradeTodaySummary {
  /** ISO YYYY-MM-DD do dia computado. */
  date: string;
  /** Profile filtrado. */
  profile: GradeProfile;
  /** Total de torneios planejados no dia para o profile. */
  count: number;
  /** Investimento total em USD (soma buy-ins). */
  totalInvestmentUsd: number;
  /** Average Buy-In = totalInvestmentUsd / count. null quando count=0. */
  abi: number | null;
  /** Primeiro registro do dia (menor horario). null quando nao ha grade. */
  firstEntry: GradeTodayEntry | null;
  /** Ultimo registro do dia (maior horario). null quando nao ha grade. */
  lastEntry: GradeTodayEntry | null;
}

export async function getGradeTodaySummary(
  userId: string,
  opts: { date: string; dayOfWeek: number; profile: GradeProfile },
): Promise<GradeTodaySummary> {
  const storageAny = storage as any;
  let rows: Array<{ site: string; count: number; investedNative: string }> = [];
  if (typeof storageAny.getGradeTodayAggregate === "function") {
    try {
      rows = (await storageAny.getGradeTodayAggregate(userId, {
        dayOfWeek: opts.dayOfWeek,
        profile: opts.profile,
      })) ?? [];
    } catch (err) {
      console.error("[gradeToday] storage.getGradeTodayAggregate failed:", (err as any)?.message);
    }
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  let count = 0;
  let totalInvestmentUsd = 0;

  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const invNative = parseFloat(r.investedNative ?? "0") || 0;
    totalInvestmentUsd += invNative / safeRate;
    count += r.count;
  }

  const abi = count > 0 ? totalInvestmentUsd / count : null;

  // Sprint home-reform-5 item 5 — boundaries.
  let firstEntry: GradeTodayEntry | null = null;
  let lastEntry: GradeTodayEntry | null = null;
  if (typeof storageAny.getDayPlanBoundaries === "function") {
    try {
      const boundaries = await storageAny.getDayPlanBoundaries(userId, opts.dayOfWeek, [opts.profile]);
      if (boundaries && boundaries.first && boundaries.last) {
        firstEntry = { time: String(boundaries.first.time ?? ''), name: String(boundaries.first.name ?? '') };
        lastEntry = { time: String(boundaries.last.time ?? ''), name: String(boundaries.last.name ?? '') };
      }
    } catch (err) {
      console.error("[gradeToday] storage.getDayPlanBoundaries failed:", (err as any)?.message);
    }
  }

  return {
    date: opts.date,
    profile: opts.profile,
    count,
    totalInvestmentUsd,
    abi,
    firstEntry,
    lastEntry,
  };
}
