/**
 * WalletTransactionDialog — Modal de registro de movimento (RF-12).
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * Sprint Bankroll-2.1 (RF-01..RF-07): adiciona modo "Reportar saldo" com
 * optimistic concurrency via expectedPreviousBalance (ADR-038).
 */
import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { computeBalanceDelta } from "@/lib/walletBalanceDelta";

interface WalletProp {
  id: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: string;
  status: "active" | "archived";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletProp;
  initialReason?: "deposit" | "withdrawal" | "session_result" | "manual_adjustment";
}

type Mode = "movement" | "balance";

const REASONS: Array<{ value: "deposit" | "withdrawal" | "session_result" | "manual_adjustment"; label: string }> = [
  { value: "deposit", label: "Deposito" },
  { value: "withdrawal", label: "Saque" },
  { value: "session_result", label: "Resultado de sessao" },
  { value: "manual_adjustment", label: "Ajuste manual" },
];

function formatPreview(value: number, ccy: string): string {
  const symbol = ccy === "USD" ? "$" : ccy === "BRL" ? "R$" : ccy;
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WalletTransactionDialog({ open, onOpenChange, wallet, initialReason }: Props) {
  const [mode, setMode] = useState<Mode>("movement");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [reason, setReason] = useState<"deposit" | "withdrawal" | "session_result" | "manual_adjustment">(
    initialReason ?? "deposit",
  );
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [sessionId, setSessionId] = useState<string>("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Balance mode state
  const [knownBalance, setKnownBalance] = useState<number>(() => parseFloat(wallet.balance));
  const [newBalanceInput, setNewBalanceInput] = useState<string>(wallet.balance);
  const [balanceMismatch, setBalanceMismatch] = useState<{ currentBalance: number } | null>(null);

  // Sincronizar knownBalance quando wallet.balance externo muda (re-open).
  useEffect(() => {
    setKnownBalance(parseFloat(wallet.balance));
  }, [wallet.balance]);

  const previewBalance = useMemo(() => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const current = parseFloat(wallet.balance);
    const delta = direction === "in" ? amt : -amt;
    return current + delta;
  }, [amount, direction, wallet.balance]);

  const balanceDelta = useMemo(() => {
    const newBal = parseFloat(newBalanceInput);
    return computeBalanceDelta({
      knownBalance,
      newBalance: Number.isFinite(newBal) ? newBal : (NaN as any),
    });
  }, [knownBalance, newBalanceInput]);

  // QW-G: ler banca consolidada (cache TanStack) e taxa FX para calcular impacto USD/% em tempo real.
  const { data: consolidated } = useQuery<any>({
    queryKey: ["/api/bankroll/consolidated"],
    queryFn: async () => {
      const r = await fetch("/api/bankroll/consolidated", { credentials: "include" });
      if (!r.ok) throw new Error("consolidated_unavailable");
      return r.json();
    },
    enabled: open && wallet.nativeCurrency !== "USD",
    staleTime: 30_000,
  });

  const consolidatedImpact = useMemo(() => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const delta = direction === "in" ? amt : -amt;
    const fxRate = consolidated?.byWallet?.find((w: any) => w.walletId === wallet.id)?.fxRateUSDPerNative;
    const totalUSD = consolidated?.totalUSD ? parseFloat(consolidated.totalUSD) : null;
    if (!fxRate || !totalUSD) return null;
    const deltaUSD = delta / parseFloat(String(fxRate));
    const newTotalUSD = totalUSD + deltaUSD;
    const pctChange = totalUSD > 0 ? ((deltaUSD / totalUSD) * 100) : 0;
    return { deltaUSD, newTotalUSD, pctChange };
  }, [amount, direction, consolidated, wallet.id]);

  if (!open) return null;

  function handleModeChange(next: Mode) {
    setMode(next);
    setError(null);
    setBalanceMismatch(null);
    if (next === "balance") {
      setNewBalanceInput(wallet.balance);
      setKnownBalance(parseFloat(wallet.balance));
      setReason("session_result");
    }
  }

  async function handleRefreshBalance() {
    try {
      const r = await fetch(`/api/wallets/${wallet.id}`, { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      const newBal = parseFloat(data?.wallet?.balance ?? wallet.balance);
      if (Number.isFinite(newBal)) {
        setKnownBalance(newBal);
        setBalanceMismatch(null);
      }
    } catch {
      // refresh silencioso — usuario pode tentar de novo
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAmountError(null);
    setError(null);
    setWarning(null);
    setBalanceMismatch(null);

    let body: any;

    if (mode === "balance") {
      if (balanceDelta.sign === "invalid" || balanceDelta.sign === "zero") {
        return;
      }
      body = {
        direction: balanceDelta.direction,
        nativeAmount: balanceDelta.nativeAmount,
        reason,
        note: note || null,
        occurredAt: new Date(occurredAt).toISOString(),
        expectedPreviousBalance: knownBalance,
      };
      if (reason === "session_result" && sessionId) {
        body.sessionId = sessionId;
      }
    } else {
      const amt = parseFloat(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setAmountError("Valor deve ser maior que zero");
        return;
      }
      body = {
        direction,
        nativeAmount: amt,
        reason,
        note: note || null,
        occurredAt: new Date(occurredAt).toISOString(),
      };
      if (reason === "session_result" && sessionId) {
        body.sessionId = sessionId;
      }
    }

    setSubmitting(true);
    try {
      const resp: any = await apiRequest(
        "POST",
        `/api/wallets/${wallet.id}/transactions`,
        body,
      );
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: [`/api/wallets/${wallet.id}/transactions`] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
      } catch {
        // ignore
      }
      if (resp?.warning === "wallet_negative") {
        setWarning("Saldo da carteira ficou negativo");
      } else {
        onOpenChange(false);
      }
    } catch (err: any) {
      const resp = err?.response;
      if (resp?.status === 409 && resp?.data?.code === "balance_mismatch") {
        const cb = typeof resp.data.currentBalance === "number"
          ? resp.data.currentBalance
          : parseFloat(String(resp.data.currentBalance));
        setBalanceMismatch({ currentBalance: Number.isFinite(cb) ? cb : 0 });
      } else {
        setError(err?.message ?? "Erro ao registrar movimento");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled =
    submitting ||
    (mode === "balance" && (balanceDelta.sign === "zero" || balanceDelta.sign === "invalid"));

  return (
    <div
      data-testid="wallet-tx-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg border border-border shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold">Registrar movimento</h2>

        <div data-testid="wallet-tx-mode-toggle" className="flex gap-2 border rounded-md p-1 bg-muted">
          <button
            type="button"
            data-testid="wallet-tx-mode-movement"
            aria-pressed={mode === "movement"}
            onClick={() => handleModeChange("movement")}
            className={`flex-1 px-3 py-1.5 rounded text-sm ${mode === "movement" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Movimento
          </button>
          <button
            type="button"
            data-testid="wallet-tx-mode-balance"
            aria-pressed={mode === "balance"}
            onClick={() => handleModeChange("balance")}
            className={`flex-1 px-3 py-1.5 rounded text-sm ${mode === "balance" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Reportar saldo
          </button>
        </div>

        {mode === "movement" && (
          <div>
            <label className="text-sm font-medium block mb-1">Direcao</label>
            <select
              data-testid="wallet-tx-direction-select"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
              className="w-full rounded border px-3 py-2 bg-background"
            >
              <option value="in">Entrada</option>
              <option value="out">Saida</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">Motivo</label>
          <select
            data-testid="wallet-tx-reason-select"
            value={reason}
            onChange={(e) => setReason(e.target.value as any)}
            className="w-full rounded border px-3 py-2 bg-background"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {mode === "movement" && (
          <div>
            <label className="text-sm font-medium block mb-1">
              Valor ({wallet.nativeCurrency})
            </label>
            <input
              data-testid="wallet-tx-amount-input"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border px-3 py-2 bg-background"
              placeholder="0.00"
            />
            {amountError && (
              <p data-testid="wallet-tx-amount-error" className="text-xs text-destructive mt-1">
                {amountError}
              </p>
            )}
          </div>
        )}

        {mode === "balance" && (
          <div className="space-y-2">
            <label className="text-sm font-medium block mb-1">
              Saldo atual da carteira ({wallet.nativeCurrency})
            </label>
            <input
              data-testid="wallet-tx-balance-input"
              type="number"
              step="0.01"
              value={newBalanceInput}
              onChange={(e) => setNewBalanceInput(e.target.value)}
              className="w-full rounded border px-3 py-2 bg-background"
              placeholder="0.00"
            />
            <div data-testid="wallet-tx-balance-hint" className="text-xs text-muted-foreground">
              Saldo atual: {formatPreview(knownBalance, wallet.nativeCurrency)}
            </div>
            <div
              data-testid="wallet-tx-balance-preview"
              data-sign={balanceDelta.sign}
              className="text-sm bg-accent rounded px-3 py-2"
            >
              {balanceDelta.sign === "positive" && (
                <span>+{formatPreview(balanceDelta.absDelta, wallet.nativeCurrency)} (lucro)</span>
              )}
              {balanceDelta.sign === "negative" && (
                <span>-{formatPreview(balanceDelta.absDelta, wallet.nativeCurrency)} (perda)</span>
              )}
              {balanceDelta.sign === "zero" && <span>Saldo igual ao atual</span>}
              {balanceDelta.sign === "invalid" && <span>Informe o saldo</span>}
            </div>
          </div>
        )}

        {mode === "movement" && previewBalance != null && (
          <div data-testid="wallet-tx-preview-balance" className="text-sm bg-accent rounded px-3 py-2 space-y-1">
            <div>Novo saldo: {formatPreview(previewBalance, wallet.nativeCurrency)}</div>
            {consolidatedImpact && (
              <div data-testid="wallet-tx-preview-consolidated-impact" className="text-xs text-muted-foreground">
                Impacto banca consolidada: {consolidatedImpact.deltaUSD >= 0 ? "+" : ""}
                {formatPreview(Math.abs(consolidatedImpact.deltaUSD), "USD")}
                {" -> "}
                {formatPreview(consolidatedImpact.newTotalUSD, "USD")}
                {" "}
                ({consolidatedImpact.pctChange >= 0 ? "+" : ""}
                {consolidatedImpact.pctChange.toFixed(1)}%)
              </div>
            )}
          </div>
        )}

        {reason === "session_result" && (
          <div>
            <label className="text-sm font-medium block mb-1">ID da sessao</label>
            <input
              data-testid="wallet-tx-session-id-input"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full rounded border px-3 py-2 bg-background"
              placeholder="ses_..."
            />
          </div>
        )}

        <div>
          <label className="text-sm font-medium block mb-1">Quando</label>
          <input
            data-testid="wallet-tx-occurred-at-input"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full rounded border px-3 py-2 bg-background"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Nota (opcional)</label>
          <textarea
            data-testid="wallet-tx-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="w-full rounded border px-3 py-2 bg-background"
            rows={2}
          />
        </div>

        {balanceMismatch && (
          <div
            data-testid="wallet-tx-balance-mismatch-alert"
            className="text-sm border surface-warning rounded px-3 py-2 space-y-2"
          >
            <p>
              Saldo divergente. Saldo atual no servidor:{" "}
              {formatPreview(balanceMismatch.currentBalance, wallet.nativeCurrency)}.
            </p>
            <button
              type="button"
              data-testid="wallet-tx-balance-refresh-button"
              onClick={handleRefreshBalance}
              className="px-3 py-1 rounded border bg-background hover:bg-accent text-xs"
            >
              Atualizar
            </button>
          </div>
        )}
        {warning && (
          <div data-testid="wallet-tx-warning" className="text-sm border surface-warning rounded px-3 py-2">
            {warning}
          </div>
        )}
        {error && (
          <div data-testid="wallet-tx-error" className="text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="wallet-tx-cancel"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-md border hover:bg-accent"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="wallet-tx-submit"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60"
            disabled={submitDisabled}
          >
            {submitting ? "Registrando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default WalletTransactionDialog;
