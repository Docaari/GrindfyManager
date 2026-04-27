/**
 * WalletCreateDialog — Modal de criacao de carteira (RF-12 + RF-13).
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * Form: name, platform, nativeCurrency, color, bankrollRule, isShotPocket,
 *       initialDeposit (opcional). Validacao real-time.
 */
import React, { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  WALLET_PLATFORMS,
  WALLET_PLATFORM_LABELS,
  WALLET_PLATFORM_GROUPS,
  type WalletPlatform,
} from "@shared/wallet-platforms";

interface WalletPrefill {
  name?: string;
  platform?: WalletPlatform;
  nativeCurrency?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: WalletPrefill;
}

const NATIVE_CURRENCIES = ["USD", "BRL", "EUR", "GBP", "CNY", "USDT", "BTC"] as const;

export function WalletCreateDialog({ open, onOpenChange, prefill }: Props) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>("GGNetwork");
  const [nativeCurrency, setNativeCurrency] = useState<string>("USD");
  const [color, setColor] = useState<string>("");
  const [isShotPocket, setIsShotPocket] = useState(false);
  const [initialDepositAmount, setInitialDepositAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill quando abre via chip de sugestao (QW-A).
  useEffect(() => {
    if (open && prefill) {
      if (prefill.name) setName(prefill.name);
      if (prefill.platform) setPlatform(prefill.platform);
      if (prefill.nativeCurrency) setNativeCurrency(prefill.nativeCurrency);
    }
  }, [open, prefill]);

  if (!open) return null;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setNameError(null);

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError("Nome e obrigatorio");
      return;
    }
    if (trimmed.length > 80) {
      setNameError("Nome deve ter no maximo 80 caracteres");
      return;
    }

    setSubmitting(true);
    try {
      const body: any = {
        name: trimmed,
        platform,
        nativeCurrency,
        isShotPocket,
      };
      if (color) body.color = color;
      if (initialDepositAmount) {
        const amt = parseFloat(initialDepositAmount);
        if (Number.isFinite(amt) && amt > 0) {
          body.initialDeposit = { amount: amt };
        }
      }
      await apiRequest("POST", "/api/wallets", body);
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
      } catch {
        // ignore (queryClient pode nao estar configurado em tests)
      }
      onOpenChange(false);
      // Reset form
      setName("");
      setPlatform("GGNetwork");
      setNativeCurrency("USD");
      setColor("");
      setIsShotPocket(false);
      setInitialDepositAmount("");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (/existe|nome|duplica/i.test(msg)) {
        setNameError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="wallet-create-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg border border-border shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold">Nova Carteira</h2>

        <div>
          <label className="text-sm font-medium block mb-1">Nome</label>
          <input
            data-testid="wallet-create-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
            placeholder="Ex: GG Main, Suprema X"
          />
          {nameError && (
            <p data-testid="wallet-create-name-error" className="text-xs text-destructive mt-1">
              {nameError}
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Plataforma</label>
          <select
            data-testid="wallet-create-platform-select"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
          >
            {/* QW-D: labels human-readable agrupados (poker / off-platform / outros) */}
            {WALLET_PLATFORM_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.platforms.map((p) => (
                  <option key={p} value={p}>{WALLET_PLATFORM_LABELS[p]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Moeda nativa</label>
          <select
            data-testid="wallet-create-native-currency-select"
            value={nativeCurrency}
            onChange={(e) => setNativeCurrency(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
          >
            {NATIVE_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Cor (opcional)</label>
          <input
            data-testid="wallet-create-color-input"
            type="color"
            value={color || "#3366FF"}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-20 rounded border"
          />
        </div>

        <div>
          <label className="text-sm font-medium flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="wallet-create-shot-pocket-checkbox"
              checked={isShotPocket}
              onChange={(e) => setIsShotPocket(e.target.checked)}
            />
            Shot pocket
          </label>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            Carteira reservada para tentativas em buy-ins acima da banca de gestao.
            Nao entra no calculo da banca consolidada.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Deposito inicial (opcional)</label>
          <input
            data-testid="wallet-create-initial-deposit-input"
            type="number"
            step="0.01"
            value={initialDepositAmount}
            onChange={(e) => setInitialDepositAmount(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
            placeholder="0.00"
          />
        </div>

        {error && (
          <div data-testid="wallet-create-error" className="text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="wallet-create-cancel"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border hover:bg-accent"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="wallet-create-submit"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Criando..." : "Criar carteira"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WalletCreateDialog;
