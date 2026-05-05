/**
 * fxResolver — Sprint Bankroll-3 RF-11 + Sprint FX-1 RF-05 (cascata estendida).
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-11, D9), Docs/specs/sprint-fx-1.md (RF-05).
 * ADR-061: fxResolver unified service
 * ADR-121: system_fx_rates global (FX-1).
 *
 * Convencao QW-1 (ADR-033):
 *   rates[ccy] = unidades de ccy por 1 USD
 *   USD = 1, BRL = 5.0, EUR = 0.93
 *
 * Cascata de resolucao (FX-1):
 *   1. users.exchangeRates (override per-user)
 *   2. system_fx_rates (latest, via fxRatesPersistence) — NOVO FX-1
 *   3. wallets.exchangeRates (compat ADR-034) — apenas para currencies que
 *      system nao cobre (CNY, GBP, USDT, BTC).
 *   4. constants FALLBACK_FX_RATES (USD/BRL/EUR apenas pos-FX-1)
 *
 * source: 'user' | 'system' | 'wallets' | 'fallback' | 'mixed'.
 *   - 'mixed' quando user override parcial + system completa.
 *
 * Cache em memoria 5min por userId. Invalidate explicito no PUT /user-settings
 * + cron pos-upsert (global).
 */

import { storage } from "../storage";
import { getLatestSystemRates } from "./fx/fxRatesPersistence";

export type FxResolverSource = "user" | "system" | "wallets" | "fallback" | "mixed";

export interface FxRates {
  /** Map de currency code para taxa (unidades de currency por 1 USD). USD = 1. */
  rates: Record<string, number>;
  /** Origem dos rates. */
  source: FxResolverSource;
  /** Timestamp da resolucao (cache hint). */
  resolvedAt: Date;
}

// Sprint FX-1 RF-05 D12: reduzido para USD/BRL/EUR. CNY/GBP/USDT/BTC removidos
// — wallets legadas com essas moedas continuam via cascata compat.
export const FALLBACK_FX_RATES: Readonly<Record<string, number>> = Object.freeze({
  USD: 1,
  BRL: 5.0,
  EUR: 0.93,
});

interface CacheEntry {
  rates: Record<string, number>;
  source: FxResolverSource;
  resolvedAt: Date;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const _g = globalThis as any;
if (!_g.__fxResolverCache) {
  _g.__fxResolverCache = new Map<string, CacheEntry>();
}
const cache: Map<string, CacheEntry> = _g.__fxResolverCache;

export function _resetCacheForTests(): void {
  cache.clear();
}

function isPositiveNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function sanitizeRates(input: any): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof k !== "string" || k.length < 2) continue;
    const num = typeof v === "number" ? v : Number(v);
    if (isPositiveNumber(num)) {
      out[k] = num;
    }
  }
  return out;
}

/**
 * Resolve FxRates para userId. Cascata: user → system → wallets compat → fallback.
 * Cache 5min. userId vazio retorna fallback puro.
 */
export async function resolveExchangeRates(userId: string): Promise<FxRates> {
  if (!userId) {
    return {
      rates: { ...FALLBACK_FX_RATES },
      source: "fallback",
      resolvedAt: new Date(),
    };
  }

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      rates: { ...cached.rates },
      source: cached.source,
      resolvedAt: cached.resolvedAt,
    };
  }

  let userRates: Record<string, number> = {};
  let walletRates: Record<string, number> = {};
  let systemRates: Record<string, number> = {};
  let userHasRates = false;
  let walletsHaveRates = false;
  let systemHasRates = false;

  try {
    const settings = await storage.getUserSettings(userId);
    userRates = sanitizeRates((settings as any)?.exchangeRates);
    userHasRates = Object.keys(userRates).length > 0;
  } catch (err) {
    console.warn("[fxResolver] getUserSettings failed:", (err as any)?.message);
  }

  // FX-1: system rates layer (latest BRL + EUR via fxRatesPersistence).
  try {
    const sysMap = await getLatestSystemRates();
    for (const [ccy, sr] of Object.entries(sysMap)) {
      if (sr && isPositiveNumber(sr.ratePerUsd)) {
        systemRates[ccy] = sr.ratePerUsd;
      }
    }
    systemHasRates = Object.keys(systemRates).length > 0;
  } catch (err) {
    console.warn(
      "[fxResolver] getLatestSystemRates failed:",
      (err as any)?.message,
    );
  }

  try {
    const wallets = await storage.listWalletsByUser(userId, {
      includeArchived: true,
    });
    for (const w of wallets) {
      const wRates = sanitizeRates((w as any).exchangeRates);
      for (const [k, v] of Object.entries(wRates)) {
        // user + system rates have precedence; wallet preenche apenas o que falta.
        if (
          !(k in userRates) &&
          !(k in systemRates) &&
          !(k in walletRates)
        ) {
          walletRates[k] = v;
        }
      }
    }
    walletsHaveRates = Object.keys(walletRates).length > 0;
  } catch (err) {
    console.warn(
      "[fxResolver] listWalletsByUser failed:",
      (err as any)?.message,
    );
  }

  // Determine source priority. 'mixed' quando user override + system populated juntos.
  let source: FxResolverSource;
  if (userHasRates && systemHasRates) source = "mixed";
  else if (userHasRates) source = "user";
  else if (systemHasRates) source = "system";
  else if (walletsHaveRates) source = "wallets";
  else source = "fallback";

  const merged: Record<string, number> = {
    ...FALLBACK_FX_RATES,
    ...walletRates,
    ...systemRates,
    ...userRates,
    USD: 1,
  };

  const resolvedAt = new Date();
  cache.set(userId, {
    rates: merged,
    source,
    resolvedAt,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { rates: { ...merged }, source, resolvedAt };
}

/**
 * Limpa cache para um userId (ou todos se userId omitido).
 */
export function invalidateCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  cache.delete(userId);
}

/**
 * Converte amount em currency para USD.
 */
export function convertToUSD(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "USD") return amount;
  const rate = rates[currency] ?? FALLBACK_FX_RATES[currency] ?? 1;
  if (!isPositiveNumber(rate)) return amount;
  return amount / rate;
}

/**
 * Converte USD para currency target.
 */
export function convertFromUSD(
  amountUsd: number,
  targetCurrency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  if (targetCurrency === "USD") return amountUsd;
  const rate = rates[targetCurrency] ?? FALLBACK_FX_RATES[targetCurrency] ?? 1;
  if (!isPositiveNumber(rate)) return amountUsd;
  return amountUsd * rate;
}

/**
 * Converte entre 2 currencies (passa por USD).
 */
export function convertBetween(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number {
  if (from === to) return amount;
  const usd = convertToUSD(amount, from, rates);
  return convertFromUSD(usd, to, rates);
}

export const fxResolver = {
  resolveExchangeRates,
  invalidateCache,
  convertToUSD,
  convertFromUSD,
  convertBetween,
  FALLBACK_FX_RATES,
};
