// FX CONVENTION: rates[ccy] = ccy units per 1 USD. See ADR-033.
/**
 * Tournament Selector — Currency Normalizer (Q2)
 *
 * Normaliza buy-in de qualquer moeda para USD usando user_settings.exchange_rates
 * (jsonb). Quando a chave nao existe, usa DEFAULT_EXCHANGE_RATES.
 *
 * Convencao oficial (ADR-033):
 *   exchangeRates[ccy] = N -> "1 USD vale N unidades de ccy".
 *   native -> USD:  usd = native / rate
 *   USD -> native:  native = usd * rate
 *
 *   normalizeBuyInToUSD(amount, currency, exchangeRates) -> number (USD)
 *   normalizeBucketRange(amountUSD)                      -> string (bucket)
 */

import { BUYIN_BUCKETS, DEFAULT_EXCHANGE_RATES } from "./scoringConstants";

function isValidRate(rate: unknown): rate is number {
  return (
    typeof rate === "number" &&
    Number.isFinite(rate) &&
    rate > 0
  );
}

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
  const userRateRaw = rates[currency];
  const userRateProvided = userRateRaw !== undefined;

  // Quando o usuario explicitamente fornece um rate invalido (0, NaN, Infinity,
  // negativo, string), NAO cair no fallback do DEFAULT — retorna 0 deterministico.
  // Isso evita que um rate corrompido seja silenciosamente substituido.
  if (userRateProvided) {
    if (isValidRate(userRateRaw)) {
      // ADR-033: native -> USD = native / rate
      return amount / userRateRaw;
    }
    return 0;
  }

  // Fallback para DEFAULT_EXCHANGE_RATES (apenas quando user NAO forneceu)
  const defaultRate = DEFAULT_EXCHANGE_RATES[currency];
  if (isValidRate(defaultRate)) {
    return amount / defaultRate;
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
