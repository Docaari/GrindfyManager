/**
 * BankrollAlertModal — Alerta no Grind Live quando banca cai >10% (RF-07)
 *
 * Apresentado no GrindSessionLive quando bankrollDropPct > 10.
 */
import React from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dropPct: number;
  amountUSD: number;
}

export function BankrollAlertModal({ open, onOpenChange, dropPct, amountUSD }: Props) {
  if (!open) return null;
  return (
    <div
      data-testid="bankroll-alert-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card rounded-lg p-6 w-full max-w-md shadow-lg space-y-3">
        <h2 className="text-lg font-semibold text-destructive">Alerta de banca</h2>
        <p className="text-sm text-muted-foreground">
          Sua banca caiu {dropPct.toFixed(1)}% nesta sessao. Saldo atual: ${amountUSD.toFixed(2)} USD.
        </p>
        <div className="flex justify-end">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded bg-primary text-primary-foreground"
          >
            Ciente
          </button>
        </div>
      </div>
    </div>
  );
}

export default BankrollAlertModal;
