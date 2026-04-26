/**
 * bankrollHelpers — Utilitarios de formatacao e calculo
 */

export function formatUSD(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatBRL(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const REASON_LABEL_MAP: Record<string, string> = {
  initial: "Inicial",
  deposit: "Aporte",
  withdrawal: "Saque",
  session_result: "Sessao",
  rakeback: "Rakeback",
  manual_adjustment: "Ajuste manual",
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL_MAP[reason] ?? reason;
}

// Sprint Bankroll-3 (RF-06, RF-07): cor distinta para rakeback (amber/dourado).
// Mapping centralizado para evitar acoplar componentes a Tailwind classes.
const REASON_COLOR_MAP: Record<string, string> = {
  initial: "text-slate-700 bg-slate-50 border-slate-200",
  deposit: "text-green-700 bg-green-50 border-green-200",
  withdrawal: "text-red-700 bg-red-50 border-red-200",
  session_result: "text-blue-700 bg-blue-50 border-blue-200",
  rakeback: "text-amber-800 bg-amber-50 border-amber-300",
  manual_adjustment: "text-slate-700 bg-slate-50 border-slate-200",
};

export function reasonColor(reason: string): string {
  return REASON_COLOR_MAP[reason] ?? "text-slate-700 bg-slate-50 border-slate-200";
}

// Sprint Session-End Reconciliation (RF-09, HIGH-2): label PT-BR para a coluna
// `wallet_transactions.source` / `bankroll_snapshots.source`.
//   'manual'        -> "Manual"           (default; tambem null/undefined)
//   'auto_session'  -> "Reconciliacao automatica"
//   demais valores  -> "Automatica"       (fallback generico)
const SOURCE_LABEL_MAP: Record<string, string> = {
  manual: "Manual",
  auto_session: "Reconciliacao automatica",
};

export function transactionSourceLabel(
  source: string | null | undefined,
): string {
  if (source == null) return "Manual";
  if (source in SOURCE_LABEL_MAP) return SOURCE_LABEL_MAP[source];
  return "Automatica";
}

export function computeBankrollDropPct(start: number, current: number): number {
  if (start <= 0) return 0;
  return ((start - current) / start) * 100;
}
