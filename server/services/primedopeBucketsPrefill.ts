// =============================================================================
// Sprint F4 W1 — primedopeBucketsPrefill.ts (RF-02 cascata pre-fill)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-02)
// Diagrama: Docs/architecture/flow-primedope-wizard-prefill.mermaid
//
// Cascata:
//   priority 1: tournament_templates.avgBuyIn / avgRoi / avgFieldSize (NAO marca estimado)
//   priority 2: tournament backfill 0014 (players_avg/places_paid_avg/rake_pct)
//               + NETWORK_DEFAULTS_ROI -> roiPct MARCA estimado
//   priority 3: NETWORK_DEFAULTS (rake/roi) + DEFAULT_PLAYERS_AVG=1000 + 150
//               -> marca todos como estimado
// =============================================================================

import { storage } from "../storage";
import {
  DEFAULT_PLAYERS_AVG,
  DEFAULT_PLACES_PAID,
  FX_FALLBACK_CONSTANTS,
  getNetworkRakeDefault,
  getNetworkRoiDefault,
} from "../../shared/primedopeDefaults";

export interface BuildBucketsPrefillInput {
  userId: string;
  profileLetter: "A" | "B" | "C";
  dayOfWeek: number;
  multiplier: 1 | 4 | 12 | 52;
}

export interface PrefillBucket {
  name: string;
  network: string;
  count: number;
  buyinUsd: number;
  buyinOriginal: number;
  currency: string;
  playersAvg: number;
  placesPaid: number;
  rakePct: number;
  roiPct: number;
  walletMissing?: boolean;
}

export interface BuildBucketsPrefillResult {
  buckets: PrefillBucket[];
  fxRatesUsed: Record<string, number>;
  defaultsFlags: Set<string>;
}

function nativeToUsd(
  amount: number,
  currency: string | null | undefined,
  rates: Record<string, number>,
): number {
  if (!currency || currency === "USD") return amount;
  const rate = rates[currency];
  if (typeof rate === "number" && rate > 0) return amount / rate;
  return 0;
}

async function resolveExchangeRates(userId: string): Promise<{
  rates: Record<string, number>;
  source: "users" | "wallets" | "fallback";
}> {
  let userSettings: any = null;
  try {
    userSettings = await (storage as any).getUserSettings(userId);
  } catch {
    userSettings = null;
  }
  const userRates = userSettings?.exchangeRates;
  if (
    userRates &&
    typeof userRates === "object" &&
    Object.keys(userRates).length > 0
  ) {
    return {
      rates: { ...FX_FALLBACK_CONSTANTS, ...userRates },
      source: "users",
    };
  }
  let wallets: any[] = [];
  try {
    wallets = (await (storage as any).listWalletsByUser(userId)) ?? [];
  } catch {
    wallets = [];
  }
  for (const w of wallets) {
    if (!w) continue;
    const wRates = w.exchangeRates;
    if (
      wRates &&
      typeof wRates === "object" &&
      Object.keys(wRates).length > 0
    ) {
      return {
        rates: { ...FX_FALLBACK_CONSTANTS, ...wRates },
        source: "wallets",
      };
    }
  }
  return { rates: { ...FX_FALLBACK_CONSTANTS }, source: "fallback" };
}

async function loadUserWalletCurrencies(
  userId: string,
): Promise<Set<string>> {
  try {
    const wallets = (await (storage as any).listWalletsByUser(userId)) ?? [];
    return new Set(
      wallets
        .map((w: any) => w?.nativeCurrency)
        .filter((c: unknown): c is string => typeof c === "string"),
    );
  } catch {
    return new Set();
  }
}

export async function buildBucketsPrefill(
  input: BuildBucketsPrefillInput,
): Promise<BuildBucketsPrefillResult> {
  const planned = (await (
    storage as any
  ).listPlannedTournamentsForBucketsPrefill({
    userId: input.userId,
    profileLetter: input.profileLetter,
    dayOfWeek: input.dayOfWeek,
  })) as any[];

  const fxResolution = await resolveExchangeRates(input.userId);
  const fxRatesUsed = fxResolution.rates;
  const defaultsFlags = new Set<string>();
  const buckets: PrefillBucket[] = [];

  if (!planned || planned.length === 0) {
    return { buckets: [], fxRatesUsed, defaultsFlags };
  }

  const needsWalletLookup =
    fxResolution.source !== "users" && fxResolution.source !== "wallets";
  const walletCurrencies = needsWalletLookup
    ? await loadUserWalletCurrencies(input.userId)
    : new Set<string>();

  for (let i = 0; i < planned.length; i++) {
    const pt = planned[i];
    const network = pt.site ?? "Unknown";
    const currency = pt.currency ?? "USD";
    const baseCount = Number(pt.count ?? 1) || 1;
    const cnt = baseCount * (input.multiplier ?? 1);

    const template = pt.template ?? null;
    const sample = pt.tournamentSample ?? null;

    let buyinOriginal: number;
    let buyinUsd: number;
    let playersAvg: number;
    let placesPaid: number;
    let rakePct: number;
    let roiPct: number;

    // Priority 1: template -------------------------------------------------
    if (
      template &&
      Number.isFinite(Number(template.avgBuyIn)) &&
      Number(template.avgBuyIn) > 0
    ) {
      buyinOriginal =
        pt.buyIn !== undefined && pt.buyIn !== null
          ? Number(pt.buyIn)
          : Number(template.avgBuyIn);
      buyinUsd = nativeToUsd(buyinOriginal, currency, fxRatesUsed);
      // template.avgBuyIn ja esta em moeda nativa do torneio (mesma moeda do template)
      // Se nenhum buyIn no plan, usar template.avgBuyIn como buyinUsd direto
      if (
        currency === "USD" &&
        (pt.buyIn === undefined || pt.buyIn === null)
      ) {
        buyinUsd = Number(template.avgBuyIn);
        buyinOriginal = Number(template.avgBuyIn);
      }

      const tplPlayers = Number(template.avgFieldSize ?? 0);
      if (Number.isFinite(tplPlayers) && tplPlayers >= 10) {
        playersAvg = Math.round(tplPlayers);
      } else {
        playersAvg = DEFAULT_PLAYERS_AVG;
        defaultsFlags.add(`${i}:playersAvg`);
      }
      placesPaid = Math.max(1, Math.round(playersAvg * 0.15));

      const tplRoi = Number(template.avgRoi ?? NaN);
      if (Number.isFinite(tplRoi)) {
        roiPct = tplRoi;
      } else {
        roiPct = getNetworkRoiDefault(network);
        defaultsFlags.add(`${i}:roiPct`);
      }

      // template nao tem rake_pct -> heuristica
      rakePct = getNetworkRakeDefault(network);
      // Nao marca rakePct como estimado se priority 1 (decisao: marcamos so quando
      // nao ha NENHUMA fonte de rake; templates nao sao fonte primaria de rake).
      // Spec/test priority1 => "NAO marca estimado" para roi/players.
      // Para rake do template, segue NETWORK_DEFAULTS sem flag (consistente com spec).
    }
    // Priority 2: tournament backfill 0014 ---------------------------------
    else if (
      sample &&
      typeof sample === "object" &&
      Number.isFinite(Number(sample.players_avg))
    ) {
      buyinOriginal =
        pt.buyIn !== undefined && pt.buyIn !== null
          ? Number(pt.buyIn)
          : Number(sample.buyIn ?? 0);
      buyinUsd = nativeToUsd(buyinOriginal, currency, fxRatesUsed);
      if (
        currency === "USD" &&
        (pt.buyIn === undefined || pt.buyIn === null)
      ) {
        buyinUsd = Number(sample.buyIn ?? 0);
        buyinOriginal = Number(sample.buyIn ?? 0);
      }

      const sPlayers = Number(sample.players_avg);
      playersAvg =
        Number.isFinite(sPlayers) && sPlayers >= 10
          ? Math.round(sPlayers)
          : DEFAULT_PLAYERS_AVG;
      const sPlaces = Number(sample.places_paid_avg);
      placesPaid =
        Number.isFinite(sPlaces) && sPlaces >= 1
          ? Math.round(sPlaces)
          : Math.max(1, Math.round(playersAvg * 0.15));
      const sRake = Number(sample.rake_pct);
      rakePct = Number.isFinite(sRake)
        ? sRake
        : getNetworkRakeDefault(network);

      // ROI vem de NETWORK_DEFAULTS_ROI (sem fonte propria) -> MARCAR estimado
      roiPct = getNetworkRoiDefault(network);
      defaultsFlags.add(`${i}:roiPct`);
    }
    // Priority 3: NETWORK_DEFAULTS only ------------------------------------
    else {
      buyinOriginal = Number(pt.buyIn ?? 0);
      buyinUsd = nativeToUsd(buyinOriginal, currency, fxRatesUsed);

      playersAvg = DEFAULT_PLAYERS_AVG;
      placesPaid = DEFAULT_PLACES_PAID;
      rakePct = getNetworkRakeDefault(network);
      roiPct = getNetworkRoiDefault(network);
      defaultsFlags.add(`${i}:playersAvg`);
      defaultsFlags.add(`${i}:placesPaid`);
      defaultsFlags.add(`${i}:rakePct`);
      defaultsFlags.add(`${i}:roiPct`);
    }

    // walletMissing: BRL/EUR/CNY etc sem wallet correspondente, sem rate user
    const walletMissing =
      currency !== "USD" &&
      needsWalletLookup &&
      !walletCurrencies.has(currency);

    buckets.push({
      name: pt.name ?? `${network} ${currency} ${buyinOriginal}`,
      network,
      count: cnt,
      buyinUsd: Number(buyinUsd.toFixed(4)),
      buyinOriginal,
      currency,
      playersAvg,
      placesPaid,
      rakePct,
      roiPct,
      walletMissing: walletMissing || undefined,
    });
  }

  return { buckets, fxRatesUsed, defaultsFlags };
}
