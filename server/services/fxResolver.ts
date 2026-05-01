/**
 * fxResolver — Sprint Bankroll-3 RF-11
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-11, D9)
 * ADR-061: fxResolver unified service
 *
 * Convencao QW-1 (ADR-033):
 *   rates[ccy] = unidades de ccy por 1 USD
 *   USD = 1, BRL = 5.0, EUR = 0.93, USDT = 1.0
 *
 * Cascata de resolucao:
 *   1. users.exchangeRates (fonte principal)
 *   2. wallets[*].exchangeRates merge (preenche o que user nao tem)
 *   3. constants FALLBACK_FX_RATES
 *
 * Cache em memoria 5min por userId. Invalidate explicito no PUT /user-settings.
 */

import { storage } from "../storage";

export interface FxRates {
  /** Map de currency code para taxa (unidades de currency por 1 USD). USD = 1. */
  rates: Record<string, number>;
  /** Origem dos rates: 'user' | 'wallets' | 'fallback'. */
  source: "user" | "wallets" | "fallback";
  /** Timestamp da resolucao (cache hint). */
  resolvedAt: Date;
}

export const FALLBACK_FX_RATES: Readonly<Record<string, number>> = Object.freeze({
  USD: 1,
  BRL: 5.0,
  EUR: 0.93,
  CNY: 7.2,
  USDT: 1.0,
  GBP: 0.79,
  BTC: 0.000016,
});

interface CacheEntry {
  rates: Record<string, number>;
  source: "user" | "wallets" | "fallback";
  resolvedAt: Date;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
// Expose cache via globalThis so tests/setup.ts can clear without import().
// The setup file uses CommonJS require which fails on .ts files referencing
// other .ts modules (Directory import unsupported). globalThis is a stable
// no-import escape hatch.
const _g = globalThis as any;
if (!_g.__fxResolverCache) {
  _g.__fxResolverCache = new Map<string, CacheEntry>();
}
const cache: Map<string, CacheEntry> = _g.__fxResolverCache;

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
 * Resolve FxRates para um userId.
 * Cascata: user → wallets → fallback. Cache 5min.
 * userId vazio retorna fallback puro.
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
  let userHasRates = false;
  let walletsHaveRates = false;

  try {
    const settings = await storage.getUserSettings(userId);
    userRates = sanitizeRates((settings as any)?.exchangeRates);
    userHasRates = Object.keys(userRates).length > 0;
  } catch (err) {
    // log + continue with empty user rates
    console.warn("[fxResolver] getUserSettings failed:", (err as any)?.message);
  }

  try {
    const wallets = await storage.listWalletsByUser(userId, { includeArchived: true });
    for (const w of wallets) {
      const wRates = sanitizeRates((w as any).exchangeRates);
      for (const [k, v] of Object.entries(wRates)) {
        // user rates have precedence; wallet fills missing currencies
        if (!(k in userRates) && !(k in walletRates)) {
          walletRates[k] = v;
        }
      }
    }
    walletsHaveRates = Object.keys(walletRates).length > 0;
  } catch (err) {
    console.warn("[fxResolver] listWalletsByUser failed:", (err as any)?.message);
  }

  // Determine source priority
  let source: "user" | "wallets" | "fallback";
  if (userHasRates) source = "user";
  else if (walletsHaveRates) source = "wallets";
  else source = "fallback";

  const merged: Record<string, number> = {
    ...FALLBACK_FX_RATES,
    ...walletRates,
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
 * USD: usd = native / rate.
 */
export function convertToUSD(
  amount: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "USD") return amount;
  const rate =
    rates[currency] ?? FALLBACK_FX_RATES[currency] ?? 1;
  if (!isPositiveNumber(rate)) return amount;
  return amount / rate;
}

/**
 * Converte amount em USD para currency target.
 * USD: native = usd * rate.
 */
export function convertFromUSD(
  amountUsd: number,
  targetCurrency: string,
  rates: Record<string, number>,
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  if (targetCurrency === "USD") return amountUsd;
  const rate =
    rates[targetCurrency] ?? FALLBACK_FX_RATES[targetCurrency] ?? 1;
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
