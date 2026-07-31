/**
 * historicalFxResolver — cambio POR DATA DO TORNEIO no import (ADR-243).
 *
 * ANTES: o parser convertia toda linha nao-USD por UMA taxa flat vinda das
 * settings do usuario (defaults chumbados BRL 5,0 / CNY 7,20 / EUR 0,92). Um
 * torneio de 2021 e um de 2026 usavam a mesma cotacao, e a taxa "de hoje" mudava
 * o passado a cada import. Medicao no export real do founder: a diferenca de
 * cotacao do CNY (7,20 vs ~6,86 usada pelo SharkScope) era a UNICA divergencia
 * de valor entre o Grindfy e o SharkScope na conta GGNetwork.
 *
 * AGORA: cada linha usa a cotacao do dia em que o torneio foi jogado, vinda de
 * `system_fx_rates` (BCB PTAX para BRL, Frankfurter/ECB para o resto), com
 * cascata explicita e registro da origem em `tournaments.fx_source`:
 *   1. `historical_exact`   — cotacao do proprio dia
 *   2. `historical_prev`    — ultimo dia util anterior (mercado fecha fim de semana)
 *   3. `historical_nearest` — cotacao mais proxima disponivel (qualquer direcao)
 *   4. `import_rates`       — taxa flat das settings (comportamento antigo)
 *
 * O NUCLEO E PURO (`pickHistoricalRate`, `applyHistoricalFx`): sem I/O, sem
 * Date.now(). Somente `buildHistoricalFxTable` toca banco/rede, e sempre em
 * best-effort — falha de rede degrada para a taxa flat, nunca derruba o import.
 */

import type { ParsedTournament } from "../../csvParser";

export interface HistoricalRateHit {
  /** Unidades da moeda por 1 USD. */
  rate: number;
  /** `historical_exact` | `historical_prev` | `historical_nearest`. */
  source: string;
  /** Data (YYYY-MM-DD) da cotacao efetivamente usada. */
  rateDate: string;
}

/** Linha crua de cotacao (mesma forma de `system_fx_rates`). */
export interface RateRow {
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  ratePerUsd: number;
  source?: string;
}

/** Indice currency -> [{date, rate}] ordenado por data ASC. */
export type RateIndex = Map<string, Array<{ date: string; rate: number }>>;

/** Distancia maxima (dias) aceita para "dia util anterior". */
export const MAX_PREV_DAYS = 7;

export function buildRateIndex(rows: RateRow[]): RateIndex {
  const index: RateIndex = new Map();
  for (const r of rows ?? []) {
    if (!r || !r.currency || !r.date) continue;
    const rate = typeof r.ratePerUsd === "number" ? r.ratePerUsd : Number(r.ratePerUsd);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const key = r.currency.toUpperCase();
    const list = index.get(key) ?? [];
    list.push({ date: String(r.date).slice(0, 10), rate });
    index.set(key, list);
  }
  for (const list of index.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return index;
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86400000;
}

/**
 * Cotacao para (moeda, data) segundo a cascata documentada no topo.
 * PURA. Retorna null quando a moeda nao tem nenhuma cotacao no indice.
 */
export function pickHistoricalRate(
  index: RateIndex,
  currency: string,
  isoDate: string,
): HistoricalRateHit | null {
  const list = index.get(String(currency ?? "").toUpperCase());
  if (!list || list.length === 0) return null;
  const target = String(isoDate ?? "").slice(0, 10);
  if (target.length !== 10) return null;

  let prev: { date: string; rate: number } | null = null;
  let next: { date: string; rate: number } | null = null;

  for (const row of list) {
    if (row.date === target) {
      return { rate: row.rate, source: "historical_exact", rateDate: row.date };
    }
    if (row.date < target) prev = row; // lista ASC — ultimo menor vence
    else if (!next) next = row; // primeiro maior
  }

  if (prev && daysBetween(prev.date, target) <= MAX_PREV_DAYS) {
    return { rate: prev.rate, source: "historical_prev", rateDate: prev.date };
  }

  // Mais proxima em qualquer direcao (import de historico antigo/futuro).
  const candidates = [prev, next].filter(Boolean) as Array<{ date: string; rate: number }>;
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => daysBetween(a.date, target) - daysBetween(b.date, target));
  const best = candidates[0];
  return { rate: best.rate, source: "historical_nearest", rateDate: best.date };
}

/** Campos monetarios de ParsedTournament afetados por conversao. */
const MONEY_FIELDS = ["buyIn", "prize", "rake", "grossPrize", "bountyPrize", "prizePool"] as const;

function isoDayUtc(d: Date | null | undefined): string | null {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Re-valoriza as linhas ja parseadas usando a cotacao da data de cada torneio.
 * PURA (nao muta o array de entrada; devolve novos objetos).
 *
 * Duas situacoes:
 *  - linha JA convertida pela taxa flat (`fxRateUsed` preenchido): reverte com
 *    `valor * fxRateUsed` e reaplica a taxa historica — exato, sem perda.
 *  - linha NAO convertida (sem taxa disponivel no parse): converte agora.
 *
 * Linha em USD, ou moeda sem cotacao no indice, passa intacta.
 */
export function applyHistoricalFx(
  parsed: Array<ParsedTournament & Record<string, any>>,
  index: RateIndex,
): { tournaments: Array<ParsedTournament & Record<string, any>>; applied: number; bySource: Record<string, number> } {
  const bySource: Record<string, number> = {};
  let applied = 0;

  const out = (parsed ?? []).map((t) => {
    const currency = String(t.currency ?? "USD").toUpperCase();
    if (!currency || currency === "USD") return t;

    const day = isoDayUtc(t.datePlayed as Date);
    if (!day) return t;

    const hit = pickHistoricalRate(index, currency, day);
    if (!hit) return t;

    const flatRate = typeof t.fxRateUsed === "number" && t.fxRateUsed > 0 ? t.fxRateUsed : null;
    // Fator para ir do valor atual (USD-flat OU nativo) para USD-historico.
    const factor = flatRate ? flatRate / hit.rate : 1 / hit.rate;
    if (!Number.isFinite(factor) || factor <= 0) return t;

    const next: Record<string, any> = { ...t };
    for (const field of MONEY_FIELDS) {
      const v = (t as any)[field];
      if (v === null || v === undefined) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      next[field] = n * factor;
    }

    // Nativos recalculados a partir do valor historico (auditoria coerente).
    next.buyInNative = Number.isFinite(Number(next.buyIn)) ? Number(next.buyIn) * hit.rate : null;
    next.prizeNative = Number.isFinite(Number(next.prize)) ? Number(next.prize) * hit.rate : null;
    next.convertedToUSD = true;
    next.fxRateUsed = hit.rate;
    next.fxSource = hit.source;
    next.fxRateDate = hit.rateDate;

    applied++;
    bySource[hit.source] = (bySource[hit.source] ?? 0) + 1;
    return next as ParsedTournament & Record<string, any>;
  });

  return { tournaments: out, applied, bySource };
}

/** Moedas nao-USD presentes no lote + janela de datas (para uma unica busca). */
export function summarizeFxNeeds(
  parsed: Array<ParsedTournament & Record<string, any>>,
): { currencies: string[]; minDate: string | null; maxDate: string | null } {
  const currencies = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const t of parsed ?? []) {
    const ccy = String(t.currency ?? "USD").toUpperCase();
    if (!ccy || ccy === "USD") continue;
    currencies.add(ccy);
    const day = isoDayUtc(t.datePlayed as Date);
    if (!day) continue;
    if (!minDate || day < minDate) minDate = day;
    if (!maxDate || day > maxDate) maxDate = day;
  }
  return { currencies: [...currencies].sort(), minDate, maxDate };
}

function shiftDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export interface BuildTableOptions {
  currencies: string[];
  minDate: string;
  maxDate: string;
  /** Busca no provider as datas ausentes e persiste (best-effort). Default true. */
  fetchMissing?: boolean;
  /** Teto de tempo para a busca externa. Default 20s — import nao pode pendurar. */
  fetchTimeoutMs?: number;
}

/**
 * Monta o indice de cotacoes para o lote. Toca banco e (best-effort) rede.
 * NUNCA lanca: qualquer falha devolve o indice com o que conseguiu, e o caller
 * cai na taxa flat para as linhas sem cobertura.
 */
export async function buildHistoricalFxTable(opts: BuildTableOptions): Promise<RateIndex> {
  const currencies = (opts.currencies ?? []).map((c) => c.toUpperCase()).filter((c) => c && c !== "USD");
  if (currencies.length === 0 || !opts.minDate || !opts.maxDate) return new Map();

  // Folga de MAX_PREV_DAYS para cobrir fim de semana/feriado na borda inferior.
  const from = shiftDays(opts.minDate, -MAX_PREV_DAYS);
  const to = opts.maxDate;

  let rows: RateRow[] = [];
  try {
    const { db } = await import("../../db");
    const { inArray, and, gte, lte, asc } = await import("drizzle-orm");
    const { systemFxRates } = await import("@shared/schema");
    // Query builder (nao `sql` template): `currency = ANY(${array})` interpolava
    // o array como um unico bound param e quebrava com "Failed query".
    const raw = await db
      .select({
        currency: systemFxRates.currency,
        date: systemFxRates.date,
        ratePerUsd: systemFxRates.ratePerUsd,
        source: systemFxRates.source,
      })
      .from(systemFxRates)
      .where(
        and(
          inArray(systemFxRates.currency, currencies),
          gte(systemFxRates.date, from),
          lte(systemFxRates.date, to),
        ),
      )
      .orderBy(asc(systemFxRates.currency), asc(systemFxRates.date));
    rows = (raw ?? []).map((r: any) => ({
      currency: String(r.currency),
      date: String(r.date).slice(0, 10),
      ratePerUsd: Number(r.ratePerUsd),
      source: r.source ? String(r.source) : undefined,
    }));
  } catch (err) {
    // Log antes do fallback (lesson #9) — distingue "sem cotacao" de "DB caiu".
    console.error("fx.historical.db_lookup_failed", {
      currencies,
      from,
      to,
      err: (err as any)?.message ?? String(err),
    });
  }

  // Cobertura por moeda: nao basta "tem alguma cotacao" — o que importa e se a
  // serie cobre a JANELA pedida. Sem isso, um historico de 2022 caia todo em
  // `historical_nearest` so porque a tabela tinha alguns dias de 2026.
  const byCurrency = new Map<string, string[]>();
  for (const r of rows) {
    byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r.date]);
  }
  const spanDays = Math.max(1, Math.round(daysBetween(from, to)) + 1);
  // ~5/7 dos dias sao uteis; exige metade disso para considerar a serie densa.
  const minExpected = Math.max(1, Math.floor(spanDays * (5 / 7) * 0.5));

  const missing = currencies.filter((c) => {
    const dates = (byCurrency.get(c) ?? []).slice().sort();
    if (dates.length === 0) return true;
    const coversStart = dates[0] <= from || daysBetween(dates[0], from) <= MAX_PREV_DAYS;
    const coversEnd = dates[dates.length - 1] >= to || daysBetween(dates[dates.length - 1], to) <= MAX_PREV_DAYS;
    if (!coversStart || !coversEnd) return true;
    return dates.length < minExpected; // buraco grande no meio
  });

  if (opts.fetchMissing !== false && missing.length > 0) {
    const timeoutMs = opts.fetchTimeoutMs ?? 20000;
    try {
      const fetched = await Promise.race([
        (async () => {
          const { fetchTimeseries } = await import("./adapters/frankfurterAdapter");
          return await fetchTimeseries(from, to, missing);
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs).unref?.()),
      ]);
      if (Array.isArray(fetched) && fetched.length > 0) {
        rows = rows.concat(
          fetched.map((r: any) => ({
            currency: String(r.currency),
            date: String(r.date).slice(0, 10),
            ratePerUsd: Number(r.ratePerUsd),
            source: "frankfurter",
          })),
        );
        // Persiste para o proximo import nao precisar de rede (best-effort).
        try {
          const { upsertDailyRates } = await import("./fxRatesPersistence");
          const byDate = new Map<string, any[]>();
          for (const r of fetched as any[]) {
            const d = String(r.date).slice(0, 10);
            byDate.set(d, [...(byDate.get(d) ?? []), r]);
          }
          for (const [d, list] of byDate) await upsertDailyRates(d, list as any);
        } catch (persistErr) {
          console.error("fx.historical.persist_failed", {
            err: (persistErr as any)?.message ?? String(persistErr),
          });
        }
      } else if (fetched === null) {
        console.warn("fx.historical.provider_timeout", { currencies: missing, timeoutMs });
      }
    } catch (err) {
      console.error("fx.historical.provider_failed", {
        currencies: missing,
        err: (err as any)?.message ?? String(err),
      });
    }
  }

  return buildRateIndex(rows);
}

/**
 * Atalho usado pelos endpoints de upload: mede as necessidades do lote, monta a
 * tabela e re-valoriza. Devolve tambem o resumo para o relatorio do import.
 */
export async function applyHistoricalFxToBatch(
  parsed: Array<ParsedTournament & Record<string, any>>,
  opts: { fetchMissing?: boolean } = {},
): Promise<{
  tournaments: Array<ParsedTournament & Record<string, any>>;
  fx: { applied: number; bySource: Record<string, number>; currencies: string[]; uncovered: number } | null;
}> {
  const needs = summarizeFxNeeds(parsed);
  if (needs.currencies.length === 0 || !needs.minDate || !needs.maxDate) {
    return { tournaments: parsed, fx: null };
  }
  const index = await buildHistoricalFxTable({
    currencies: needs.currencies,
    minDate: needs.minDate,
    maxDate: needs.maxDate,
    fetchMissing: opts.fetchMissing,
  });
  const { tournaments, applied, bySource } = applyHistoricalFx(parsed, index);
  const nonUsd = parsed.filter((t) => String(t.currency ?? "USD").toUpperCase() !== "USD").length;
  return {
    tournaments,
    fx: { applied, bySource, currencies: needs.currencies, uncovered: Math.max(0, nonUsd - applied) },
  };
}
