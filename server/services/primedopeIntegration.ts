// =============================================================================
// Sprint VR-1 — primedopeIntegration.ts (RF-05: dead code removed)
//
// Kept: resolveExchangeRates, nativeToUsd, computeInputHash, buildHashableInput
// Dead code removed per RF-05 (ADR-211).
//
// ADR-211: Engine nativo substitui fetch externo. Helpers FX e hash permanecem.
// ADR-033: FX cascata users.exchangeRates > wallets.exchangeRates > constantes.
// =============================================================================

import crypto from "crypto";
import { storage } from "../storage";
import {
  FX_FALLBACK_CONSTANTS,
} from "../../shared/primedopeDefaults";

// ---------------------------------------------------------------------------
// FX cascade: users.exchangeRates > wallets[active] > FX_FALLBACK_CONSTANTS
// ---------------------------------------------------------------------------

export async function resolveExchangeRates(
  userId: string,
): Promise<Record<string, number>> {
  // 1. user-level
  let userSettings: any = null;
  try {
    userSettings = await (storage as any).getUserSettings(userId);
  } catch {
    userSettings = null;
  }
  const userRates = userSettings?.exchangeRates;
  if (userRates && typeof userRates === "object") {
    const keys = Object.keys(userRates);
    if (keys.length > 0) {
      return { ...FX_FALLBACK_CONSTANTS, ...userRates };
    }
  }

  // 2. wallets-level
  let wallets: any[] = [];
  try {
    wallets = (await (storage as any).listWalletsByUser(userId)) ?? [];
  } catch {
    wallets = [];
  }
  for (const w of wallets) {
    if (!w) continue;
    const wRates = w.exchangeRates;
    if (wRates && typeof wRates === "object" && Object.keys(wRates).length > 0) {
      return { ...FX_FALLBACK_CONSTANTS, ...wRates };
    }
  }

  // 3. fallback constante
  return { ...FX_FALLBACK_CONSTANTS };
}

export function nativeToUsd(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (!currency || currency === "USD") return amount;
  const rate = rates[currency];
  if (typeof rate === "number" && rate > 0) {
    // ADR-033: usd = native / rate
    return amount / rate;
  }
  // Sem rate confiavel — retorna 0 (deterministico, nao crash)
  return 0;
}

// ---------------------------------------------------------------------------
// Hash determinista do input (sha256 hex)
// ---------------------------------------------------------------------------

export function computeInputHash(payload: any): string {
  const json = JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function buildHashableInput(
  input: any,
  bucketsOrGroups: any,
  fxRatesUsed: Record<string, number>,
): any {
  // Support both old (SimulationInput with buckets) and new (VarianceSimulationInput with groups) formats
  if (bucketsOrGroups?.groups) {
    return {
      userId: input.userId ?? input,
      groups: bucketsOrGroups.groups,
      weeks: bucketsOrGroups.weeks,
      simulations: bucketsOrGroups.simulations,
      seed: bucketsOrGroups.seed,
    };
  }
  // Legacy format
  return {
    profileLetter: input.profileLetter,
    dayOfWeek: input.dayOfWeek,
    multiplier: input.multiplier,
    bankrollUsd: input.bankrollUsd,
    buckets: Array.isArray(bucketsOrGroups)
      ? bucketsOrGroups.map((b: any) => ({
          name: b.name,
          network: b.network,
          count: b.count,
          currency: b.currency,
          buyinOriginal: b.buyinOriginal,
          buyinUsd: b.buyinUsd,
          playersAvg: b.playersAvg,
          placesPaid: b.placesPaid,
          rakePct: b.rakePct,
          roiPct: b.roiPct,
        }))
      : [],
    fxRatesUsed,
  };
}
