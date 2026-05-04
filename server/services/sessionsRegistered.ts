/**
 * sessionsRegistered — Sprint home-reform-5 item 6.
 *
 * Spec: Docs/specs/home-reform-5.md Item 6 (Sessoes Registradas).
 *
 * Orchestrator do card "Sessoes Registradas" (renome do antigo "Performance").
 * Pega rows nativas do storage.getSessionsRegisteredAggregate, converte para
 * USD via fxResolver + getCurrencyForSite e devolve totais agregados.
 *
 * Fonte: `session_tournaments` (live grind), nao `tournaments`. CLAUDE.md §6.1.
 *
 * KPIs:
 *   - tournaments: COUNT(*) total
 *   - profit / invested / roi (FX-normalizado USD)
 *   - itm: COUNT(prize > 0)
 *   - finalTables: COUNT(position BETWEEN 1 AND 9)
 *   - wins: COUNT(position = 1)
 *
 * Confirmacao founder (2026-05-04): user real USER-0005 = 124 torneios,
 * profit -$255.24, ROI -17.4% (validacao pos-implementacao).
 *
 * Lessons aplicadas:
 *   #6  normalizar para USD via fxResolver antes de comparar/somar
 *   #9  log antes de fallback (nao engolir erro silencioso)
 */

import { storage } from "../storage";
import { fxResolver } from "./fxResolver";
import { getCurrencyForSite } from "@shared/platform-currency";

export interface SessionsRegisteredSummary {
  /** Total de tournaments no session_tournaments. */
  tournaments: number;
  /** Profit em USD (returns - invested) somado em todos sites. */
  profit: number;
  /** Investimento total em USD. Denominador do ROI. */
  invested: number;
  /** ROI percentual (profit/invested * 100). null se invested=0. */
  roi: number | null;
  /** Eventos in-the-money (prize > 0). */
  itm: number;
  /** Mesas finais (position 1..9). */
  finalTables: number;
  /** Cravadas (position = 1). */
  wins: number;
}

const EMPTY: SessionsRegisteredSummary = {
  tournaments: 0,
  profit: 0,
  invested: 0,
  roi: null,
  itm: 0,
  finalTables: 0,
  wins: 0,
};

export async function getSessionsRegisteredSummary(
  userId: string,
): Promise<SessionsRegisteredSummary> {
  const storageAny = storage as any;
  let rows: Array<{
    site: string;
    count: number;
    investedNative: string;
    returnsNative: string;
    itmCount: number;
    finalTablesCount: number;
    winsCount: number;
  }> = [];

  if (typeof storageAny.getSessionsRegisteredAggregate === "function") {
    try {
      rows = (await storageAny.getSessionsRegisteredAggregate(userId)) ?? [];
    } catch (err) {
      console.error(
        "[sessionsRegistered] storage.getSessionsRegisteredAggregate failed:",
        (err as any)?.message,
      );
      return { ...EMPTY };
    }
  }

  if (rows.length === 0) {
    return { ...EMPTY };
  }

  const { rates } = await fxResolver.resolveExchangeRates(userId);

  let tournaments = 0;
  let invested = 0;
  let returnsUsd = 0;
  let itm = 0;
  let finalTables = 0;
  let wins = 0;

  for (const r of rows) {
    const currency = getCurrencyForSite(r.site).code;
    const rate = rates[currency] ?? 1;
    const safeRate = rate > 0 ? rate : 1;
    const invNative = parseFloat(r.investedNative ?? "0") || 0;
    const retNative = parseFloat(r.returnsNative ?? "0") || 0;
    invested += invNative / safeRate;
    returnsUsd += retNative / safeRate;
    tournaments += Number(r.count) || 0;
    itm += Number(r.itmCount) || 0;
    finalTables += Number(r.finalTablesCount) || 0;
    wins += Number(r.winsCount) || 0;
  }

  const profit = returnsUsd - invested;
  const roi = invested > 0 ? (profit / invested) * 100 : null;

  return { tournaments, profit, invested, roi, itm, finalTables, wins };
}
