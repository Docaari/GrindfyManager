import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import {
  Trophy,
  Target,
  TrendingUp,
  DollarSign,
  Award,
  Users,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SessionHistoryData } from "./types";

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
                        value={editData.roi || 0}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          updateField('roi', value);
                        }}
                        className="field-input"
                        placeholder="Return on Investment"
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

              {/* Seção de Estado Mental */}
              <div className="section">
                <h3 className="section-title">🧠 Estado Mental (1-10)</h3>
                <div className="mental-grid">
                  <div className="mental-field">
                    <label className="field-label">⚡ Energia</label>
                    <div className={getSliderClassName('energiaMedia', editData.energiaMedia || 5)}>
                      <Slider
                        value={[editData.energiaMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('energiaMedia', value);
                          showFieldSaved('energiaMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.energiaMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Cansado</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Energizado</span>
                    </div>
                  </div>

                  <div className="mental-field">
                    <label className="field-label">🎯 Foco</label>
                    <div className={getSliderClassName('focoMedio', editData.focoMedio || 5)}>
                      <Slider
                        value={[editData.focoMedio || 5]}
                        onValueChange={([value]) => {
                          updateField('focoMedio', value);
                          showFieldSaved('focoMedio');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.focoMedio || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Disperso</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Focado</span>
                    </div>
                  </div>

                  <div className="mental-field">
                    <label className="field-label">💪 Confiança</label>
                    <div className={getSliderClassName('confiancaMedia', editData.confiancaMedia || 5)}>
                      <Slider
                        value={[editData.confiancaMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('confiancaMedia', value);
                          showFieldSaved('confiancaMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.confiancaMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Inseguro</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Confiante</span>
                    </div>
                  </div>

                  <div className="mental-field">
                    <label className="field-label">🧠 Int. Emocional</label>
                    <div className={getSliderClassName('inteligenciaEmocionalMedia', editData.inteligenciaEmocionalMedia || 5)}>
                      <Slider
                        value={[editData.inteligenciaEmocionalMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('inteligenciaEmocionalMedia', value);
                          showFieldSaved('inteligenciaEmocionalMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.inteligenciaEmocionalMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Reativo</span>
                      <span className="text-xs text-gray-500">Neutro</span>
                      <span className="text-xs text-gray-500">Controlado</span>
                    </div>
                  </div>

                  <div className="mental-field">
                    <label className="field-label">📱 Interferências</label>
                    <div className={getSliderClassName('interferenciasMedia', editData.interferenciasMedia || 5)}>
                      <Slider
                        value={[editData.interferenciasMedia || 5]}
                        onValueChange={([value]) => {
                          updateField('interferenciasMedia', value);
                          showFieldSaved('interferenciasMedia');
                        }}
                        max={10}
                        min={1}
                        step={1}
                        className="mental-slider"
                      />
                      <div className="slider-value">
                        {editData.interferenciasMedia || 5}
                      </div>
                    </div>
                    <div className="slider-indicators">
                      <span className="text-xs text-gray-500">Muitas</span>
                      <span className="text-xs text-gray-500">Algumas</span>
                      <span className="text-xs text-gray-500">Nenhuma</span>
                    </div>
                  </div>
                </div>
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
