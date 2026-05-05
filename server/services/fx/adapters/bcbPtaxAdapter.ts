/**
 * Sprint FX-1 RF-02: bcbPtaxAdapter.
 *
 * Banco Central do Brasil PTAX OData API:
 *   https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
 *
 * Boletim "Fechamento" sai aproximadamente 13:00 America/Sao_Paulo.
 * Usa cotacaoVenda (mais conservador para conversao USD->BRL).
 *
 * Weekend response = { value: [] } -> throws FxFetchError code WEEKEND_NO_QUOTE.
 */

import { FxFetchError } from "../errors";
import type { FxRow } from "./types";

const BASE_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
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
      provider: "bcb_ptax",
      message: `bcb_ptax network error: ${err?.message ?? err}`,
      cause: err,
    });
  }
  if (!res.ok) {
    throw new FxFetchError({
      code: "HTTP_ERROR",
      provider: "bcb_ptax",
      message: `bcb_ptax HTTP ${res.status}`,
    });
  }
  return await res.json();
}

function parseDataHora(dataHora: string): string {
  // BCB returns "2026-05-05 13:00:00.000" → ISO date "2026-05-05"
  if (typeof dataHora !== "string") return "";
  return dataHora.slice(0, 10);
}

function formatBcbDate(d: Date): string {
  // BCB OData espera MM-DD-YYYY (americano).
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

/**
 * Fetch latest BRL rate from BCB PTAX (boletim Fechamento).
 * Tenta hoje e, se vazio (weekend), throws WEEKEND_NO_QUOTE.
 */
export async function fetchLatestBrl(): Promise<FxRow> {
  const today = new Date();
  const dataCotacao = formatBcbDate(today);
  const url =
    `${BASE_URL}/CotacaoDolarDia(dataCotacao=@dataCotacao)` +
    `?@dataCotacao='${dataCotacao}'&$top=1&$format=json`;

  const body = await doFetch(url);

  if (!body || typeof body !== "object" || !Array.isArray(body.value)) {
    throw new FxFetchError({
      code: "INVALID_BODY",
      provider: "bcb_ptax",
      message: "bcb_ptax response missing value[]",
    });
  }

  if (body.value.length === 0) {
    throw new FxFetchError({
      code: "WEEKEND_NO_QUOTE",
      provider: "bcb_ptax",
      message: "bcb_ptax has no quote for date (weekend or holiday)",
    });
  }

  const row = body.value[0];
  const venda = Number(row?.cotacaoVenda);
  if (!Number.isFinite(venda) || venda <= 0) {
    throw new FxFetchError({
      code: "INVALID_BODY",
      provider: "bcb_ptax",
      message: "bcb_ptax cotacaoVenda not numeric",
    });
  }
  const date = parseDataHora(row?.dataHoraCotacao ?? "");

  return {
    currency: "BRL",
    date,
    ratePerUsd: venda,
    source: "bcb_ptax",
  };
}

/**
 * Fetch timeseries BRL para range. Range vazio = array vazio (nao throws).
 * Weekends sao naturalmente omitidos pelo BCB.
 */
export async function fetchTimeseriesBrl(
  from: string,
  to: string,
): Promise<FxRow[]> {
  // Convert ISO from/to (YYYY-MM-DD) to MM-DD-YYYY for BCB OData
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const dataInicial = formatBcbDate(fromDate);
  const dataFinalCotacao = formatBcbDate(toDate);
  const url =
    `${BASE_URL}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${dataInicial}'&@dataFinalCotacao='${dataFinalCotacao}'&$format=json`;

  const body = await doFetch(url);

  if (!body || typeof body !== "object" || !Array.isArray(body.value)) {
    throw new FxFetchError({
      code: "INVALID_BODY",
      provider: "bcb_ptax",
      message: "bcb_ptax timeseries missing value[]",
    });
  }

  const out: FxRow[] = [];
  for (const row of body.value) {
    const venda = Number(row?.cotacaoVenda);
    if (!Number.isFinite(venda) || venda <= 0) continue;
    const date = parseDataHora(row?.dataHoraCotacao ?? "");
    if (!date) continue;
    out.push({
      currency: "BRL",
      date,
      ratePerUsd: venda,
      source: "bcb_ptax",
    });
  }
  return out;
}

export const bcbPtaxAdapter = {
  fetchLatestBrl,
  fetchTimeseriesBrl,
};
