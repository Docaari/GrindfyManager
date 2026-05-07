/**
 * computeBreakdowns — agrega torneios em 3 maps (types fixos / speeds fixos /
 * platforms dinamicos). Sprint Grind-Cards-Reform v2 — CA-13/14/15 (§3.1 + §4.4).
 *
 * Convencoes:
 *  - tournaments com `currency` USD nao requerem rate.
 *  - tournaments BRL/EUR precisam de `usdConversionRates[code]` (1 USD = N moeda).
 *    Ex: rate 5 -> R$50 / 5 = $10 USD.
 *  - speed = null/undefined/'' agrega em Normal (default fallback).
 *  - type fora de TOURNAMENT_PRIMARY_TYPES NAO agrega em type-bucket, mas
 *    conta no denominador do percentage (total).
 *  - Site desconhecido cai em bucket 'Outras'.
 *  - Empate em count em platforms => ordem alfabetica do network.
 *  - ROI = profit / invested * 100; null quando invested = 0.
 *  - Performance: 1 unico loop sobre tournaments[]; O(N).
 */

import {
  TOURNAMENT_PRIMARY_TYPES,
  TYPE_LABELS_PT_BR,
  TYPE_COLORS,
  type TournamentPrimaryType,
} from '@shared/tournamentTypes';
import { getCurrencyForSite, getNetworkForSite } from '@shared/platform-currency';
import type { BreakdownBucket } from './types';

const SPEEDS = ['Normal', 'Turbo', 'Hyper'] as const;
type SpeedKey = (typeof SPEEDS)[number];

interface BreakdownAccumulator {
  count: number;
  profitUsd: number;
  investedUsd: number;
}

interface RawTournament {
  type?: string | null;
  speed?: string | null;
  site?: string | null;
  currency?: string | null;
  buyIn?: number | string | null;
  reentries?: number | string | null;
  rebuys?: number | string | null;
  addOnTaken?: boolean | null;
  addOnCost?: number | string | null;
  profit?: number | string | null;
  result?: number | string | null;
  prize?: number | string | null;
  bounty?: number | string | null;
}

export interface BreakdownResult {
  types: BreakdownBucket[];
  speeds: BreakdownBucket[];
  platforms: BreakdownBucket[];
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte um valor em moeda nativa para USD usando o mapa `usdConversionRates`
 * (convencao: rate = "1 USD = N moeda nativa").
 *  - USD => valor inalterado.
 *  - Outras moedas => valor / rate. Sem rate valida -> retorna valor cru
 *    (best-effort para nao explodir UI).
 */
function toUsd(amountNative: number, currencyCode: string, rates: Record<string, number>): number {
  if (!Number.isFinite(amountNative) || amountNative === 0) return 0;
  const code = (currencyCode || 'USD').toUpperCase();
  if (code === 'USD') return amountNative;
  const rate = rates[code];
  if (!Number.isFinite(rate) || rate <= 0) return amountNative;
  return amountNative / rate;
}

function emptyAcc(): BreakdownAccumulator {
  return { count: 0, profitUsd: 0, investedUsd: 0 };
}

function buildBucket(
  key: string,
  label: string,
  acc: BreakdownAccumulator,
  totalCount: number,
  colorHex?: string,
): BreakdownBucket {
  const percentage = totalCount > 0 ? (acc.count / totalCount) * 100 : 0;
  const roi = acc.investedUsd > 0 ? (acc.profitUsd / acc.investedUsd) * 100 : null;
  return {
    key,
    label,
    count: acc.count,
    percentage,
    totalProfitUsd: acc.profitUsd,
    totalInvestedUsd: acc.investedUsd,
    roi,
    colorHex,
  };
}

export function computeBreakdowns(
  tournaments: RawTournament[],
  usdConversionRates: Record<string, number>,
): BreakdownResult {
  // Init maps com chaves fixas (types/speeds).
  const byType = new Map<TournamentPrimaryType, BreakdownAccumulator>();
  for (const t of TOURNAMENT_PRIMARY_TYPES) byType.set(t, emptyAcc());

  const bySpeed = new Map<SpeedKey, BreakdownAccumulator>();
  for (const s of SPEEDS) bySpeed.set(s, emptyAcc());

  const byPlatform = new Map<string, BreakdownAccumulator>();

  const totalCount = tournaments.length;

  for (const t of tournaments) {
    // Resolve moeda via site (tournament.currency tem prioridade se presente).
    const ccyCode =
      typeof t.currency === 'string' && t.currency.length > 0
        ? t.currency.toUpperCase()
        : getCurrencyForSite(String(t.site ?? '')).code;

    const buyInNative = toNumber(t.buyIn);
    const reentriesNum = toNumber(t.reentries);
    const rebuysNum = toNumber(t.rebuys);
    const addOnCostNative = t.addOnTaken ? toNumber(t.addOnCost) : 0;
    // Alinhado com server profit (server/routes/grind-sessions.ts:822):
    //   profit = result + bounty - buyIn*(1+rebuys+reentries) - addOnCost
    // Senao ROI dos buckets diverge do KPI L4 quando ha rebuys/add-ons.
    const investedNative = buyInNative * (1 + reentriesNum + rebuysNum) + addOnCostNative;

    // Profit nativa: priorizar `profit` se presente; caso contrario calcular
    // via prize/bounty/buyin.
    let profitNative: number;
    if (t.profit !== undefined && t.profit !== null && t.profit !== '') {
      profitNative = toNumber(t.profit);
    } else if (t.prize !== undefined || t.bounty !== undefined) {
      const prize = toNumber(t.prize);
      const bounty = toNumber(t.bounty);
      profitNative = prize + bounty - investedNative;
    } else if (t.result !== undefined) {
      profitNative = toNumber(t.result);
    } else {
      profitNative = 0;
    }

    const profitUsd = toUsd(profitNative, ccyCode, usdConversionRates);
    const investedUsd = toUsd(investedNative, ccyCode, usdConversionRates);

    // type bucket — so agrega se type valido (esta no enum).
    const typeKey = t.type as TournamentPrimaryType | undefined;
    if (typeKey && byType.has(typeKey)) {
      const acc = byType.get(typeKey)!;
      acc.count += 1;
      acc.profitUsd += profitUsd;
      acc.investedUsd += investedUsd;
    }
    // type invalido NAO agrega em nenhum bucket de tipo (mas conta no denominador).

    // speed bucket — null/empty -> Normal default.
    const speedRaw = t.speed;
    const speedKey: SpeedKey =
      speedRaw === 'Turbo' ? 'Turbo' : speedRaw === 'Hyper' ? 'Hyper' : 'Normal';
    const speedAcc = bySpeed.get(speedKey)!;
    speedAcc.count += 1;
    speedAcc.profitUsd += profitUsd;
    speedAcc.investedUsd += investedUsd;

    // platform bucket — dinamico.
    const network = getNetworkForSite(t.site);
    const platAcc = byPlatform.get(network) ?? emptyAcc();
    platAcc.count += 1;
    platAcc.profitUsd += profitUsd;
    platAcc.investedUsd += investedUsd;
    byPlatform.set(network, platAcc);
  }

  // Build types array (ordem fixa de TOURNAMENT_PRIMARY_TYPES).
  const types: BreakdownBucket[] = TOURNAMENT_PRIMARY_TYPES.map((key) =>
    buildBucket(
      key,
      TYPE_LABELS_PT_BR[key],
      byType.get(key)!,
      totalCount,
      TYPE_COLORS[key].hex,
    ),
  );

  // Build speeds array (ordem fixa Normal/Turbo/Hyper).
  const speeds: BreakdownBucket[] = SPEEDS.map((key) =>
    buildBucket(key, key, bySpeed.get(key)!, totalCount),
  );

  // Build platforms array — descending count, alfabetico tie-break.
  const platforms: BreakdownBucket[] = Array.from(byPlatform.entries())
    .map(([key, acc]) => buildBucket(key, key, acc, totalCount))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.key.localeCompare(b.key);
    });

  return { types, speeds, platforms };
}
