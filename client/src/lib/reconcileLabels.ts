/**
 * reconcileLabels — Sprint Session-End Reconciliation (RF-03, RF-11)
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *
 * Helpers PT-BR para o WalletReconciliationDialog:
 *  - formatDelta(delta, nativeCurrency) -> { sign, text, tone }
 *  - reconcileErrorMessage(code, walletName?) -> string PT-BR
 */

export type DeltaTone = "positive" | "negative" | "neutral";

export interface DeltaLabel {
  sign: "+" | "-" | "";
  text: string;
  tone: DeltaTone;
}

const EPSILON = 0.01;

function currencyPrefix(ccy: string): string {
  switch (ccy) {
    case "USD":
      return "$";
    case "BRL":
      return "R$";
    case "EUR":
      return "EUR ";
    case "GBP":
      return "£";
    case "CNY":
      return "CNY ";
    default:
      return ccy + " ";
  }
}

function formatNumberPtBr(n: number): string {
  // PT-BR: separador decimal virgula, 2 casas
  return Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDelta(delta: number, nativeCurrency: string): DeltaLabel {
  const prefix = currencyPrefix(nativeCurrency);
  const absDelta = Math.abs(delta);

  if (!Number.isFinite(delta) || absDelta < EPSILON) {
    return {
      sign: "",
      text: `${prefix} ${formatNumberPtBr(0)}`,
      tone: "neutral",
    };
  }

  if (delta > 0) {
    return {
      sign: "+",
      text: `+ ${prefix} ${formatNumberPtBr(delta)}`,
      tone: "positive",
    };
  }

  // delta < 0
  return {
    sign: "-",
    text: `- ${prefix} ${formatNumberPtBr(delta)}`,
    tone: "negative",
  };
}

export function reconcileErrorMessage(code: string, walletName?: string): string {
  const wn = walletName ? ` "${walletName}"` : "";
  switch (code) {
    case "balance_mismatch":
      return walletName
        ? `O saldo da carteira ${walletName} mudou em outra aba. Atualizando a lista...`
        : "O saldo da carteira mudou em outra aba. Atualizando a lista...";
    case "wallet_archived":
      return `Carteira${wn} foi arquivada. Removendo da lista.`;
    case "already_reconciled":
      return "Esta sessao ja foi reconciliada anteriormente.";
    case "duplicate_wallet":
      return "Mesma carteira aparece duas vezes na lista de ajustes.";
    case "missing_expected_balance":
      return "Saldo esperado anterior ausente. Recarregue a lista.";
    case "invalid_reported_balance":
      return walletName
        ? `Saldo reportado invalido para a carteira ${walletName}.`
        : "Saldo reportado invalido.";
    case "empty_adjustments":
      return "Nenhum ajuste informado.";
    default:
      return walletName
        ? `Falha ao reconciliar carteira ${walletName}. Tente novamente.`
        : "Falha ao reconciliar. Tente novamente.";
  }
}
