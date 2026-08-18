import { useEffect, useRef, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { track as trackTelemetry } from "@/lib/telemetry";
import { getDefaultCurrencyForSite } from "@shared/wallet-reconciliation";
import { formatSessionRoi } from "@shared/session-roi";
import { WalletCreateDialog } from "@/components/bankroll/WalletCreateDialog";
// Sprint Estudos-Coach-Biblio-2 RF-4.4: insights pos-finalize.
import { SessionInsightsPanel } from "@/components/grind/SessionInsightsPanel";
import { tokens } from "@/lib/ui-tokens";
import { computeAdjustedResult } from "./manual-session-result";
import type { ManualSessionResultOverride } from "./session-end-helpers";
import type { SessionSummaryData } from './types';

function safeTrack(name: string, payload: Record<string, unknown>): void {
  try {
    trackTelemetry(name, payload);
  } catch {
    // telemetry must never throw user-facing
  }
}

interface ReconcilableWalletShape {
  walletId: string;
  name: string;
  platform: string;
  nativeCurrency: string;
  expectedClosingBalance: number;
  expectedDelta?: number;
  expectedPreviousBalance?: number;
  hadActivityInSession?: boolean;
  contributingTournaments?: string[];
}

interface SessionSummaryModalProps {
  show: boolean;
  summaryData: (SessionSummaryData & {
    abiMed?: number;
    duration?: number;
    focoMedio?: number;
    inteligenciaEmocionalMedia?: number;
    interferenciasMedia?: number;
    cooldownCompleted?: boolean;
    sessionId?: string;
    breaksRecorded?: number;
  }) | null;
  finalNotes: string;
  setFinalNotes: (notes: string) => void;
  onContinueSession: () => void;
  // walletProfitUsd: lucro reconciliado da banca (card "Lucro Total da Sessao").
  // Passado adiante para persistir em grind_sessions.wallet_profit_usd — assim
  // o historico mostra o mesmo numero que apareceu ao finalizar.
  // manualOverride (ADR-244 D1): resultado declarado pelo jogador. Quando
  // presente, o mesmo valor ocupa profit, roi e walletProfitUsd no PUT — e o
  // 1o argumento tambem vira o valor manual, inclusive sem wallets.
  onEndSession: (
    walletProfitUsd?: number,
    manualOverride?: ManualSessionResultOverride | null,
  ) => void;
  onStartFullCooldown?: (logId: string) => void;
  onStartQuickCooldown?: (logId: string) => void;
  bankrollManagementEnabled?: boolean;
  reconcilableWallets?: ReconcilableWalletShape[];
  missingPlatforms?: string[];
  // MEDIUM-1 fix: distinguir loading + loadFailed de "sem wallets" silencioso.
  reconcilableLoading?: boolean;
  reconcilableLoadFailed?: boolean;
  onRetryReconcilable?: () => void;
  // FX rates "1 USD = N native units" — usado pra computar lucro total
  // dinamico em USD a partir dos saldos reportados (delta wallet -> USD).
  usdConversionRates?: Record<string, number>;
  // ADR-244 (D3): user_settings.manualSessionResultEnabled. Fail-open igual ao
  // bankrollManagementEnabled — undefined (settings carregando/404) = ligado.
  manualResultEnabled?: boolean;
}

const MAX_VISIBLE_MISSING = 3;

function formatAdjustment(value: number, currency: string): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${abs.toFixed(2)} ${currency}`;
}

export default function SessionSummaryModal({
  show,
  summaryData,
  finalNotes,
  setFinalNotes,
  onContinueSession: _onContinueSession,
  onEndSession,
  onStartFullCooldown: _onStartFullCooldown,
  onStartQuickCooldown: _onStartQuickCooldown,
  bankrollManagementEnabled,
  reconcilableWallets,
  missingPlatforms,
  reconcilableLoading,
  reconcilableLoadFailed,
  onRetryReconcilable,
  usdConversionRates,
  manualResultEnabled,
}: SessionSummaryModalProps) {
  const [isReconciling, setIsReconciling] = useState(false);
  const { toast } = useToast();
  void _onContinueSession;
  void _onStartFullCooldown;
  void _onStartQuickCooldown;

  const [reportedBalances, setReportedBalances] = useState<Record<string, string>>({});
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletDialogPlatform, setWalletDialogPlatform] = useState<string | null>(null);
  // ADR-244 (RF-02): rascunho do resultado declarado. `null` = campo fechado
  // (sem ajuste). String crua para nao transformar entrada invalida em 0.
  const [manualResultDraft, setManualResultDraft] = useState<string | null>(null);
  // Guard de duplo clique do proprio modal: sem ele o rastro de auditoria
  // (RF-06) sairia duas vezes para uma unica finalizacao.
  const finalizingRef = useRef(false);

  const sessionId = summaryData?.sessionId;
  const wallets = reconcilableWallets ?? [];
  const missing = missingPlatforms ?? [];
  const bankrollEnabled = bankrollManagementEnabled !== false;
  const showBankrollSection = bankrollEnabled && wallets.length > 0;
  const hasMissing = bankrollEnabled && missing.length > 0;

  useEffect(() => {
    if (!wallets.length) return;
    setReportedBalances((prev) => {
      const next = { ...prev };
      for (const w of wallets) {
        if (next[w.walletId] === undefined) {
          next[w.walletId] = String(w.expectedClosingBalance);
        }
      }
      return next;
    });
  }, [wallets]);

  useEffect(() => {
    if (!show || !sessionId || !hasMissing) return;
    safeTrack("summary_missing_platforms_shown", {
      sessionId,
      missingPlatforms: missing,
    });
  }, [show, sessionId, hasMissing, missing]);

  // O PUT falhando reabre o summary (GrindSessionLive). Libera o guard para o
  // jogador poder tentar de novo; o valor digitado e preservado de proposito.
  useEffect(() => {
    if (show) finalizingRef.current = false;
  }, [show]);

  if (!show || !summaryData) return null;

  // Cooldown CTAs removidos 2026-05-05 — feature em refator (modal infinito
  // ao iniciar). Props preservadas para compat com callsite. Reintroduzir
  // quando UX recuperada.

  const adjustments = wallets.map((w) => {
    const reportedRaw = reportedBalances[w.walletId];
    const reported = reportedRaw === undefined || reportedRaw === ""
      ? w.expectedClosingBalance
      : Number(reportedRaw);
    const reportedNum = Number.isFinite(reported) ? reported : w.expectedClosingBalance;
    const delta = reportedNum - w.expectedClosingBalance;
    return {
      walletId: w.walletId,
      reportedBalance: reportedNum,
      manualAdjustment: delta,
      tone:
        Math.abs(delta) < 0.005
          ? ("neutral" as const)
          : delta > 0
            ? ("positive" as const)
            : ("negative" as const),
      nativeCurrency: w.nativeCurrency,
    };
  });

  const walletsWithAdjustment = adjustments.filter((a) => a.tone !== "neutral");

  // Lucro total dinamico USD: sum over wallets de (reported - opening) / rate.
  // Opening = expectedPreviousBalance (saldo inicial da sessao). reported =
  // input do user. Rate = 1 USD = N native; dividir nativa pela rate -> USD.
  const totalProfitUSD = wallets.reduce((sum, w) => {
    const reportedRaw = reportedBalances[w.walletId];
    const reported =
      reportedRaw === undefined || reportedRaw === ""
        ? w.expectedClosingBalance
        : Number(reportedRaw);
    const reportedNum = Number.isFinite(reported)
      ? reported
      : w.expectedClosingBalance;
    const opening = w.expectedPreviousBalance ?? 0;
    const profitNative = reportedNum - opening;
    const ccy = w.nativeCurrency || "USD";
    if (ccy === "USD") return sum + profitNative;
    const rate = usdConversionRates?.[ccy];
    if (typeof rate === "number" && rate > 0) {
      return sum + profitNative / rate;
    }
    return sum + profitNative;
  }, 0);
  const showProfitCard = showBankrollSection && wallets.length > 0;

  // ===== Ajuste manual do resultado final (ADR-244) =====
  // Fail-open: undefined (settings ainda carregando ou 404) mantem ligado.
  const manualResultAvailable = manualResultEnabled !== false;
  // Base "calculada" que o ajuste sobrescreve: o card de banca quando ha
  // wallets reconciliaveis, senao o P&L de torneios.
  const computedProfitUsd = showProfitCard ? totalProfitUSD : summaryData.profit;
  const manualResultSource: "wallet" | "tournaments" = showProfitCard
    ? "wallet"
    : "tournaments";
  // Entrada invalida NUNCA vira 0: fica null e bloqueia a finalizacao.
  const manualResultValue = (() => {
    if (manualResultDraft === null) return null;
    const trimmed = manualResultDraft.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const manualResultInvalid = manualResultDraft !== null && manualResultValue === null;
  const hasManualAdjustment = manualResultAvailable && manualResultValue !== null;
  const adjustedResult = hasManualAdjustment
    ? computeAdjustedResult({
        manualProfitUsd: manualResultValue as number,
        investedUsd: summaryData.invested,
      })
    : null;
  // Investido NUNCA entra nesta conta — a base de investimento nao muda.
  const displayProfitUsd = adjustedResult ? adjustedResult.profitUsd : summaryData.profit;
  const displayRoi = adjustedResult ? adjustedResult.roi : summaryData.roi;
  const displayTotalProfitUSD = adjustedResult ? adjustedResult.profitUsd : totalProfitUSD;

  const openManualResultAdjust = () => {
    setManualResultDraft(computedProfitUsd.toFixed(2));
  };

  const resetManualResultAdjust = () => {
    setManualResultDraft(null);
  };

  const submitReconcile = async (): Promise<boolean> => {
    if (!sessionId) return true;
    if (!showBankrollSection) {
      safeTrack("reconcile_skipped_setting_off", { sessionId });
      return true;
    }
    if (walletsWithAdjustment.length === 0) {
      safeTrack("summary_inline_reconcile_skipped_no_changes", {
        sessionId,
        walletCount: wallets.length,
      });
      return true;
    }

    setIsReconciling(true);
    try {
      // Payload exigido por ReconcileWalletsBodySchema: walletId,
      // reportedBalance, expectedPreviousBalance (server valida 400 se falta).
      // expectedDelta opcional acompanha snapshot.
      const adjustmentsPayload = walletsWithAdjustment.map((a) => {
        const wallet = wallets.find((w) => w.walletId === a.walletId);
        return {
          walletId: a.walletId,
          reportedBalance: a.reportedBalance,
          expectedPreviousBalance: wallet?.expectedPreviousBalance ?? 0,
          ...(typeof wallet?.expectedDelta === "number"
            ? { expectedDelta: wallet.expectedDelta }
            : {}),
        };
      });
      await apiRequest(
        "POST",
        `/api/grind-sessions/${sessionId}/reconcile-wallets`,
        { adjustments: adjustmentsPayload },
      );
      safeTrack("summary_inline_reconcile_submitted", {
        sessionId,
        walletCount: wallets.length,
        walletsWithAdjustment: walletsWithAdjustment.length,
      });
      return true;
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const errBody = err?.response?.data ?? {};
      // 409 already_reconciled: idempotente — sessao ja teve snapshot criado
      // (provavelmente em tentativa anterior). Trata como sucesso pra que
      // handleFinalizeSession prossiga + feche modal + navegue /grind.
      if (status === 409 && errBody?.code === "already_reconciled") {
        safeTrack("summary_inline_reconcile_idempotent", {
          sessionId,
          existingCount: errBody?.existingCount ?? 0,
        });
        return true;
      }
      const msg = errBody?.message ?? err?.message ?? "Falha ao reconciliar. Tente novamente.";
      toast({ title: msg });
      safeTrack("summary_inline_reconcile_failed", {
        sessionId,
        errorCode: status ?? 0,
        errorMessage: msg,
      });
      return false;
    } finally {
      setIsReconciling(false);
    }
  };

  const guardAndReconcile = async (): Promise<boolean> => {
    if (hasMissing) {
      safeTrack("summary_submit_skipped_missing_platforms", {
        sessionId,
        missingPlatforms: missing,
      });
      // P1: registra o skip server-side (skipReconciliation=true) para deixar
      // trilha de auditoria — o endpoint cria o marcador `skippedByUser`. Best-
      // effort: se a chamada falhar a sessao finaliza mesmo assim.
      if (sessionId) {
        try {
          await apiRequest(
            "POST",
            `/api/grind-sessions/${sessionId}/reconcile-wallets`,
            { adjustments: [], skipReconciliation: true },
          );
        } catch (err: any) {
          const status: number | undefined = err?.response?.status;
          const code = err?.response?.data?.code;
          // 409 already_reconciled eh idempotente — trilha ja existe.
          if (!(status === 409 && code === "already_reconciled")) {
            safeTrack("summary_skip_reconcile_failed", {
              sessionId,
              errorCode: status ?? 0,
            });
          }
        }
      }
      toast({
        title: "Sessao finalizada sem reconciliar",
        description: "Cadastre as wallets pendentes e reconcilie depois em /bankroll.",
      });
      return true;
    }
    return submitReconcile();
  };

  const handleFinalizeSession = async () => {
    if (finalizingRef.current) return;
    // Ausencia de dado nao finaliza a sessao com numero inventado.
    if (manualResultInvalid) return;
    finalizingRef.current = true;

    const reconciled = await guardAndReconcile();
    if (!reconciled) {
      finalizingRef.current = false;
      return;
    }

    if (adjustedResult) {
      // RF-06: como D2 dispensa coluna de auditoria, este evento e o UNICO
      // rastro de que o resultado foi declarado, e nao calculado.
      safeTrack("session_result_manual_override", {
        sessionId,
        computedProfitUsd,
        manualProfitUsd: adjustedResult.profitUsd,
        deltaUsd: adjustedResult.profitUsd - computedProfitUsd,
        investedUsd: summaryData.invested,
        roiComputed: computeAdjustedResult({
          manualProfitUsd: computedProfitUsd,
          investedUsd: summaryData.invested,
        }).roi,
        roiManual: adjustedResult.roi,
        source: manualResultSource,
      });
      // D1: o valor declarado ocupa tambem o walletProfitUsd — inclusive sem
      // wallets, porque passa a significar "resultado final da sessao".
      onEndSession(adjustedResult.profitUsd, {
        profitUsd: adjustedResult.profitUsd,
        roi: adjustedResult.roi,
      });
      return;
    }

    // Persiste o lucro da banca apenas quando a secao de bankroll esta
    // visivel (ha wallets reconciliaveis). Sem wallets, o historico mantem
    // o fallback de P&L de torneios.
    onEndSession(showProfitCard ? totalProfitUSD : undefined);
  };

  const handleRegisterMissingWallet = () => {
    const platform = missing[0];
    if (!platform) return;
    setWalletDialogPlatform(platform);
    setWalletDialogOpen(true);
    safeTrack("summary_missing_platforms_create_clicked", {
      sessionId,
      platform,
      nativeCurrency: getDefaultCurrencyForSite(platform),
    });
  };

  const visibleMissing = missing.slice(0, MAX_VISIBLE_MISSING);
  const extraMissingCount = Math.max(0, missing.length - MAX_VISIBLE_MISSING);

  return (
    <div className="session-end-modal show">
      <div className="session-end-content">
        <div className="session-end-header">
          <div className="session-end-title">Resumo da Sessao</div>
          <div className="session-end-subtitle">Sua sessao de grind foi concluida</div>
        </div>

        <div className="summary-section">
          <h4>Estatisticas da Sessao</h4>
          <div className="summary-grid">
            <div className="summary-item">
              <div className="summary-value">{summaryData.volume}</div>
              <div className="summary-label">Torneios</div>
            </div>
            {/* Investido NUNCA muda com o ajuste manual (RF-03). */}
            <div className="summary-item" data-testid="summary-stat-invested">
              <div className="summary-value">${summaryData.invested.toFixed(2)}</div>
              <div className="summary-label">Investido</div>
            </div>
            <div className="summary-item" data-testid="summary-stat-profit">
              <div
                className={`summary-value ${displayProfitUsd >= 0 ? 'positive' : 'negative'} ${
                  displayProfitUsd >= 0
                    ? tokens.color.delta.positive
                    : tokens.color.delta.negative
                }`}
              >
                {displayProfitUsd >= 0 ? '+' : ''}${displayProfitUsd.toFixed(2)}
              </div>
              <div className="summary-label">Profit</div>
            </div>
            <div className="summary-item" data-testid="summary-stat-roi">
              <div
                className={`summary-value ${
                  displayRoi === null
                    ? tokens.color.delta.neutral
                    : displayRoi >= 0
                      ? `positive ${tokens.color.delta.positive}`
                      : `negative ${tokens.color.delta.negative}`
                }`}
              >
                {formatSessionRoi(displayRoi)}
              </div>
              <div className="summary-label">ROI</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">{summaryData.fts}</div>
              <div className="summary-label">FTs</div>
            </div>
            <div className="summary-item">
              <div className="summary-value">{summaryData.wins}</div>
              <div className="summary-label">Cravadas</div>
            </div>
          </div>
        </div>

        {/* RF-02 (ADR-244): ajuste manual do resultado final. Fechado por
            padrao; com a preferencia OFF o modal fica exatamente como antes. */}
        {manualResultAvailable && (
          <div className="summary-section" data-testid="manual-session-result-section">
            <h4>Resultado Final da Sessao</h4>
            {manualResultDraft === null ? (
              <div className="flex items-center justify-between gap-3 py-1">
                <div
                  className={`text-lg font-semibold ${
                    computedProfitUsd >= 0
                      ? tokens.color.delta.positive
                      : tokens.color.delta.negative
                  }`}
                >
                  {computedProfitUsd >= 0 ? '+' : ''}${computedProfitUsd.toFixed(2)}
                </div>
                <button
                  type="button"
                  data-testid="manual-session-result-toggle"
                  onClick={openManualResultAdjust}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Ajustar
                </button>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                <label
                  htmlFor="manual-session-result-input"
                  className="block text-xs text-muted-foreground"
                >
                  Resultado final da sessao (USD)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="manual-session-result-input"
                    data-testid="manual-session-result-input"
                    type="number"
                    step="0.01"
                    value={manualResultDraft}
                    onChange={(e) => setManualResultDraft(e.target.value)}
                    className="w-36 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    data-testid="manual-session-result-reset"
                    onClick={resetManualResultAdjust}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Desfazer ajuste
                  </button>
                  {hasManualAdjustment && (
                    <span
                      data-testid="session-result-adjusted-badge"
                      className={`text-xs ${tokens.color.delta.neutral}`}
                    >
                      ajustado manualmente
                    </span>
                  )}
                </div>
                {manualResultInvalid && (
                  <div
                    data-testid="manual-session-result-error"
                    role="alert"
                    className={`text-xs ${tokens.color.danger.text}`}
                  >
                    Informe um valor numerico
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground">
                  O investido nao muda e o ROI e recalculado.
                </div>
              </div>
            )}
          </div>
        )}

        {hasMissing && (
          <div
            data-testid="missing-platforms-banner"
            role="alert"
            className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100 my-3"
          >
            <div className="font-medium mb-1">Plataformas sem wallet cadastrada</div>
            <div className="text-amber-200/80 mb-2">
              Voce jogou em {visibleMissing.join(", ")}
              {extraMissingCount > 0 ? `, +${extraMissingCount} mais` : ""}
              . Pode finalizar mesmo assim — reconcilie depois em /bankroll, ou cadastre agora pra reconcile inline.
            </div>
            <button
              type="button"
              data-testid="register-wallet-cta"
              onClick={handleRegisterMissingWallet}
              className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-400"
            >
              Cadastrar wallet
            </button>
          </div>
        )}

        {bankrollEnabled && reconcilableLoadFailed && (
          <div
            data-testid="reconcilable-load-error-banner"
            role="alert"
            className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100 my-3 flex items-center justify-between gap-3"
          >
            <div className="flex-1">
              <div className="font-medium mb-1">Erro ao carregar carteiras</div>
              <div className="text-red-200/80">
                Nao foi possivel buscar suas carteiras pra reconciliacao. Tente
                novamente antes de finalizar.
              </div>
            </div>
            {onRetryReconcilable && (
              <button
                type="button"
                data-testid="reconcilable-retry-cta"
                onClick={onRetryReconcilable}
                className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-red-950 hover:bg-red-400"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {bankrollEnabled && reconcilableLoading && !reconcilableLoadFailed && (
          <div
            data-testid="reconcilable-loading-banner"
            className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground my-3"
          >
            Carregando carteiras para reconciliacao...
          </div>
        )}

        {showBankrollSection && (
          <div
            data-testid="bankroll-reconcile-section"
            className="bg-card border border-border rounded-md p-4 my-3 space-y-3"
          >
            <h4 className="text-sm font-semibold text-foreground">Bancas</h4>
            <div className="space-y-2">
              {wallets.map((w) => {
                const adj = adjustments.find((a) => a.walletId === w.walletId);
                const tone = adj?.tone ?? "neutral";
                const previewClass =
                  tone === "positive"
                    ? "text-emerald-400"
                    : tone === "negative"
                      ? "text-red-400"
                      : "text-muted-foreground";
                const reportedRaw =
                  reportedBalances[w.walletId] ?? String(w.expectedClosingBalance);
                return (
                  <div
                    key={w.walletId}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground truncate">
                        {w.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Esperado: {w.expectedClosingBalance.toFixed(2)} {w.nativeCurrency}
                      </div>
                    </div>
                    <input
                      data-testid={`wallet-balance-input-${w.walletId}`}
                      type="number"
                      step="0.01"
                      value={reportedRaw}
                      disabled={isReconciling}
                      onChange={(e) =>
                        setReportedBalances((prev) => ({
                          ...prev,
                          [w.walletId]: e.target.value,
                        }))
                      }
                      className="w-28 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                    />
                    <div
                      data-testid={`wallet-adjustment-preview-${w.walletId}`}
                      data-tone={tone}
                      className={`text-xs font-mono w-24 text-right ${previewClass}`}
                    >
                      {tone === "neutral"
                        ? `0.00 ${w.nativeCurrency}`
                        : formatAdjustment(adj?.manualAdjustment ?? 0, w.nativeCurrency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(summaryData.bestResult || showProfitCard) && (
          <div className="summary-section">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summaryData.bestResult && (
                <div>
                  <h4>Melhor Resultado</h4>
                  <div className="best-result">
                    <div className="best-result-value">
                      {summaryData.bestResult.profit >= 0 ? '+' : ''}${summaryData.bestResult.profit.toFixed(2)}
                    </div>
                    <div className="best-result-tournament">
                      {summaryData.bestResult.name} - {summaryData.bestResult.details}
                    </div>
                  </div>
                </div>
              )}
              {showProfitCard && (
                <div>
                  <h4>Lucro Total da Sessao</h4>
                  <div
                    className="best-result"
                    data-testid="session-total-profit-card"
                  >
                    <div
                      className={`best-result-value ${displayTotalProfitUSD >= 0 ? 'positive' : 'negative'} ${
                        displayTotalProfitUSD >= 0
                          ? tokens.color.delta.positive
                          : tokens.color.delta.negative
                      }`}
                    >
                      {displayTotalProfitUSD >= 0 ? '+' : ''}${displayTotalProfitUSD.toFixed(2)}
                    </div>
                    <div className="best-result-tournament">
                      {adjustedResult
                        ? "Ajustado manualmente (USD)"
                        : "Reconciliado USD (atualiza ao preencher saldos)"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="summary-section">
          <h4>Performance Mental Media</h4>
          {/* MEDIUM-7 fix: sem breaks registrados, mostra placeholder "—" ao
              inves de "0.0" engan oso em todas as 5 medias. */}
          {(summaryData.breaksRecorded ?? 0) === 0 ? (
            <div
              data-testid="no-breaks-placeholder"
              className="text-sm text-muted-foreground italic px-2 py-3"
            >
              Nenhum break registrado nesta sessao.
            </div>
          ) : (
            <div className="mental-averages">
              <div className="mental-average">
                <div className="mental-average-value">{summaryData.mentalAverages.focus.toFixed(1)}</div>
                <div className="mental-average-label">Foco</div>
              </div>
              <div className="mental-average">
                <div className="mental-average-value">{summaryData.mentalAverages.energy.toFixed(1)}</div>
                <div className="mental-average-label">Energia</div>
              </div>
              <div className="mental-average">
                <div className="mental-average-value">{summaryData.mentalAverages.confidence.toFixed(1)}</div>
                <div className="mental-average-label">Confianca</div>
              </div>
              <div className="mental-average">
                <div className="mental-average-value">{summaryData.mentalAverages.emotionalIntelligence.toFixed(1)}</div>
                <div className="mental-average-label">Int. Emocional</div>
              </div>
              <div className="mental-average">
                <div className="mental-average-value">{summaryData.mentalAverages.interference.toFixed(1)}</div>
                <div className="mental-average-label">Interferencias</div>
              </div>
            </div>
          )}
        </div>

        {summaryData.objectives && (
          <div className="summary-section">
            <h4>Objetivos da Sessao</h4>
            <div className="objectives-review">
              <div className={`objective-status objective-${summaryData.objectiveStatus}`}>
                {summaryData.objectiveStatus === 'completed' && 'Objetivo Cumprido'}
                {summaryData.objectiveStatus === 'partial' && 'Objetivo Parcial'}
                {summaryData.objectiveStatus === 'missed' && 'Objetivo Perdido'}
              </div>
              <div>"{summaryData.objectives}"</div>
            </div>
          </div>
        )}

        {summaryData.quickNotes && summaryData.quickNotes.length > 0 && (
          <div className="summary-section">
            <h4>Notas Rapidas da Sessao</h4>
            <div className="quick-notes-summary">
              {summaryData.quickNotes.map((note: any, index: number) => (
                <div key={note.id || index} className="quick-note-item">
                  <div className="quick-note-time">{note.timestamp}</div>
                  <div className="quick-note-text">{note.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="summary-section">
          <h4>Notas Finais</h4>
          <div className="final-notes">
            <textarea
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              placeholder="Como foi a sessao? Principais aprendizados, ajustes para proxima vez..."
            />
          </div>
        </div>

        {/* Sprint Estudos-Coach-Biblio-2 RF-4.4: painel "Insights da sessao".
            Lazy load via GET /api/coach/session-insights/:sessionId — Coach
            gera apos abertura. Renderiza apenas quando temos sessionId (p.e.
            sessao ja finalizada com id retornado pelo backend). */}
        {sessionId && (
          <div className="mt-4">
            <SessionInsightsPanel sessionId={sessionId} />
          </div>
        )}

        <div className="session-end-actions">
          <button
            data-testid="cta-finalize-session"
            className="end-session-btn bg-primary text-primary-foreground"
            onClick={handleFinalizeSession}
            disabled={isReconciling || manualResultInvalid}
          >
            Finalizar Sessao
          </button>
        </div>

        {walletDialogOpen && walletDialogPlatform && (
          <WalletCreateDialog
            open={walletDialogOpen}
            onOpenChange={(open) => {
              setWalletDialogOpen(open);
              if (!open) {
                try {
                  if (sessionId) {
                    queryClient.invalidateQueries({
                      queryKey: ["/api/grind-sessions", sessionId, "reconcilable-wallets"],
                    });
                  }
                  queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
                } catch {
                  // ignore
                }
              }
            }}
            prefill={{
              platform: walletDialogPlatform as any,
              nativeCurrency: getDefaultCurrencyForSite(walletDialogPlatform),
            }}
          />
        )}
      </div>
    </div>
  );
}
