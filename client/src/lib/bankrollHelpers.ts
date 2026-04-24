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

export function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    initial: "Inicial",
    deposit: "Aporte",
    withdrawal: "Saque",
    session_result: "Sessao",
    manual_adjustment: "Ajuste manual",
  };
  return map[reason] ?? reason;
}

export function computeBankrollDropPct(start: number, current: number): number {
  if (start <= 0) return 0;
  return ((start - current) / start) * 100;
}
