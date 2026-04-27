/**
 * WalletReconciliationDialog — Sprint Session-End Reconciliation V2.
 *
 * Spec: Docs/specs/session-end-reconciliation-v2.md
 *  - RF-04: payload v2 (expectedDelta, expectedClosingBalance, contributingTournaments, orphanContribution[])
 *  - RF-05: dialog com saldo pre-calculado + 3 botoes hierarquicos
 *  - RF-14 + P9: input mobile/desktop UX (inputMode='decimal', virgula/ponto)
 *  - P12: formatCurrency consistente
 *
 * data-testid:
 *   reconcile-dialog
 *   reconcile-toggle-all
 *   reconcile-row-{walletId} | reconcile-input-{walletId} | reconcile-delta-{walletId}
 *   reconcile-submit (Confirmar e gerar ajustes)
 *   reconcile-skip-soft (Saldos OK, sem ajuste)
 *   reconcile-skip-hard (Pular sem registrar)
 *   reconcile-orphan-banner | reconcile-orphan-cta
 *   reconcile-tie-break-badge-{walletId}
 *   reconcile-error-row-{walletId} | reconcile-error-alert
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { reconcileErrorMessage } from "@/lib/reconcileLabels";
import { formatCurrency } from "@/lib/format";
import {
  emitReconcileDialogOpened,
  emitReconcileSkippedUser,
  emitReconcileSubmitted,
  emitReconcileFailed,
} from "@/lib/session-end/telemetry";

export interface ReconcilableWalletV2 {
  walletId: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  openingBalance: number;
  balance?: number;
  expectedPreviousBalance: number;
  expectedDelta: number;
  expectedClosingBalance: number;
  contributingTournaments?: string[];
  hadActivityInSession?: boolean;
  tieBreakStrategy?: "proportional" | "single" | "custom";
}

interface ReconcilableResponseV2 {
  sessionId: string;
  alreadyReconciled: boolean;
  wallets: ReconcilableWalletV2[];
  orphanContribution?: Array<{ site: string; currency: string; amount: number }>;
}

export interface WalletReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onComplete: (info?: {
    skipped?: boolean;
    alreadyReconciled?: boolean;
    created?: any[];
    snapshotsCreated?: number;
  }) => void;
}

const EPSILON = 0.01;

/**
 * parseDecimalInput — RF-14: aceita virgula e ponto como separador.
 */
function parseDecimalInput(raw: string): number {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).trim().replace(/,/g, ".");
  return parseFloat(s);
}

function classifyManualAdjustment(adj: number): "positive" | "negative" | "neutral" {
  if (Math.abs(adj) < EPSILON) return "neutral";
  return adj > 0 ? "positive" : "negative";
}

export function WalletReconciliationDialog({
  open,
  onOpenChange,
  sessionId,
  onComplete,
}: WalletReconciliationDialogProps) {
  const { toast } = useToast();
  const [includeAll, setIncludeAll] = useState(false);
  const [wallets, setWallets] = useState<ReconcilableWalletV2[]>([]);
  const [orphanContribution, setOrphanContribution] = useState<
    Array<{ site: string; currency: string; amount: number }>
  >([]);
  const [reportedByWallet, setReportedByWallet] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorByWallet, setErrorByWallet] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Hooks primeiro (lessons-learned #1).
  // Fetch reconcilable wallets sempre que open ou includeAll mudar.
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
        const data = (await apiRequest("GET", url)) as ReconcilableResponseV2;
        if (cancelled) return;
        if (data?.alreadyReconciled) {
          toast({ title: "Esta sessao ja foi reconciliada anteriormente" });
          onComplete({ alreadyReconciled: true });
          return;
        }
        const ws = Array.isArray(data?.wallets) ? data.wallets : [];
        setWallets(ws);
        const orphan = Array.isArray(data?.orphanContribution)
          ? data.orphanContribution
          : [];
        setOrphanContribution(orphan);

        // RF-05: pre-preenche reportedByWallet com expectedClosingBalance.
        setReportedByWallet((prev) => {
          const next: Record<string, string> = { ...prev };
          for (const w of ws) {
            if (next[w.walletId] === undefined) {
              next[w.walletId] = String(w.expectedClosingBalance);
            }
          }
          return next;
        });

        // Telemetria reconcile_dialog_opened (RF-11 #5).
        try {
          const orphanCurrencies = Array.from(
            new Set(orphan.map((o) => o.currency)),
          );
          const hadActivityCount = ws.filter((w) => w.hadActivityInSession).length;
          emitReconcileDialogOpened({
            sessionId,
            walletsCount: ws.length,
            hadActivityCount,
            orphanCurrencies,
          });
        } catch {
          // ignore
        }
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

  // RF-14: foco inicial no primeiro input apos load.
  useEffect(() => {
    if (!open) return;
    if (wallets.length === 0) return;
    if (firstInputRef.current) {
      try {
        firstInputRef.current.focus();
      } catch {
        // ignore
      }
    }
  }, [open, wallets]);

  // ESC global -> equivalente a Pular sem registrar (P1/F-01).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        try {
          emitReconcileSkippedUser({
            sessionId,
            walletsCount: wallets.length,
            via: "esc",
          });
        } catch {
          // ignore
        }
        // Fecha sem POST
        onComplete({ skipped: true });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wallets.length, sessionId]);

  if (!open) return null;

  function handleToggleAll() {
    setIncludeAll((v) => !v);
  }

  function handleInputChange(walletId: string, value: string) {
    setReportedByWallet((prev) => ({ ...prev, [walletId]: value }));
    setErrorByWallet((prev) => {
      if (!prev[walletId]) return prev;
      const next = { ...prev };
      delete next[walletId];
      return next;
    });
  }

  function buildAdjustments(forSkipSoft = false): Array<{
    walletId: string;
    reportedBalance: number;
    expectedPreviousBalance: number;
    expectedDelta: number;
  }> {
    const out: Array<{
      walletId: string;
      reportedBalance: number;
      expectedPreviousBalance: number;
      expectedDelta: number;
    }> = [];
    for (const w of wallets) {
      let reported: number;
      if (forSkipSoft) {
        reported = w.expectedClosingBalance;
      } else {
        const reportedStr = reportedByWallet[w.walletId];
        if (reportedStr === undefined || reportedStr === "") continue;
        const parsed = parseDecimalInput(reportedStr);
        if (!Number.isFinite(parsed)) continue;
        reported = parsed;
      }
      out.push({
        walletId: w.walletId,
        reportedBalance: reported,
        expectedPreviousBalance: w.expectedPreviousBalance,
        expectedDelta: w.expectedDelta,
      });
    }
    return out;
  }

  async function handleSubmit() {
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const adjustments = buildAdjustments(false);
      const body = { adjustments, skipReconciliation: false };
      const data = await apiRequest(
        "POST",
        `/api/grind-sessions/${sessionId}/reconcile-wallets`,
        body,
      );
      const created = (data as any)?.txCreated ?? (data as any)?.created ?? [];
      const skipped = (data as any)?.skipped ?? 0;
      const snapshotsCreated = (data as any)?.snapshotsCreated ?? 0;
      try {
        emitReconcileSubmitted({
          sessionId,
          snapshotsCreated,
          txCreated: Array.isArray(created) ? created.length : 0,
          skipped,
        });
      } catch {
        // ignore
      }
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
      onComplete({
        created: Array.isArray(created) ? created : [],
        snapshotsCreated,
      });
    } catch (err: any) {
      handleSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // RF-05: "Saldos OK, sem ajuste" — submete com reportedBalance = expectedClosingBalance.
  async function handleSkipSoft() {
    if (submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const adjustments = buildAdjustments(true);
      const body = { adjustments, skipReconciliation: false };
      const data = await apiRequest(
        "POST",
        `/api/grind-sessions/${sessionId}/reconcile-wallets`,
        body,
      );
      const created = (data as any)?.txCreated ?? (data as any)?.created ?? [];
      const skipped = (data as any)?.skipped ?? 0;
      const snapshotsCreated = (data as any)?.snapshotsCreated ?? 0;
      try {
        emitReconcileSubmitted({
          sessionId,
          snapshotsCreated,
          txCreated: Array.isArray(created) ? created.length : 0,
          skipped,
        });
      } catch {
        // ignore
      }
      toast({ title: "Snapshot da sessao salvo sem ajuste manual" });
      onComplete({
        created: Array.isArray(created) ? created : [],
        snapshotsCreated,
      });
    } catch (err: any) {
      handleSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkipHard() {
    try {
      emitReconcileSkippedUser({
        sessionId,
        walletsCount: wallets.length,
        via: "button",
      });
    } catch {
      // ignore
    }
    onComplete({ skipped: true });
  }

  function handleSubmitError(err: any) {
    const status: number | undefined = err?.response?.status;
    const code: string | undefined = err?.response?.data?.code;
    const failedAt = err?.response?.data?.failedAt;
    try {
      emitReconcileFailed({
        sessionId,
        errorCode: code ?? "unknown",
        httpStatus: status ?? 0,
        failedAtWalletId: failedAt?.walletId,
      });
    } catch {
      // ignore
    }

    if (code === "already_reconciled") {
      toast({ title: "Esta sessao ja foi reconciliada anteriormente" });
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
      // refetch para reatualizar saldos.
      void (async () => {
        try {
          const refetched = (await apiRequest(
            "GET",
            `/api/grind-sessions/${sessionId}/reconcilable-wallets${
              includeAll ? "?includeAll=true" : ""
            }`,
          )) as ReconcilableResponseV2;
          if (refetched?.wallets) setWallets(refetched.wallets);
        } catch {
          // ignore
        }
      })();
      return;
    }
    setErrorMessage(reconcileErrorMessage(code ?? "unknown"));
  }

  function handleOrphanCta() {
    // Abre /bankroll em nova aba para preservar fluxo.
    try {
      window.open("/bankroll", "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }

  function formatOrphanLine(o: { site: string; currency: string; amount: number }) {
    return `${o.site} (${o.currency} ${o.amount.toFixed(2)})`;
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
            Confira o saldo final em cada plataforma. O valor vem pre-preenchido
            com o saldo esperado calculado a partir dos torneios da sessao.
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

        {orphanContribution.length > 0 && (
          <div
            data-testid="reconcile-orphan-banner"
            className="border border-amber-300 bg-amber-50 rounded p-3 text-sm space-y-2"
          >
            <div className="font-medium text-amber-900">
              Detectamos resultados em sites sem carteira cadastrada nesta sessao:
            </div>
            <ul className="list-disc pl-5 text-amber-900">
              {orphanContribution.map((o, i) => (
                <li key={`${o.site}-${o.currency}-${i}`}>
                  {formatOrphanLine(o)}
                </li>
              ))}
            </ul>
            <div className="text-xs text-amber-900">
              Esses valores nao serao registrados nesta sessao.
            </div>
            <button
              type="button"
              data-testid="reconcile-orphan-cta"
              onClick={handleOrphanCta}
              className="text-sm underline text-amber-900 hover:text-amber-950"
            >
              Cadastrar carteira agora
            </button>
          </div>
        )}

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
            {wallets.map((w, idx) => {
              const reported = reportedByWallet[w.walletId] ?? String(w.expectedClosingBalance);
              const reportedNum = parseDecimalInput(reported);
              const manualAdjustment = Number.isFinite(reportedNum)
                ? reportedNum - w.expectedClosingBalance
                : 0;
              const tone = classifyManualAdjustment(manualAdjustment);
              const rowError = errorByWallet[w.walletId];
              const tieBreakProportional = w.tieBreakStrategy === "proportional";

              const adjLabel =
                tone === "neutral"
                  ? "Conferido. Sem ajuste manual."
                  : tone === "positive"
                    ? `+${formatCurrency(manualAdjustment, w.nativeCurrency)} (extra nao registrado)`
                    : `${formatCurrency(manualAdjustment, w.nativeCurrency)} (saida nao registrada)`;

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
                    Saldo inicial: {formatCurrency(w.openingBalance, w.nativeCurrency)}
                    {" - "}
                    Delta esperado: {formatCurrency(w.expectedDelta, w.nativeCurrency)}
                    {" - "}
                    Saldo final pre-calculado:{" "}
                    {formatCurrency(w.expectedClosingBalance, w.nativeCurrency)}
                  </div>
                  {tieBreakProportional && (
                    <div
                      data-testid={`reconcile-tie-break-badge-${w.walletId}`}
                      className="text-xs text-muted-foreground"
                    >
                      Distribuido proporcionalmente
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Saldo final reportado</label>
                    <input
                      ref={idx === 0 ? firstInputRef : undefined}
                      data-testid={`reconcile-input-${w.walletId}`}
                      type="text"
                      inputMode="decimal"
                      value={reported}
                      onChange={(e) => handleInputChange(w.walletId, e.target.value)}
                      className="w-32 rounded border px-2 py-1 bg-background text-sm"
                    />
                    <span
                      data-testid={`reconcile-delta-${w.walletId}`}
                      data-tone={tone}
                      className={`text-sm font-medium ${
                        tone === "positive"
                          ? "text-green-700"
                          : tone === "negative"
                            ? "text-red-700"
                            : "text-muted-foreground"
                      }`}
                    >
                      {adjLabel}
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

        {/* RF-05: 3 niveis hierarquicos (P2/F-02). */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-end">
          <button
            type="button"
            data-testid="reconcile-skip-hard"
            onClick={handleSkipHard}
            disabled={submitting}
            title="Pular sem registrar — fecha sem snapshot. Voce podera reconciliar depois."
            className="text-sm underline text-amber-700 hover:text-amber-900 self-end sm:self-auto"
          >
            Pular sem registrar
          </button>
          <button
            type="button"
            data-testid="reconcile-skip-soft"
            onClick={handleSkipSoft}
            disabled={submitting}
            title="Confirma que os saldos pre-calculados estao corretos. Snapshot da sessao sera salvo sem ajuste manual."
            className="px-3 py-2 rounded-md border hover:bg-accent text-sm"
          >
            Saldos OK, sem ajuste
          </button>
          <button
            type="button"
            data-testid="reconcile-submit"
            onClick={handleSubmit}
            disabled={submitting}
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
