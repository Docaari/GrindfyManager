import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { detectRedFlags } from "@/lib/cooldownHelpers";
import {
  emitCooldownStartedFromSummary,
  emitCooldownCreateFailed,
} from "@/lib/session-end/telemetry";
import { track as trackTelemetry } from "@/lib/telemetry";
import { getDefaultCurrencyForSite } from "@shared/wallet-reconciliation";
import { WalletCreateDialog } from "@/components/bankroll/WalletCreateDialog";
import type { SessionSummaryData } from './types';

function safeTrack(name: string, payload: Record<string, unknown>): void {
  try {
    trackTelemetry(name, payload);
  } catch {
    // telemetry must never throw user-facing
  }
}

/**
 * RF-12: mapeia HTTP status / error code para mensagem PT-BR humana.
 */
function mapCooldownErrorToMessage(
  status: number | undefined,
  errBody: any,
): { title: string; description?: string } {
  if (status === undefined || status === 0) {
    return { title: "Sem conexao. Verifique sua internet e tente novamente." };
  }
  if (status === 400) {
    return { title: "Sessao invalida ou expirada. Recarregue a pagina." };
  }
  if (status === 401) {
    return { title: "Sessao expirada. Faca login novamente." };
  }
  if (status === 404) {
    return {
      title:
        "Sessao nao encontrada. Pode ter sido removida noutra aba. Voltando para /grind...",
    };
  }
  if (status === 409) {
    return { title: "Cool-down ja iniciado para esta sessao. Continuando..." };
  }
  if (status === 429) {
    return { title: "Muitas tentativas. Aguarde 1 minuto e tente novamente." };
  }
  if (status >= 500) {
    return {
      title:
        "Erro no servidor. Sua sessao foi salva, mas o cool-down nao iniciou. Tente em alguns minutos.",
    };
  }
  return { title: errBody?.message ?? "Erro ao iniciar cool-down" };
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
  }) | null;
  finalNotes: string;
  setFinalNotes: (notes: string) => void;
  onContinueSession: () => void;
  onEndSession: () => void;
  onStartFullCooldown?: (logId: string) => void;
  onStartQuickCooldown?: (logId: string) => void;
  bankrollManagementEnabled?: boolean;
  reconcilableWallets?: ReconcilableWalletShape[];
  missingPlatforms?: string[];
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
  onStartFullCooldown,
  onStartQuickCooldown,
  bankrollManagementEnabled,
  reconcilableWallets,
  missingPlatforms,
}: SessionSummaryModalProps) {
  const [isCreatingCooldown, setIsCreatingCooldown] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  void _onContinueSession;

  const [reportedBalances, setReportedBalances] = useState<Record<string, string>>({});
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletDialogPlatform, setWalletDialogPlatform] = useState<string | null>(null);

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

  if (!show || !summaryData) return null;

  const redFlags = detectRedFlags({
    profit: summaryData.profit,
    abiMed: summaryData.abiMed,
    focoMedio: summaryData.focoMedio,
    inteligenciaEmocionalMedia: summaryData.inteligenciaEmocionalMedia,
    interferenciasMedia: summaryData.interferenciasMedia,
    duration: summaryData.duration,
  });
  const cooldownAlreadyDone = summaryData.cooldownCompleted === true;
  const fullCtaClass = redFlags.hasFlags ? "cooldown-cta-warning" : "cooldown-cta-neutral";

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

  const startCooldown = async (mode: "full" | "quick") => {
    if (isCreatingCooldown) return;

    if (!summaryData.sessionId) {
      toast({ title: "Sessao nao identificada. Tente recarregar a pagina." });
      return;
    }

    setIsCreatingCooldown(true);
    try {
      const result: any = await apiRequest("POST", "/api/cooldown-logs", {
        sessionId: summaryData.sessionId,
        mode,
      });
      const logId = result?.id ?? "";
      try {
        emitCooldownStartedFromSummary({ sessionId: summaryData.sessionId, mode });
      } catch {
        // ignore
      }
      if (mode === "full") onStartFullCooldown?.(logId);
      else onStartQuickCooldown?.(logId);
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const errBody = err?.response?.data ?? {};
      const msg = mapCooldownErrorToMessage(status, errBody);
      toast(msg);
      try {
        emitCooldownCreateFailed({
          sessionId: summaryData.sessionId,
          httpStatus: status ?? 0,
          errorMessage: msg.title,
        });
      } catch {
        // ignore
      }
      if (status === 401) {
        setTimeout(() => setLocation("/login"), 3000);
      } else if (status === 404) {
        setTimeout(() => setLocation("/grind"), 1500);
      }
    } finally {
      setIsCreatingCooldown(false);
    }
  };

  // Guard: bloqueia se ha plataformas faltando, depois tenta reconcile.
  // Retorna true se chamador pode prosseguir com a acao terminal.
  const guardAndReconcile = async (): Promise<boolean> => {
    if (hasMissing) {
      safeTrack("summary_submit_blocked_missing_platforms", {
        sessionId,
        missingPlatforms: missing,
      });
      toast({ title: "Cadastre as wallets pendentes antes de finalizar." });
      return false;
    }
    return submitReconcile();
  };

  // Sprint Bankroll-3 RF-10: unificacao dos CTAs (legacy testIds removidos).
  // Restam apenas os 3 CTAs B2: quick, full (cta-start-cooldown),
  // finalize (cta-finalize-session). Todos passam por guardAndReconcile +
  // startCooldown async (B2 contract).
  const handleStartFullCooldown = async () => {
    if (await guardAndReconcile()) await startCooldown("full");
  };

  const handleStartQuickCooldown = async () => {
    if (await guardAndReconcile()) await startCooldown("quick");
  };

  const handleFinalizeSession = async () => {
    if (await guardAndReconcile()) onEndSession();
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
            <div className="summary-item">
              <div className="summary-value">${summaryData.invested.toFixed(2)}</div>
              <div className="summary-label">Investido</div>
            </div>
            <div className="summary-item">
              <div className={`summary-value ${summaryData.profit >= 0 ? 'positive' : 'negative'}`}>
                {summaryData.profit >= 0 ? '+' : ''}${summaryData.profit.toFixed(2)}
              </div>
              <div className="summary-label">Profit</div>
            </div>
            <div className="summary-item">
              <div className={`summary-value ${summaryData.roi >= 0 ? 'positive' : 'negative'}`}>
                {summaryData.roi >= 0 ? '+' : ''}{summaryData.roi.toFixed(1)}%
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
              . Cadastre antes de finalizar para garantir reconcile correto.
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
                      disabled={isReconciling || isCreatingCooldown}
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

        {summaryData.bestResult && (
          <div className="summary-section">
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

        <div className="summary-section">
          <h4>Performance Mental Media</h4>
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

        {redFlags.hasFlags && !cooldownAlreadyDone && (
          <div
            data-testid="summary-modal-flag-warning"
            className="cooldown-flag-warning"
            role="status"
          >
            Sua sessao teve sinais de fadiga/tilt. Recomendamos cool-down.
          </div>
        )}

        <div className="session-end-actions">
          {!cooldownAlreadyDone && (
            <>
              <button
                data-testid="cta-start-cooldown-quick"
                className="cooldown-cta-quick"
                onClick={handleStartQuickCooldown}
                disabled={isCreatingCooldown || isReconciling || hasMissing}
              >
                Cool-down Rapido (~3min)
              </button>
              <button
                data-testid="cta-start-cooldown"
                className={`${fullCtaClass} bg-primary text-primary-foreground`}
                onClick={handleStartFullCooldown}
                disabled={isCreatingCooldown || isReconciling || hasMissing}
              >
                Iniciar Cool-down (~5min)
              </button>
            </>
          )}

          <button
            data-testid="cta-finalize-session"
            className="end-session-btn bg-primary text-primary-foreground"
            onClick={handleFinalizeSession}
            disabled={isCreatingCooldown || isReconciling || hasMissing}
          >
            {cooldownAlreadyDone ? "Fechar" : "Finalizar Sessao"}
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
