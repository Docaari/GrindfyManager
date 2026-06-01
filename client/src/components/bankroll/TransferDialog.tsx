/**
 * TransferDialog — Sprint Bankroll-3 RF-4
 *
 * UI minima para POST /api/wallets/transfers.
 * Nao usa Radix Dialog para evitar dependencia de portal nos tests; renderiza
 * inline quando open=true. Producao pode envelopar em Dialog primitivo.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function toNumberSafe(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function formatBalance(n: number, currency: string): string {
  if (!Number.isFinite(n)) return `0.00 ${currency}`;
  return `${n.toFixed(2)} ${currency}`;
}

export interface TransferDialogWallet {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string | number;
  status?: string;
}

export interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: TransferDialogWallet[];
  defaultFromWalletId?: string;
  defaultToWalletId?: string;
}

export const TransferDialog: React.FC<TransferDialogProps> = ({
  open,
  onOpenChange,
  wallets,
  defaultFromWalletId,
  defaultToWalletId,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // RF-07 (UX-QW-3): chave estavel derivada dos ids — evita exhaustive-deps
  // warning + permite identificar quando o conjunto de wallets muda de verdade
  // (vs apenas a referencia do array re-criada pelo parent a cada render).
  const walletsKey = React.useMemo(
    () => wallets.map((w) => w.id).join("|"),
    [wallets],
  );
  const [fromId, setFromId] = useState(defaultFromWalletId ?? wallets[0]?.id ?? "");
  const [toId, setToId] = useState(
    defaultToWalletId ??
      wallets.find((w) => w.id !== (defaultFromWalletId ?? wallets[0]?.id))?.id ??
      "",
  );
  const [amountFrom, setAmountFrom] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code?: string; message?: string; marketRate?: number; providedRate?: number } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  // Sync defaults quando dialog reabre — caso contrario state inicial persiste
  // entre aberturas (componente fica montado com open=false retornando null).
  // Fix bug 2026-05-15: clicar "Transferir" em wallet X reabria modal com
  // wallet origem antiga selecionada → operador podia debitar wallet errada.
  useEffect(() => {
    if (!open) return;
    const initialFrom = defaultFromWalletId ?? wallets[0]?.id ?? "";
    const initialTo =
      defaultToWalletId ??
      wallets.find((w) => w.id !== initialFrom)?.id ??
      wallets[1]?.id ??
      "";
    setFromId(initialFrom);
    setToId(initialTo);
    setAmountFrom("");
    setFxRate("");
    setError(null);
    setNeedsConfirm(false);
    setSubmitting(false);
    // RF-07 (UX-QW-3): walletsKey = "|"-joined ids. Identity de `wallets` muda
    // toda render no parent, mas a chave so muda quando ids mudam de verdade
    // (add/remove). Permite remover `eslint-disable exhaustive-deps`.
  }, [open, defaultFromWalletId, defaultToWalletId, walletsKey]);

  const fromWallet = useMemo(() => wallets.find((w) => w.id === fromId), [wallets, fromId]);
  const toWallet = useMemo(() => wallets.find((w) => w.id === toId), [wallets, toId]);
  const isCrossCurrency = !!(
    fromWallet && toWallet && fromWallet.nativeCurrency !== toWallet.nativeCurrency
  );

  // Implementer Round UX #5: helpers para preview destino + saldo origem.
  const fromBalanceNum = fromWallet ? toNumberSafe(fromWallet.balance) : 0;
  const amountFromNum = toNumberSafe(amountFrom);
  const fxRateNum = toNumberSafe(fxRate);
  const exceedsBalance =
    amountFromNum > 0 && fromBalanceNum > 0 && amountFromNum > fromBalanceNum;
  const previewDestination = (() => {
    if (!fromWallet || !toWallet) return null;
    if (amountFromNum <= 0) return null;
    if (isCrossCurrency) {
      if (fxRateNum <= 0) return null;
      return amountFromNum * fxRateNum;
    }
    return amountFromNum;
  })();

  if (!open) return null;

  function handleMaxClick() {
    if (!fromWallet) return;
    const balance = toNumberSafe(fromWallet.balance);
    if (balance > 0) setAmountFrom(String(balance));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const body: any = {
        fromWalletId: fromId,
        toWalletId: toId,
        amountFrom: parseFloat(amountFrom),
        reason: "transfer",
      };
      if (isCrossCurrency && fxRate) body.fxRate = parseFloat(fxRate);
      if (needsConfirm) body.confirmFxDiff = true;

      const url = needsConfirm
        ? "/api/wallets/transfers?confirmFxDiff=true"
        : "/api/wallets/transfers";
      // Note: needsConfirm both passes ?confirmFxDiff=true (server query gate) and
      // body.confirmFxDiff=true (route flag) to satisfy both Sprint Bankroll-3 codepaths.
      await apiRequest("POST", url, body);
      // Bankroll-Launch-Fix P1 #5: invalida queries de bankroll/wallets/transfers
      // apos sucesso. Sem isso, BankrollWidget + listas de wallets continuam
      // mostrando saldos antigos ate o user navegar manualmente / TanStack
      // refetch background. Inclui queries por wallet (from/to) para detalhe.
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallets/transfers"] });
        if (fromId) {
          queryClient.invalidateQueries({ queryKey: ["/api/wallets", fromId] });
        }
        if (toId) {
          queryClient.invalidateQueries({ queryKey: ["/api/wallets", toId] });
        }
      } catch {
        // QueryClient ausente em testes que nao envelopam Provider — silencia.
      }
      toast({ title: "Transferencia criada", description: "A movimentacao foi registrada." });
      onOpenChange(false);
    } catch (err: any) {
      const code = err?.response?.data?.code ?? err?.body?.code ?? err?.code;
      if (code === "FX_DIFF_HIGH") {
        setError({
          code: "FX_DIFF_HIGH",
          providedRate: err?.response?.data?.providedRate ?? err?.body?.providedRate,
          marketRate: err?.response?.data?.marketRate ?? err?.body?.marketRate,
          message: err?.message,
        });
        setNeedsConfirm(true);
      } else if (code === "INSUFFICIENT_BALANCE") {
        setError({ code: "INSUFFICIENT_BALANCE", message: "Saldo insuficiente para esta transferencia." });
        toast({ title: "Saldo insuficiente", description: "Reduza o valor ou recarregue a wallet.", variant: "destructive" as any });
      } else {
        setError({ message: err?.message ?? "Erro ao transferir" });
        toast({ title: "Erro", description: err?.message ?? "Falha", variant: "destructive" as any });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="transfer-dialog" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-zinc-900 text-white rounded-lg p-6 w-full max-w-md flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Transferir entre wallets</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm">De</span>
          <select
            data-testid="transfer-from-select"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="bg-zinc-800 rounded px-2 py-1"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.nativeCurrency}) — {formatBalance(toNumberSafe(w.balance), w.nativeCurrency)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Para</span>
          <select
            data-testid="transfer-to-select"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="bg-zinc-800 rounded px-2 py-1"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.nativeCurrency}) — {formatBalance(toNumberSafe(w.balance), w.nativeCurrency)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Valor (origem)</span>
          <div className="flex gap-2">
            <input
              data-testid="transfer-amount-input"
              type="number"
              step="0.01"
              value={amountFrom}
              onChange={(e) => setAmountFrom(e.target.value)}
              className="bg-zinc-800 rounded px-2 py-1 flex-1"
            />
            <button
              type="button"
              onClick={handleMaxClick}
              disabled={!fromWallet || fromBalanceNum <= 0}
              data-testid="transfer-amount-max-btn"
              className="px-2 py-1 rounded bg-zinc-700 text-xs disabled:opacity-50"
              title="Preencher com o saldo total disponivel"
            >
              Max
            </button>
          </div>
          {fromWallet && (
            <span
              data-testid="transfer-from-balance-hint"
              className={`text-xs ${exceedsBalance ? "text-red-400" : "text-zinc-400"}`}
            >
              Saldo disponivel: {formatBalance(fromBalanceNum, fromWallet.nativeCurrency)}
              {exceedsBalance ? " — valor maior que saldo" : ""}
            </span>
          )}
        </label>
        {isCrossCurrency && (
          <label className="flex flex-col gap-1">
            <span className="text-sm">Taxa de cambio ({fromWallet?.nativeCurrency} -&gt; {toWallet?.nativeCurrency})</span>
            <input
              data-testid="transfer-fxrate-input"
              type="number"
              step="0.0001"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className="bg-zinc-800 rounded px-2 py-1"
            />
          </label>
        )}
        {previewDestination != null && toWallet && (
          <div
            data-testid="transfer-destination-preview"
            className="text-xs text-zinc-300 bg-zinc-800/40 rounded px-2 py-1.5"
          >
            Destino recebe: <strong>{formatBalance(previewDestination, toWallet.nativeCurrency)}</strong>
          </div>
        )}
        {error?.code === "FX_DIFF_HIGH" && (
          <div data-testid="transfer-fx-warning" className="bg-amber-900/30 border border-amber-500 rounded p-3 text-sm">
            Taxa diverge do mercado. Mercado: <strong>{error.marketRate}</strong>. Voce informou: <strong>{error.providedRate}</strong>. Clique novamente em "Transferir" para confirmar.
          </div>
        )}
        {error && error.code !== "FX_DIFF_HIGH" && (
          <div data-testid="transfer-error-banner" className="bg-red-900/30 border border-red-500 rounded p-3 text-sm">
            {error.message ?? error.code}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1 rounded bg-zinc-700"
          >
            Cancelar
          </button>
          <button
            data-testid="transfer-submit-btn"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !fromId || !toId || !amountFrom}
            className="px-3 py-1 rounded bg-emerald-600 disabled:opacity-50"
          >
            {needsConfirm ? "Confirmar mesmo assim" : "Transferir"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferDialog;
