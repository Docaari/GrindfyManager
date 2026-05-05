/**
 * BankrollWidget — Card "Banca atual" (Bankroll-Reform 2026-05-05)
 *
 * Layout:
 *   - Total USD em destaque (linha 1)
 *   - Breakdown USD/BRL/EUR em fonte menor (linha 2)
 *   - Quantidade de carteiras (linha 3)
 *   - Coluna direita: ABI count grande + ABI configurado clickavel pra editar
 *
 * Removido: projecao mensal, sparkline (founder pediu card minimal).
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BankrollState {
  configured: boolean;
  amount: number | null;
  rule?: string;
  rulePct?: number;
  tolerance?: number;
  maxBuyInUSD: number | null;
  maxBuyInDisplay?: { USD: number | null; BRL?: number; EUR?: number };
  amountDisplay?: { USD: number | null; BRL?: number; EUR?: number };
  exchangeRateBRL?: number | null;
  exchangeRateEUR?: number | null;
  snapshotCount?: number;
  lastUpdatedAt?: string | null;
  aggregationMode?: "global" | "per_wallet";
  walletCount?: number;
}

function fmt(n: number | null | undefined, locale = "en-US"): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("en-US");
}

export function BankrollWidget() {
  const { data: state } = useQuery<BankrollState>({
    queryKey: ["/api/bankroll"],
    queryFn: () => apiRequest("GET", "/api/bankroll"),
  });

  const [abiEditOpen, setAbiEditOpen] = useState(false);

  if (!state) return null;

  if (!state.configured) {
    return (
      <div
        data-testid="bankroll-widget-empty"
        className="rounded-lg border p-5 bg-card"
      >
        <h3 className="text-lg font-semibold mb-2">Banca nao configurada</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Configure sua banca para habilitar o filtro de buy-in no Tournament Selector
          e acompanhar sua evolucao financeira.
        </p>
        <a
          href="/settings"
          data-to="/settings"
          data-testid="bankroll-widget-cta"
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          Configure sua banca
        </a>
      </div>
    );
  }

  const amount = state.amount ?? 0;
  const amountUSD = state.amountDisplay?.USD ?? amount;
  const amountBRL =
    state.amountDisplay?.BRL ??
    (state.exchangeRateBRL != null ? amount * state.exchangeRateBRL : undefined);
  const amountEUR =
    state.amountDisplay?.EUR ??
    (state.exchangeRateEUR != null ? amount * state.exchangeRateEUR : undefined);

  const abi = state.maxBuyInUSD ?? 0;
  const abiCount = abi > 0 ? Math.floor(amount / abi) : 0;
  const walletCount = state.walletCount ?? 0;

  return (
    <div
      data-testid="bankroll-widget-card"
      className="rounded-lg border p-5 bg-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Banca atual
          </h3>
          <div
            data-testid="bankroll-widget-amount"
            className="text-3xl font-bold text-primary tabular-nums leading-none"
          >
            ${fmt(amountUSD)}{" "}
            <span className="text-base text-muted-foreground font-medium">USD</span>
          </div>
          <div
            data-testid="bankroll-widget-breakdown"
            className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums"
          >
            <span data-testid="bankroll-widget-breakdown-usd">${fmt(amountUSD)} USD</span>
            {amountBRL != null && (
              <span data-testid="bankroll-widget-breakdown-brl">
                R$ {fmt(amountBRL, "pt-BR")} BRL
              </span>
            )}
            {amountEUR != null && (
              <span data-testid="bankroll-widget-breakdown-eur">
                € {fmt(amountEUR, "de-DE")} EUR
              </span>
            )}
          </div>
          {walletCount > 0 && (
            <div
              data-testid="bankroll-widget-wallet-count"
              className="mt-2 text-xs text-muted-foreground"
            >
              {walletCount} {walletCount === 1 ? "carteira" : "carteiras"}
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <div
            data-testid="bankroll-widget-abi-count"
            className="text-3xl font-bold tabular-nums leading-none"
            title="Quantidade de ABIs (banca / ABI configurado)"
          >
            {fmtInt(abiCount)}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
            ABIs
          </div>
          <button
            type="button"
            data-testid="bankroll-widget-abi-edit"
            onClick={() => setAbiEditOpen(true)}
            className="mt-2 text-xs px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"
            title="Clique para alterar o ABI configurado"
          >
            ABI ${fmtInt(abi)}
          </button>
        </div>
      </div>

      {abiEditOpen && (
        <AbiEditDialog
          currentAbiUSD={abi}
          bankrollUSD={amount}
          onClose={() => setAbiEditOpen(false)}
        />
      )}
    </div>
  );
}

function AbiEditDialog({
  currentAbiUSD,
  bankrollUSD,
  onClose,
}: {
  currentAbiUSD: number;
  bankrollUSD: number;
  onClose: () => void;
}) {
  const [value, setValue] = useState<string>(
    currentAbiUSD > 0 ? String(Math.round(currentAbiUSD * 100) / 100) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    const abi = parseFloat(value);
    if (!Number.isFinite(abi) || abi <= 0) {
      setError("ABI deve ser maior que zero");
      return;
    }
    if (bankrollUSD <= 0) {
      setError("Banca precisa ter saldo > 0");
      return;
    }
    const pct = Math.round(((abi / bankrollUSD) * 100) * 10) / 10;
    // Backend rule custom:N exige N entre 0.1 e 20 (uma casa decimal).
    // Bankroll-Reform 2026-05-05 (HIGH-3): em vez de clampar silenciosamente
    // (que grava valor diferente do digitado), bloqueia submit + mostra range
    // valido pra esse bankroll.
    if (pct < 0.1 || pct > 20) {
      const minAbi = (0.1 / 100) * bankrollUSD;
      const maxAbi = (20 / 100) * bankrollUSD;
      setError(
        `ABI fora do range valido (${pct.toFixed(2)}% da banca). Use entre $${minAbi.toFixed(2)} e $${maxAbi.toFixed(2)} (0.1% a 20%).`,
      );
      return;
    }
    const rule = `custom:${pct.toFixed(1)}`;
    setSubmitting(true);
    try {
      await apiRequest("PUT", "/api/bankroll", { rule });
      queryClient.invalidateQueries({ queryKey: ["/api/bankroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Erro ao atualizar ABI");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="bankroll-abi-edit-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg border shadow-xl p-5 w-full max-w-sm space-y-3"
      >
        <h2 className="text-lg font-semibold">Alterar ABI</h2>
        <p className="text-xs text-muted-foreground">
          ABI = buy-in medio. A banca atual de ${fmtInt(bankrollUSD)} USD sera dividida
          por este valor para calcular quantos ABIs voce tem.
        </p>
        <div>
          <label className="text-sm font-medium block mb-1">Novo ABI (USD)</label>
          <input
            type="number"
            step="0.01"
            data-testid="bankroll-abi-edit-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="w-full rounded border px-3 py-2 bg-background"
            placeholder="7.00"
          />
        </div>
        {error && (
          <div
            data-testid="bankroll-abi-edit-error"
            className="text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-md border hover:bg-accent text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="bankroll-abi-edit-submit"
            disabled={submitting}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BankrollWidget;
