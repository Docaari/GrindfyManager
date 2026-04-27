import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { detectRedFlags } from "@/lib/cooldownHelpers";
import type { SessionSummaryData } from './types';

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
}

export default function SessionSummaryModal({
  show,
  summaryData,
  finalNotes,
  setFinalNotes,
  onContinueSession,
  onEndSession,
  onStartFullCooldown,
  onStartQuickCooldown,
}: SessionSummaryModalProps) {
  // Hooks first (lessons-learned #1) — useState ANTES de qualquer early return.
  const [isCreatingCooldown, setIsCreatingCooldown] = useState(false);
  const { toast } = useToast();

  if (!show || !summaryData) return null;

  // Sprint Cooldown-1 (RF-01): detectRedFlags + 3 CTAs novos.
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

  const startCooldown = async (mode: "full" | "quick") => {
    if (isCreatingCooldown) return;
    setIsCreatingCooldown(true);
    try {
      let logId = "";
      if (summaryData.sessionId) {
        const result: any = await apiRequest("POST", "/api/cooldown-logs", {
          sessionId: summaryData.sessionId,
          mode,
        });
        logId = result?.id ?? "";
      } else {
        // Sem sessionId, ainda dispara o callback (caso parent gerencie).
        await apiRequest("POST", "/api/cooldown-logs", { mode });
      }
      if (mode === "full") onStartFullCooldown?.(logId);
      else onStartQuickCooldown?.(logId);
    } catch (err: any) {
      toast({ title: "Erro ao iniciar cool-down", description: err?.message });
    } finally {
      setIsCreatingCooldown(false);
    }
  };

  return (
    <div className="session-end-modal show">
      <div className="session-end-content">
        <div className="session-end-header">
          <div className="session-end-title">🏁 Resumo da Sessao</div>
          <div className="session-end-subtitle">Sua sessao de grind foi concluida</div>
        </div>

        {/* Estatisticas Principais */}
        <div className="summary-section">
          <h4>📊 Estatisticas da Sessao</h4>
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

        {/* Melhor Resultado */}
        {summaryData.bestResult && (
          <div className="summary-section">
            <h4>🏆 Melhor Resultado</h4>
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

        {/* Performance Mental */}
        <div className="summary-section">
          <h4>🧠 Performance Mental Media</h4>
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

        {/* Objetivos */}
        {summaryData.objectives && (
          <div className="summary-section">
            <h4>🎯 Objetivos da Sessao</h4>
            <div className="objectives-review">
              <div className={`objective-status objective-${summaryData.objectiveStatus}`}>
                {summaryData.objectiveStatus === 'completed' && '✅ Objetivo Cumprido'}
                {summaryData.objectiveStatus === 'partial' && '🟨 Objetivo Parcial'}
                {summaryData.objectiveStatus === 'missed' && '❌ Objetivo Perdido'}
              </div>
              <div>"{summaryData.objectives}"</div>
            </div>
          </div>
        )}

        {/* Notas Rapidas */}
        {summaryData.quickNotes && summaryData.quickNotes.length > 0 && (
          <div className="summary-section">
            <h4>📝 Notas Rapidas da Sessao</h4>
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

        {/* Notas Finais */}
        <div className="summary-section">
          <h4>📝 Notas Finais</h4>
          <div className="final-notes">
            <textarea
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              placeholder="Como foi a sessao? Principais aprendizados, ajustes para proxima vez..."
            />
          </div>
        </div>

        {/* Sprint Cooldown-1 (RF-01): mensagem warning quando red flags */}
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
          <button className="continue-session-btn" onClick={onContinueSession}>
            Continuar Sessao
          </button>

          {!cooldownAlreadyDone && (
            <>
              <button
                data-testid="summary-modal-cta-quick"
                className="cooldown-cta-quick"
                onClick={() => startCooldown("quick")}
                disabled={isCreatingCooldown}
              >
                Cool-down Rapido (~3min)
              </button>
              <button
                data-testid="summary-modal-cta-full"
                className={fullCtaClass}
                onClick={() => startCooldown("full")}
                disabled={isCreatingCooldown}
              >
                Iniciar Cool-down (~5min)
              </button>
            </>
          )}

          <button
            data-testid="summary-modal-cta-skip"
            className="end-session-btn"
            onClick={onEndSession}
          >
            {cooldownAlreadyDone ? "Fechar" : "Finalizar Sessao"}
          </button>
        </div>
      </div>
    </div>
  );
}
