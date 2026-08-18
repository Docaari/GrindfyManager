import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import {
  Trophy,
  Target,
  TrendingUp,
  DollarSign,
  Award,
  Users,
  Clock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SessionHistoryData } from "./types";
import MentalEvolutionEditor, {
  type MentalEvolutionEditorHandle,
} from "./MentalEvolutionEditor";

interface LoadingButtonProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingText?: string;
  successText?: string;
  showSuccess?: boolean;
  onClick?: () => void;
  variant?: "default" | "outline";
  className?: string;
}

const LoadingButtonInline: React.FC<LoadingButtonProps> = ({
  isLoading,
  children,
  loadingText = "Salvando...",
  successText = "Salvo!",
  showSuccess = false,
  onClick,
  variant = "default",
  className = "",
  ...props
}) => {
  return (
    <Button
      disabled={isLoading}
      onClick={onClick}
      variant={variant}
      className={`transition-all duration-300 ${showSuccess ? 'button-success' : ''} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <div className="loading-spinner mr-2" />
          {loadingText}
        </>
      ) : showSuccess ? (
        <>
          <span className="success-checkmark mr-2">✅</span>
          {successText}
        </>
      ) : (
        children
      )}
    </Button>
  );
};

interface EditSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingSession: SessionHistoryData | null;
  editData: any;
  updateField: (field: string, value: any) => void;
  showFieldSaved: (fieldName: string) => void;
  setFieldError: (fieldName: string, hasError: boolean) => void;
  getFieldClassName: (fieldName: string, baseClass: string) => string;
  getSliderClassName: (fieldName: string, value: number, maxValue?: number) => string;
  savedField: string | null;
  fieldErrors: Record<string, boolean>;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  isSaving: boolean;
  showSuccess: boolean;
  onSave: () => void;
  // ADR-242 — ref para o editor de evolucao mental (draft da serie de breaks).
  mentalEvolutionRef?: React.Ref<MentalEvolutionEditorHandle>;
}

export default function EditSessionDialog({
  isOpen,
  onOpenChange,
  editingSession,
  editData,
  updateField,
  showFieldSaved,
  setFieldError,
  getFieldClassName,
  getSliderClassName,
  savedField,
  fieldErrors,
  hasUnsavedChanges,
  lastSaved,
  isSaving,
  showSuccess,
  onSave,
  mentalEvolutionRef,
}: EditSessionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="modal-container"
        role="dialog"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        aria-modal="true"
      >
        {/* Header fixo */}
        <div className="modal-header">
          <div className="header-content">
            <div>
              <h2 id="modal-title" className="modal-title">✏️ Editar Sessão</h2>
              <p id="modal-description" className="session-date">
                {editingSession && (
                  <>Sessão de {formatDate(editingSession.date)}, {editingSession.startTime || 'Horário não definido'}</>
                )}
              </p>
              {hasUnsavedChanges && (
                <div className="auto-save-indicator">
                  💾 Alterações não salvas detectadas
                </div>
              )}
              {lastSaved && (
                <div className="last-saved-indicator">
                  ✅ Último backup: {lastSaved.toLocaleTimeString()}
                </div>
              )}
            </div>
            <DialogClose className="close-btn" aria-label="Fechar modal">✕</DialogClose>
          </div>
        </div>

        {/* Body com seções */}
        <div className="modal-body">
          {editingSession && (
            <div className="space-y-6">
              {/* Seção de Métricas de Performance */}
              <div className="section">
                <h3 className="section-title">📊 Métricas de Performance</h3>
                <div className="metrics-grid">
                  <div className="metric-field">
                    <label className="field-label">👥 Volume</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        min="0"
                        value={editData.volume || 0}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          updateField('volume', value);
                          setFieldError('volume', value < 0);
                          if (value >= 0) showFieldSaved('volume');
                        }}
                        className={getFieldClassName('volume', "field-input")}
                        placeholder="Número de torneios"
                      />
                      <Users className="input-icon" />
                      {fieldErrors.volume && (
                        <span className="field-feedback-icon text-red-400">⚠️</span>
                      )}
                      {savedField === 'volume' && (
                        <span className="field-feedback-icon text-green-400">✅</span>
                      )}
                    </div>
                    <div className="field-hint">Total de torneios jogados na sessão</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">Duração (min)</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        min="0"
                        value={editData.duration ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateField('duration', raw === "" ? "" : parseInt(raw) || 0);
                          showFieldSaved('duration');
                        }}
                        className="field-input"
                        placeholder="Tempo de sessão em minutos"
                      />
                      <Clock className="input-icon" />
                      {savedField === 'duration' && (
                        <span className="field-feedback-icon text-green-400">ok</span>
                      )}
                    </div>
                    <div className="field-hint">Tempo total da sessão (minutos)</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">💰 Profit (USD)</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        step="0.01"
                        value={editData.profit || 0}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          updateField('profit', value);
                        }}
                        className="field-input"
                        placeholder="Lucro em dólares"
                      />
                      <DollarSign className="input-icon" />
                    </div>
                    <div className="field-hint">Lucro líquido (prêmios - investimento)</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">🎯 ABI Médio (USD)</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editData.abiMed || 0}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          updateField('abiMed', value);
                        }}
                        className="field-input"
                        placeholder="Buy-in médio"
                      />
                      <Target className="input-icon" />
                    </div>
                    <div className="field-hint">Buy-in médio dos torneios</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">📈 ROI (%)</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        step="0.1"
                        value={editData.roi ?? ''}
                        onChange={(e) => {
                          // ADR-244 D4: campo vazio significa "sem ROI" (null),
                          // nunca 0 — zero inventado mente no historico.
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            updateField('roi', null);
                            return;
                          }
                          const value = parseFloat(raw);
                          updateField('roi', Number.isFinite(value) ? value : null);
                        }}
                        className="field-input"
                        placeholder="Sem ROI registrado"
                      />
                      <TrendingUp className="input-icon" />
                    </div>
                    <div className="field-hint">Retorno sobre investimento</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">🏆 Final Tables</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        min="0"
                        max={editData.volume || 999}
                        value={editData.fts || 0}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          updateField('fts', value);
                        }}
                        className="field-input"
                        placeholder="Mesas finais"
                      />
                      <Trophy className="input-icon" />
                    </div>
                    <div className="field-hint">Quantidade de mesas finais alcançadas</div>
                  </div>

                  <div className="metric-field">
                    <label className="field-label">👑 Cravadas</label>
                    <div className="input-with-icon">
                      <Input
                        type="number"
                        min="0"
                        max={editData.fts || 999}
                        value={editData.cravadas || 0}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          updateField('cravadas', value);
                        }}
                        className="field-input"
                        placeholder="Vitórias"
                      />
                      <Award className="input-icon" />
                    </div>
                    <div className="field-hint">Torneios vencidos (1º lugar)</div>
                  </div>
                </div>

                {/* Indicadores de validação */}
                <div className="validation-indicators">
                  {editData.fts > editData.volume && (
                    <div className="validation-error">
                      ⚠️ Final Tables não pode ser maior que o Volume
                    </div>
                  )}
                  {editData.cravadas > editData.fts && (
                    <div className="validation-error">
                      ⚠️ Cravadas não pode ser maior que Final Tables
                    </div>
                  )}
                </div>
              </div>

              {/* Seção de Estado Mental — ADR-242: serie editavel + medias derivadas */}
              <div className="section">
                <h3 className="section-title">Estado Mental (evolucao por medicao)</h3>
                {editingSession?.id ? (
                  <MentalEvolutionEditor
                    ref={mentalEvolutionRef}
                    sessionId={editingSession.id}
                  />
                ) : null}
              </div>

              {/* Seção de Notas e Objetivos */}
              <div className="section">
                <h3 className="section-title">📝 Notas e Objetivos</h3>
                <div className="notes-section">
                  <div className="textarea-field">
                    <label className="field-label">📋 Notas de Preparação</label>
                    <Textarea
                      value={editData.preparationNotes || ""}
                      onChange={(e) => updateField('preparationNotes', e.target.value)}
                      placeholder="Notas sobre a preparação da sessão..."
                      maxLength={500}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.preparationNotes || "").length}/500
                    </div>
                  </div>

                  <div className="textarea-field">
                    <label className="field-label">🎯 Objetivos do Dia</label>
                    <Textarea
                      value={editData.dailyGoals || ""}
                      onChange={(e) => updateField('dailyGoals', e.target.value)}
                      placeholder="Quais eram os objetivos para esta sessão?"
                      maxLength={300}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.dailyGoals || "").length}/300
                    </div>
                  </div>

                  <div className="textarea-field">
                    <label className="field-label">📖 Notas Finais</label>
                    <Textarea
                      value={editData.finalNotes || ""}
                      onChange={(e) => updateField('finalNotes', e.target.value)}
                      placeholder="Reflexões, aprendizados e observações da sessão..."
                      maxLength={1000}
                      className="field-textarea"
                    />
                    <div className="char-counter">
                      {(editData.finalNotes || "").length}/1000
                    </div>
                  </div>

                  <div className="objective-toggle">
                    <label className="field-label">✅ Objetivos Cumpridos?</label>
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="checkbox"
                        id="objectiveCompleted"
                        checked={editData.objectiveCompleted || false}
                        onChange={(e) => updateField('objectiveCompleted', e.target.checked)}
                        className="objective-checkbox"
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="objectiveCompleted" className="objective-label">
                        <span className="checkbox-icon">
                          {editData.objectiveCompleted ? '✅' : '⬜'}
                        </span>
                        <span className="objective-text">
                          {editData.objectiveCompleted ? 'Objetivos foram cumpridos' : 'Objetivos não foram cumpridos'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer fixo */}
        <div className="modal-actions">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            ❌ Cancelar
          </Button>
          <LoadingButtonInline
            isLoading={isSaving}
            showSuccess={showSuccess}
            onClick={onSave}
            loadingText="💾 Salvando..."
            successText="✅ Salvo com sucesso!"
          >
            💾 Salvar Alterações
          </LoadingButtonInline>
        </div>
      </DialogContent>
    </Dialog>
  );
}
