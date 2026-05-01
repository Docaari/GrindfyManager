/**
 * TransferDialog — Sprint Bankroll-3 RF-4
 *
 * UI minima para POST /api/wallets/transfers.
 * Nao usa Radix Dialog para evitar dependencia de portal nos tests; renderiza
 * inline quando open=true. Producao pode envelopar em Dialog primitivo.
 */

import React, { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const [fromId, setFromId] = useState(defaultFromWalletId ?? wallets[0]?.id ?? "");
  const [toId, setToId] = useState(defaultToWalletId ?? wallets[1]?.id ?? "");
  const [amountFrom, setAmountFrom] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code?: string; message?: string; marketRate?: number; providedRate?: number } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const fromWallet = useMemo(() => wallets.find((w) => w.id === fromId), [wallets, fromId]);
  const toWallet = useMemo(() => wallets.find((w) => w.id === toId), [wallets, toId]);
  const isCrossCurrency = !!(
    fromWallet && toWallet && fromWallet.nativeCurrency !== toWallet.nativeCurrency
  );

  if (!open) return null;

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
      toast({ title: "Transferencia criada", description: "A movimentacao foi registrada." });
      onOpenChange(false);
    } catch (err: any) {
      const code = err?.body?.code ?? err?.code;
      if (code === "FX_DIFF_HIGH") {
        setError({
          code: "FX_DIFF_HIGH",
          providedRate: err?.body?.providedRate,
          marketRate: err?.body?.marketRate,
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
                {w.name} ({w.nativeCurrency})
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
                {w.name} ({w.nativeCurrency})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Valor (origem)</span>
          <input
            data-testid="transfer-amount-input"
            type="number"
            step="0.01"
            value={amountFrom}
            onChange={(e) => setAmountFrom(e.target.value)}
            className="bg-zinc-800 rounded px-2 py-1"
          />
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
