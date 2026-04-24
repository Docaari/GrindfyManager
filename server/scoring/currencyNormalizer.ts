/**
 * Tournament Selector — Currency Normalizer (Q2)
 *
 * Normaliza buy-in de qualquer moeda para USD usando user_settings.exchange_rates
 * (jsonb). Quando a chave nao existe, usa DEFAULT_EXCHANGE_RATES.
 *
 *   normalizeBuyInToUSD(amount, currency, exchangeRates) -> number (USD)
 *   normalizeBucketRange(amountUSD)                      -> string (bucket)
 */

import { BUYIN_BUCKETS, DEFAULT_EXCHANGE_RATES } from "./scoringConstants";

export function normalizeBuyInToUSD(
  amount: number,
  currency: string | null | undefined,
  exchangeRates: Record<string, number> | null | undefined,
): number {
  // Currency vazia/null/undefined -> trata como USD (no-op)
  if (!currency || currency === "USD") {
    return amount;
  }

  const rates = exchangeRates ?? {};
  const userRate = rates[currency];

  if (typeof userRate === "number") {
    return amount * userRate;
  }

  // Fallback para DEFAULT_EXCHANGE_RATES
  const defaultRate = DEFAULT_EXCHANGE_RATES[currency];
  if (typeof defaultRate === "number") {
    return amount * defaultRate;
  }

  // Moeda completamente desconhecida — retorna 0 (deterministico, nao crash)
  return 0;
}

export function normalizeBucketRange(amountUSD: number): string | null {
  if (amountUSD == null || Number.isNaN(amountUSD)) return null;
  for (const b of BUYIN_BUCKETS) {
    if (amountUSD >= b.min && amountUSD < b.max) {
      return b.range;
    }
  }
  // Catch-all (deveria ser coberto pelo ultimo bucket com max=Infinity)
  return BUYIN_BUCKETS[BUYIN_BUCKETS.length - 1].range;
}

/**
 * Helper: dado um campo numero (em qualquer formato — string ou number)
 * + currency + exchangeRates, devolve o bucket BUYIN_BUCKETS apos normalizar.
 */
export function bucketizeBuyIn(
  amount: number | string,
  currency: string | null | undefined,
  exchangeRates: Record<string, number> | null | undefined,
): { usd: number; bucket: string } {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const usd = normalizeBuyInToUSD(num, currency, exchangeRates);
  const bucket = normalizeBucketRange(usd) ?? BUYIN_BUCKETS[0].range;
  return { usd, bucket };
}
