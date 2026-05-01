/**
 * Sprint Bankroll-Reports-Detail — DRY helpers compartilhados.
 *
 * Centraliza formato signed `+$X.XX`/`-$X.XX` e classifier de sign usados por:
 *   - components/bankroll/BankrollDetailModal.tsx
 *   - components/grind-session/SessionHistoryUnified.tsx
 *   - components/grind-session/GrindProfitHeader.tsx
 *
 * NAO substitui `lib/format.ts#formatCurrency` (Intl-based, locale pt-BR
 * "US$ 1.180,00") — esses componentes usam formato monoespacado simples
 * para colunas de delta. Vocabulario "positive|negative|zero" alinhado com
 * `lib/walletBalanceDelta.ts#BalanceDelta.sign`.
 */
export type DeltaSign = "positive" | "negative" | "zero";

/** Formato signed: 0 -> "+$0.00", 12.5 -> "+$12.50", -3 -> "-$3.00". */
export function formatUsdSigned(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Classifier ternario usado em data-sign + classe de cor. */
export function signOf(n: number): DeltaSign {
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "zero";
}
