/**
 * WalletReconciliationDialog — Sprint Session-End Reconciliation
 *
 * Spec: Docs/specs/session-end-wallet-reconciliation.md
 *  - RF-02: lista wallets ativas com toggle "todas"
 *  - RF-03: input + preview delta em tempo real
 *  - RF-04: submit batch + tratamento 409 balance_mismatch
 *  - RF-05: botao "Sem ajuste"
 *  - RF-08: 409 already_reconciled
 *  - RF-11: PT-BR
 *  - RF-12: telemetria via console.log
 *
 * data-testid convention (estaveis, prefixo "reconcile-"):
 *   reconcile-dialog | reconcile-loading | reconcile-empty
 *   reconcile-toggle-all
 *   reconcile-row-{walletId} | reconcile-input-{walletId} | reconcile-delta-{walletId}
 *   reconcile-error-row-{walletId} | reconcile-error-alert
 *   reconcile-submit | reconcile-skip | reconcile-cancel
 */
import React, { useEffect, useMemo, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDelta, reconcileErrorMessage } from "@/lib/reconcileLabels";

export interface ReconcilableWallet {
  walletId: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  balance: number;
  expectedPreviousBalance: number;
  hadActivityInSession: boolean;
}

interface ReconcilableResponse {
  sessionId: string;
  alreadyReconciled: boolean;
  wallets: ReconcilableWallet[];
}

export interface WalletReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onComplete: (info?: { skipped?: boolean; alreadyReconciled?: boolean; created?: any[] }) => void;
}

function logTelemetry(event: string, payload: Record<string, any>): void {
  // eslint-disable-next-line no-console
  console.log("[telemetry][reconcile]", event, payload);
}

const EPSILON = 0.01;

function computeDelta(reportedStr: string, expected: number): number {
  const n = parseFloat(reportedStr);
  if (!Number.isFinite(n)) return 0;
  const delta = n - expected;
  return Number.isFinite(delta) ? delta : 0;
}

export function WalletReconciliationDialog({
  open,
  onOpenChange,
  sessionId,
  onComplete,
}: WalletReconciliationDialogProps) {
  const { toast } = useToast();
  const [includeAll, setIncludeAll] = useState(false);
  const [wallets, setWallets] = useState<ReconcilableWallet[]>([]);
  const [reportedByWallet, setReportedByWallet] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorByWallet, setErrorByWallet] = useState<Record<string, string>>({});

  // Hooks primeiro (lessons-learned #1)
  // Telemetria de view ao montar com open=true
  useEffect(() => {
    if (open) {
      logTelemetry("reconcile_dialog_view", {
        sessionId,
        includeAll,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch reconcilable wallets sempre que open ou includeAll mudar
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const url = `/api/grind-sessions/${sessionId}/reconcilable-wallets${
          includeAll ? "?includeAll=true" : ""
        }`;
        const data = (await apiRequest("GET", url)) as ReconcilableResponse;
        if (cancelled) return;
        if (data?.alreadyReconciled) {
          // RF-08 preflight ja detectou — aviso + chama onComplete
          // HIGH-4: nao chamar onOpenChange(false) aqui. Parent reage ao
          // onComplete e fecha via state -> re-render. Evita double trigger.
          toast({ title: "Esta sessao ja foi reconciliada anteriormente" });
          onComplete({ alreadyReconciled: true });
          return;
        }
        const ws = Array.isArray(data?.wallets) ? data.wallets : [];
        setWallets(ws);
        // Pre-preenche reportedByWallet com balance atual (RF-03)
        setReportedByWallet((prev) => {
          const next: Record<string, string> = { ...prev };
          for (const w of ws) {
            if (next[w.walletId] === undefined) {
              next[w.walletId] = String(w.balance);
            }
          }
          return next;
        });
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage("Falha ao carregar carteiras. Tente novamente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, includeAll, sessionId]);

  // Calcula adjustments com delta != 0 para envio
  const adjustmentsToSend = useMemo(() => {
    const out: Array<{ walletId: string; reportedBalance: number; expectedPreviousBalance: number }> = [];
    for (const w of wallets) {
      const reportedStr = reportedByWallet[w.walletId];
      if (reportedStr === undefined || reportedStr === "") continue;
      const reported = parseFloat(reportedStr);
      if (!Number.isFinite(reported)) continue;
      const delta = reported - w.expectedPreviousBalance;
      if (Math.abs(delta) >= EPSILON) {
        out.push({
          walletId: w.walletId,
          reportedBalance: reported,
          expectedPreviousBalance: w.expectedPreviousBalance,
        });
      }
    }
    return out;
  }, [wallets, reportedByWallet]);

  if (!open) return null;

  const submitDisabled = submitting || adjustmentsToSend.length === 0;

  function handleToggleAll() {
    setIncludeAll((v) => !v);
  }

  function handleInputChange(walletId: string, value: string) {
    setReportedByWallet((prev) => ({ ...prev, [walletId]: value }));
    // limpa erro inline daquela linha
    setErrorByWallet((prev) => {
      if (!prev[walletId]) return prev;
      const next = { ...prev };
      delete next[walletId];
      return next;
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const body = { adjustments: adjustmentsToSend };
      const data = await apiRequest(
        "POST",
        `/api/grind-sessions/${sessionId}/reconcile-wallets`,
        body,
      );
      const created = (data as any)?.txCreated ?? (data as any)?.created ?? [];
      const skipped = (data as any)?.skipped ?? 0;
      logTelemetry("reconcile_submit_success", {
        sessionId,
        adjustmentsCount: adjustmentsToSend.length,
        txCreatedCount: Array.isArray(created) ? created.length : 0,
        skippedCount: skipped,
      });
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/history"] });
      } catch {
        // ignore
      }
      const n = Array.isArray(created) ? created.length : 0;
      toast({
        title: n > 0 ? `${n} ajuste(s) registrado(s)` : "Nenhum ajuste necessario",
      });
      // HIGH-4: parent fecha o dialog reagindo a onComplete. Sem
      // onOpenChange(false) aqui para evitar double trigger.
      onComplete({ created: Array.isArray(created) ? created : [] });
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const code: string | undefined = err?.response?.data?.code;
      const failedAt = err?.response?.data?.failedAt;
      logTelemetry("reconcile_submit_error", {
        sessionId,
        errorCode: code ?? "unknown",
        httpStatus: status ?? 0,
        failedAtWalletId: failedAt?.walletId,
      });

      if (code === "already_reconciled") {
        toast({ title: "Esta sessao ja foi reconciliada anteriormente" });
        // HIGH-4: parent fecha via state. Sem double trigger.
        onComplete({ alreadyReconciled: true });
        return;
      }
      if (code === "balance_mismatch" || code === "wallet_archived") {
        const walletId = failedAt?.walletId;
        const walletName = walletId
          ? wallets.find((w) => w.walletId === walletId)?.name
          : undefined;
        setErrorMessage(reconcileErrorMessage(code, walletName));
        if (walletId) {
          setErrorByWallet((prev) => ({
            ...prev,
            [walletId]: reconcileErrorMessage(code, walletName),
          }));
        }
        // refetch para reatualizar saldos / remover archived
        try {
          const refetched = (await apiRequest(
            "GET",
            `/api/grind-sessions/${sessionId}/reconcilable-wallets${
              includeAll ? "?includeAll=true" : ""
            }`,
          )) as ReconcilableResponse;
          if (refetched?.wallets) setWallets(refetched.wallets);
        } catch {
          // ignore
        }
        return;
      }
      setErrorMessage(reconcileErrorMessage(code ?? "unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkipTotal() {
    logTelemetry("reconcile_skip_total", {
      sessionId,
      eligibleWalletsCount: wallets.length,
    });
    // HIGH-4: parent fecha via state. Sem onOpenChange(false) aqui.
    onComplete({ skipped: true });
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <div
      data-testid="reconcile-dialog"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-background rounded-lg border shadow-lg w-full max-w-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Reconciliar saldo das carteiras</h2>
          <p className="text-sm text-muted-foreground">
            Confira o saldo final em cada plataforma. Se houver divergencia, sera registrada como ajuste de sessao.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="reconcile-toggle-all"
            type="checkbox"
            data-testid="reconcile-toggle-all"
            checked={includeAll}
            onChange={handleToggleAll}
          />
          <label htmlFor="reconcile-toggle-all" className="text-sm">
            Mostrar todas as carteiras ativas
          </label>
        </div>

        {loading && (
          <div data-testid="reconcile-loading" className="text-sm text-muted-foreground">
            Carregando carteiras...
          </div>
        )}

        {!loading && wallets.length === 0 && (
          <div data-testid="reconcile-empty" className="text-sm text-muted-foreground">
            Nenhuma carteira elegivel.
          </div>
        )}

        {!loading && wallets.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {wallets.map((w) => {
              const reported = reportedByWallet[w.walletId] ?? String(w.balance);
              const delta = computeDelta(reported, w.expectedPreviousBalance);
              const deltaLabel = formatDelta(delta, w.nativeCurrency);
              const rowError = errorByWallet[w.walletId];
              return (
                <div
                  key={w.walletId}
                  data-testid={`reconcile-row-${w.walletId}`}
                  className="flex flex-col gap-1 border rounded p-3"
                >
                  <div className="flex items-baseline justify-between">
                    <div className="text-sm font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {w.platform} - {w.nativeCurrency}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Saldo atual conhecido: {w.balance.toFixed(2)} {w.nativeCurrency}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Saldo final reportado</label>
                    <input
                      data-testid={`reconcile-input-${w.walletId}`}
                      type="number"
                      step="0.01"
                      value={reported}
                      onChange={(e) => handleInputChange(w.walletId, e.target.value)}
                      className="w-32 rounded border px-2 py-1 bg-background text-sm"
                    />
                    <span
                      data-testid={`reconcile-delta-${w.walletId}`}
                      data-tone={deltaLabel.tone}
                      className={`text-sm font-medium ${
                        deltaLabel.tone === "positive"
                          ? "text-green-700"
                          : deltaLabel.tone === "negative"
                            ? "text-red-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      {deltaLabel.tone === "neutral" ? `Sem ajuste (${deltaLabel.text})` : deltaLabel.text}
                    </span>
                  </div>
                  {rowError && (
                    <div
                      data-testid={`reconcile-error-row-${w.walletId}`}
                      className="text-xs text-amber-800"
                    >
                      {rowError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {errorMessage && (
          <div
            data-testid="reconcile-error-alert"
            role="alert"
            className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="reconcile-cancel"
            onClick={handleCancel}
            disabled={submitting}
            className="px-3 py-2 rounded-md border hover:bg-accent text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="reconcile-skip"
            onClick={handleSkipTotal}
            disabled={submitting}
            title="Sessao sera fechada sem reconciliar carteiras. Voce pode revisar manualmente em Bankroll depois."
            className="px-3 py-2 rounded-md border hover:bg-accent text-sm"
          >
            Sem ajuste
          </button>
          <button
            type="button"
            data-testid="reconcile-submit"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 text-sm"
          >
            {submitting ? "Registrando..." : "Confirmar e gerar ajustes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletReconciliationDialog;
