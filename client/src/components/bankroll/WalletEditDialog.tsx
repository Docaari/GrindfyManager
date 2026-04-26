/**
 * WalletEditDialog — Modal de edicao de carteira (RF-12).
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * Permitidos: name, color, displayOrder, bankrollRule, isShotPocket.
 * Imutaveis: nativeCurrency, platform, balance, status.
 */
import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface WalletProp {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  color?: string | null;
  bankrollRule?: string | null;
  displayOrder?: number;
  isShotPocket?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletProp;
}

export function WalletEditDialog({ open, onOpenChange, wallet }: Props) {
  const [name, setName] = useState(wallet.name);
  const [color, setColor] = useState(wallet.color ?? "");
  const [bankrollRule, setBankrollRule] = useState(wallet.bankrollRule ?? "");
  const [isShotPocket, setIsShotPocket] = useState(!!wallet.isShotPocket);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const patch: any = { name: name.trim(), isShotPocket };
      if (color) patch.color = color;
      if (bankrollRule) patch.bankrollRule = bankrollRule;
      await apiRequest("PUT", `/api/wallets/${wallet.id}`, patch);
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: [`/api/wallets/${wallet.id}`] });
      } catch {
        // ignore
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao editar carteira");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="wallet-edit-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold">Editar carteira</h2>

        <div>
          <label className="text-sm font-medium block mb-1">Nome</label>
          <input
            data-testid="wallet-edit-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Cor</label>
          <input
            data-testid="wallet-edit-color-input"
            type="color"
            value={color || "#3366FF"}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-20 rounded border"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Regra de banca (opcional)</label>
          <input
            data-testid="wallet-edit-rule-input"
            value={bankrollRule}
            onChange={(e) => setBankrollRule(e.target.value)}
            placeholder="1pct, 2pct, 5pct ou custom:N"
            className="w-full rounded border px-3 py-2 bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="wallet-edit-shot-pocket-checkbox"
              checked={isShotPocket}
              onChange={(e) => setIsShotPocket(e.target.checked)}
            />
            Pocket de shot
          </label>
        </div>

        {error && (
          <div data-testid="wallet-edit-error" className="text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border hover:bg-accent"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="wallet-edit-submit"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WalletEditDialog;
