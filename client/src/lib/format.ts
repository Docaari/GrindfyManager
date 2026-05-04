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

// =============================================================================
// MEDIUM-11 reviewer: helpers de formatacao reutilizados por
// SessionsMonthCard e DashboardMonthCard (KPIs mes corrente). Centralizamos
// para garantir consistencia visual + eliminar duplicacao.
// =============================================================================

/**
 * fmtUsdShort — USD sem casas decimais com sinal explicito + simbolo $.
 * Exemplo: 1180 -> "+$1.180", -250.5 -> "-$251".
 */
export function fmtUsdShort(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * fmtRoi — percentual com 1 casa, "+" explicito quando positivo, em-dash quando null.
 */
export function fmtRoi(v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/**
 * fmtMonth — converte 'YYYY-MM-DD' OU 'YYYY-MM' em "Maio 2026" (PT-BR).
 * Retorna string vazia para input invalido.
 */
export function fmtMonth(iso: string): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  if (!y || !m) return "";
  const year = Number(y);
  const monthIdx = Number(m) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return "";
  }
  const d = new Date(Date.UTC(year, monthIdx, 1, 12, 0, 0));
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
