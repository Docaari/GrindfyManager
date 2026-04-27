/**
 * formatCurrency — RF-14 + P12 (helper consistente para toda UI).
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *
 * Saidas esperadas (locale='pt-BR'):
 *   USD -> "US$ 1.180,00"
 *   BRL -> "R$ 1.180,00"
 *   EUR -> "€ 1.180,00"
 *   CNY -> "¥ 1.180,00"
 *
 * Implementacao usa Intl.NumberFormat para garantir locale + simbolo + separadores.
 * Para currencies onde simbolo difere do default Intl (CNY costuma vir como CN¥),
 * normaliza para o simbolo internacional esperado (¥, US$).
 */

export type SupportedCurrency = "USD" | "BRL" | "EUR" | "CNY" | string;

// Intl.NumberFormat eh caro de instantiar (5-10x maior que .format()). Cache
// por (locale, currency) — reutilizado durante render de N wallets x M campos
// no WalletReconciliationDialog (~20 calls/render sem cache, 4 com cache).
//
// MEDIUM-02 reviewer: cap de tamanho previne unbounded growth se algum caller
// passar currency invalido/raw. 32 entries cobre todos casos reais (4 currencies x
// poucos locales).
const FORMATTER_CACHE_MAX = 32;
const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string): Intl.NumberFormat | null {
  const key = `${locale}|${currency}`;
  const cached = FORMATTER_CACHE.get(key);
  if (cached) return cached;
  try {
    const fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      currencyDisplay: "symbol",
    });
    if (FORMATTER_CACHE.size >= FORMATTER_CACHE_MAX) {
      FORMATTER_CACHE.clear();
    }
    FORMATTER_CACHE.set(key, fmt);
    return fmt;
  } catch {
    return null;
  }
}

/** Test-only — limpa o cache entre runs/jest jsdom multiproject. */
export function __resetFormatterCacheForTest(): void {
  FORMATTER_CACHE.clear();
}

/**
 * formatCurrency — formata um numero como moeda em pt-BR (default).
 *
 * @param amount   Valor numerico. Negativo recebe sinal '-' explicito.
 * @param currency Codigo ISO 4217. Defaults: USD, BRL, EUR, CNY suportados.
 * @param locale   Locale BCP47 (default 'pt-BR').
 * @returns String formatada. Ex: "US$ 1.180,00", "R$ 1.180,50", "€ 1.180,00".
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency = "USD",
  locale: string = "pt-BR",
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const fmt = getFormatter(locale, currency);
  if (!fmt) {
    return safe.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  let raw = fmt.format(safe);

  // Normalizacoes especificas para garantir simbolo internacional consistente.
  // Browser pt-BR retorna "US$" para USD, "R$" para BRL, "€" para EUR.
  // Para CNY pt-BR retorna "CN¥" — preferimos "¥" para consistencia visual.
  if (currency === "CNY") {
    raw = raw.replace(/CN¥|CNY/g, "¥");
  }

  return raw;
}

export default formatCurrency;
