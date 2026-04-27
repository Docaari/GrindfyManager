/**
 * RakebackDialog — Sprint Bankroll-3 (RF-03, RF-04, RF-05, RF-07)
 *
 * Spec: Docs/specs/rakeback-reporting.md
 * Sequence: Docs/architecture/flows/bankroll/sequence-rakeback-report.mermaid
 *
 * Dialog dedicado para reportar rakeback. Reusa endpoint
 * POST /api/wallets/:id/transactions com reason='rakeback', direction='in'.
 *
 * Disparadores:
 *   - source='page_header' (botao no header da /bankroll, sem wallet pre-selecionada)
 *   - source='wallet_menu' (acao no card/menu da wallet, com wallet pre-selecionada)
 */
import React, { useEffect, useMemo, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface RakebackWallet {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string;
  status: "active" | "archived";
}

export interface RakebackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: RakebackWallet[];
  preSelectedWalletId?: string;
  source: "page_header" | "wallet_menu";
}

function currencySymbol(ccy: string): string {
  if (ccy === "USD") return "$";
  if (ccy === "BRL") return "R$";
  if (ccy === "EUR") return "€";
  if (ccy === "GBP") return "£";
  return ccy;
}

function logTelemetry(event: string, payload: Record<string, any>): void {
  // eslint-disable-next-line no-console
  console.log("[telemetry][rakeback]", event, payload);
}

function nowDatetimeLocal(): string {
  // datetime-local format: YYYY-MM-DDTHH:mm
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function RakebackDialog({
  open,
  onOpenChange,
  wallets,
  preSelectedWalletId,
  source,
}: RakebackDialogProps) {
  const { toast } = useToast();
  const activeWallets = useMemo(
    () => wallets.filter((w) => w.status === "active"),
    [wallets],
  );

  const initialWalletId =
    preSelectedWalletId && activeWallets.some((w) => w.id === preSelectedWalletId)
      ? preSelectedWalletId
      : activeWallets[0]?.id ?? "";

  const [selectedWalletId, setSelectedWalletId] = useState<string>(initialWalletId);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>(nowDatetimeLocal());
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Telemetria: rakeback_dialog_view ao montar com open=true.
  useEffect(() => {
    if (open) {
      logTelemetry("rakeback_dialog_view", {
        source,
        walletId: preSelectedWalletId ?? undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-sincroniza wallet quando preSelectedWalletId muda (ex: usuario abre dialog
  // a partir de wallets diferentes).
  useEffect(() => {
    if (preSelectedWalletId && preSelectedWalletId !== selectedWalletId) {
      setSelectedWalletId(preSelectedWalletId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedWalletId]);

  if (!open) return null;

  const selectedWallet =
    activeWallets.find((w) => w.id === selectedWalletId) ?? activeWallets[0];
  const nativeCurrency = selectedWallet?.nativeCurrency ?? "USD";
  const symbol = currencySymbol(nativeCurrency);

  const amountNum = parseFloat(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const submitDisabled =
    submitting || !amountValid || !selectedWallet || selectedWallet.status !== "active";

  const isPinned = !!preSelectedWalletId;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMessage(null);
    if (!selectedWallet) return;
    if (!amountValid) return;

    setSubmitting(true);
    const body: any = {
      direction: "in",
      nativeAmount: amountNum,
      reason: "rakeback",
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    };
    if (note.trim()) body.note = note.trim();

    try {
      await apiRequest("POST", `/api/wallets/${selectedWallet.id}/transactions`, body);
      logTelemetry("rakeback_submit_success", {
        walletId: selectedWallet.id,
        nativeAmount: amountNum,
        nativeCurrency: selectedWallet.nativeCurrency,
      });
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
        queryClient.invalidateQueries({
          queryKey: [`/api/wallets/${selectedWallet.id}/transactions`],
        });
      } catch {
        // ignore
      }
      toast({ title: "Rakeback registrado!", description: selectedWallet.name });
      onOpenChange(false);
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const code: string | undefined = err?.response?.data?.code;
      logTelemetry("rakeback_submit_error", {
        walletId: selectedWallet.id,
        errorCode: code ?? "unknown",
        httpStatus: status ?? 0,
      });

      // Tratamento por code (estaveis):
      if (code === "invalid_rakeback_direction") {
        setErrorMessage(
          "Rakeback so aceita credito (entrada). Recarregue a pagina e tente novamente.",
        );
      } else if (code === "wallet_archived") {
        setErrorMessage(
          "Esta carteira foi arquivada. Atualizando lista de carteiras...",
        );
        try {
          queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        } catch {
          // ignore
        }
      } else {
        setErrorMessage(
          err?.message
            ? `Falha ao registrar rakeback: ${err.message}`
            : "Falha ao registrar rakeback. Tente novamente.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="rakeback-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg border border-border shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Reportar rakeback</h2>
          <span
            className="text-[10px] uppercase tracking-wide surface-warning border px-1.5 py-0.5 rounded"
            aria-hidden
          >
            Rakeback
          </span>
        </div>

        {/* Wallet pinned (source=wallet_menu) ou select (source=page_header) */}
        {isPinned ? (
          <div>
            <label className="text-sm font-medium block mb-1">Carteira</label>
            <div
              data-testid="rakeback-wallet-pinned"
              className="w-full rounded border px-3 py-2 bg-muted/40 text-sm font-medium"
            >
              {selectedWallet?.name ?? "(carteira nao encontrada)"}
              {selectedWallet?.platform && (
                <span className="text-xs text-muted-foreground ml-2">
                  · {selectedWallet.platform}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium block mb-1">Carteira</label>
            <select
              data-testid="rakeback-wallet-select"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="w-full rounded border px-3 py-2 bg-background"
            >
              {activeWallets.length === 0 && (
                <option value="">(nenhuma carteira ativa)</option>
              )}
              {activeWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.nativeCurrency})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">
            Valor do rakeback{" "}
            <span data-testid="rakeback-currency-symbol" className="text-muted-foreground">
              ({symbol})
            </span>
          </label>
          <input
            data-testid="rakeback-amount-input"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Quando</label>
          <input
            data-testid="rakeback-occurredAt-input"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Nota (opcional)</label>
          <textarea
            data-testid="rakeback-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="w-full rounded border px-3 py-2 bg-background"
            rows={2}
            placeholder="Ex: rakeback semanal PokerStars"
          />
        </div>

        {errorMessage && (
          <div
            data-testid="rakeback-error-alert"
            className="text-sm border surface-warning rounded px-3 py-2"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="rakeback-cancel"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2 rounded-md border hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="rakeback-submit"
            disabled={submitDisabled}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Registrando..." : "Registrar rakeback"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RakebackDialog;
