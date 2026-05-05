/**
 * Sprint FX-1 RF-02: frankfurterAdapter.
 *
 * API publica gratuita ECB rates: https://api.frankfurter.dev/v1/
 * Latest:    /v1/latest?base=USD&symbols=BRL,EUR
 * Timeseries:/v1/{from}..{to}?base=USD&symbols=BRL,EUR
 *
 * Throws FxFetchError em failure (HTTP, network, body invalido).
 */

import { FxFetchError } from "../errors";
import type { FxRow } from "./types";

const BASE_URL = "https://api.frankfurter.dev/v1";
const USER_AGENT = "GrindfyFxBot/1.0 (+https://grindfy.com)";
const FETCH_TIMEOUT_MS = 30_000;

function buildHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
}

async function doFetch(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    } as any);
  } catch (err: any) {
    throw new FxFetchError({
      code: "NETWORK_ERROR",
      provider: "frankfurter",
      message: `frankfurter network error: ${err?.message ?? err}`,
      cause: err,
    });
  }
  if (!res.ok) {
    throw new FxFetchError({
      code: "HTTP_ERROR",
      provider: "frankfurter",
      message: `frankfurter HTTP ${res.status}`,
    });
  }
  return await res.json();
}

/**
 * Fetch latest rates from frankfurter for symbols (base=USD).
 * Retorna array vazio se rates eh objeto vazio (sem throw).
 */
export async function fetchLatest(symbols: string[]): Promise<FxRow[]> {
  const symParam = symbols.join(",");
  const url = `${BASE_URL}/latest?base=USD&symbols=${encodeURIComponent(symParam)}`;
  const body = await doFetch(url);

  if (!body || typeof body !== "object" || !("rates" in body)) {
    throw new FxFetchError({
      code: "INVALID_BODY",
      provider: "frankfurter",
      message: "frankfurter response missing rates",
    });
  }

  const date: string = String(body.date ?? "");
  const rates = (body.rates ?? {}) as Record<string, number>;
  const out: FxRow[] = [];
  for (const [ccy, rate] of Object.entries(rates)) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({
      currency: ccy,
      date,
      ratePerUsd: rate,
      source: "frankfurter",
    });
  }
  return out;
}

/**
 * Fetch timeseries from frankfurter for date range.
 * Retorna FxRow[] agregando todos os daily rates × symbols.
 * Weekends sao naturalmente omitidos pelo provider (ECB nao publica).
 */
export async function fetchTimeseries(
  from: string,
  to: string,
  symbols: string[],
): Promise<FxRow[]> {
  const symParam = symbols.join(",");
  const url = `${BASE_URL}/${from}..${to}?base=USD&symbols=${encodeURIComponent(symParam)}`;
  const body = await doFetch(url);

  if (!body || typeof body !== "object" || !("rates" in body)) {
    throw new FxFetchError({
      code: "INVALID_BODY",
      provider: "frankfurter",
      message: "frankfurter timeseries missing rates",
    });
  }

  const datesMap = (body.rates ?? {}) as Record<string, Record<string, number>>;
  const out: FxRow[] = [];
  for (const [date, byCcy] of Object.entries(datesMap)) {
    if (!byCcy || typeof byCcy !== "object") continue;
    for (const [ccy, rate] of Object.entries(byCcy)) {
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
      out.push({
        currency: ccy,
        date,
        ratePerUsd: rate,
        source: "frankfurter",
      });
    }
  }
  return out;
}

export const frankfurterAdapter = {
  fetchLatest,
  fetchTimeseries,
};
