import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputField } from "@/components/InputField";
import { MentalSlider } from "@/components/MentalSlider";
import { TextareaField } from "@/components/TextareaField";

interface RegisterSessionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  registerSessionForm: any;
  onRegisterSession: (formData: any) => void;
}

export default function RegisterSessionDialog({
  isOpen,
  onOpenChange,
  registerSessionForm,
  onRegisterSession,
}: RegisterSessionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="register-session-popup bg-gray-900 border-gray-700 text-white max-w-5xl max-h-[95vh] overflow-y-auto">
        {/* Header Otimizado */}
        <DialogHeader className="pb-4 border-b border-gray-700">
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="text-2xl">📋</span>
            Registrar Sessão Passada
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-base">
            Registre os resultados de uma sessão que já aconteceu para manter seu histórico completo
          </DialogDescription>
        </DialogHeader>

        {/* Layout Responsivo com Cards */}
        <div className="register-session-grid grid grid-cols-1 lg:grid-cols-2 gap-6 py-6">

          {/* Card 1: Informações Básicas */}
          <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
            <div className="card-header flex items-center gap-3 mb-4">
              <div className="icon-container bg-blue-500/20 p-2 rounded-lg">
                <span className="text-xl">📅</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Informações Básicas</h3>
                <p className="text-sm text-gray-400">Data e duração da sessão</p>
              </div>
            </div>

            <div className="space-y-4">
              <InputField
                label="Data da Sessão"
                icon="🗓️"
                type="date"
                value={registerSessionForm.formData.date}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('date', value);
                  registerSessionForm.touchField('date');
                }}
                required
                tabIndex={1}
                hasError={registerSessionForm.hasFieldError('date')}
                isValid={registerSessionForm.isFieldValid('date')}
                isTouched={registerSessionForm.validationState.touchedFields.has('date')}
                errorMessage={registerSessionForm.getFieldError('date')}
                onEnter={() => document.getElementById('duration-field')?.focus()}
              />

              <InputField
                label="Duração"
                icon="⏱️"
                type="text"
                placeholder="Ex: 4h 30min"
                value={registerSessionForm.formData.duration}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('duration', value);
                  registerSessionForm.touchField('duration');
                }}
                required
                tabIndex={2}
                hasError={registerSessionForm.hasFieldError('duration')}
                isValid={registerSessionForm.isFieldValid('duration')}
                isTouched={registerSessionForm.validationState.touchedFields.has('duration')}
                errorMessage={registerSessionForm.getFieldError('duration')}
                onEnter={() => document.getElementById('volume-field')?.focus()}
              />
            </div>
          </div>

          {/* Card 2: Métricas de Performance */}
          <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
            <div className="card-header flex items-center gap-3 mb-4">
              <div className="icon-container bg-green-500/20 p-2 rounded-lg">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Métricas de Performance</h3>
                <p className="text-sm text-gray-400">Volume, lucro e estatísticas</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Volume"
                icon="🎯"
                type="number"
                value={registerSessionForm.formData.volume}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('volume', Number(value) || 0);
                  registerSessionForm.touchField('volume');
                }}
                required
                tabIndex={3}
                hasError={registerSessionForm.hasFieldError('volume')}
                isValid={registerSessionForm.isFieldValid('volume')}
                isTouched={registerSessionForm.validationState.touchedFields.has('volume')}
                errorMessage={registerSessionForm.getFieldError('volume')}
                onEnter={() => document.getElementById('profit-field')?.focus()}
              />

              <InputField
                label="Lucro ($)"
                icon="💰"
                type="number"
                step="0.01"
                value={registerSessionForm.formData.profit}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('profit', Number(value) || 0);
                  registerSessionForm.touchField('profit');
                }}
                required
                tabIndex={4}
                hasError={registerSessionForm.hasFieldError('profit')}
                isValid={registerSessionForm.isFieldValid('profit')}
                isTouched={registerSessionForm.validationState.touchedFields.has('profit')}
                errorMessage={registerSessionForm.getFieldError('profit')}
                onEnter={() => document.getElementById('abi-field')?.focus()}
              />

              <InputField
                label="ABI Médio ($)"
                icon="💵"
                type="number"
                step="0.01"
                value={registerSessionForm.formData.abiMed}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('abiMed', Number(value) || 0);
                  registerSessionForm.touchField('abiMed');
                }}
                required
                tabIndex={5}
                hasError={registerSessionForm.hasFieldError('abiMed')}
                isValid={registerSessionForm.isFieldValid('abiMed')}
                isTouched={registerSessionForm.validationState.touchedFields.has('abiMed')}
                errorMessage={registerSessionForm.getFieldError('abiMed')}
                onEnter={() => document.getElementById('roi-field')?.focus()}
              />

              <div className="relative">
                <InputField
                  label="ROI (%) - Calculado"
                  icon="📈"
                  type="number"
                  step="0.01"
                  value={registerSessionForm.formData.roi}
                  onChange={() => {}}
                  tabIndex={6}
                  hasError={false}
                  isValid={true}
                  isTouched={true}
                  errorMessage=""
                  onEnter={() => document.getElementById('fts-field')?.focus()}
                />
                <div className="absolute top-0 right-0 bg-green-600 text-white text-xs px-2 py-1 rounded-bl-md font-medium">
                  AUTO
                </div>
              </div>

              <InputField
                label="Final Tables"
                icon="🏆"
                type="number"
                value={registerSessionForm.formData.fts}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('fts', Number(value) || 0);
                  registerSessionForm.touchField('fts');
                }}
                tabIndex={7}
                hasError={registerSessionForm.hasFieldError('fts')}
                isValid={registerSessionForm.isFieldValid('fts')}
                isTouched={registerSessionForm.validationState.touchedFields.has('fts')}
                errorMessage={registerSessionForm.getFieldError('fts')}
                onEnter={() => document.getElementById('cravadas-field')?.focus()}
              />

              <InputField
                label="Cravadas"
                icon="🎖️"
                type="number"
                value={registerSessionForm.formData.cravadas}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('cravadas', Number(value) || 0);
                  registerSessionForm.touchField('cravadas');
                }}
                tabIndex={8}
                hasError={registerSessionForm.hasFieldError('cravadas')}
                isValid={registerSessionForm.isFieldValid('cravadas')}
                isTouched={registerSessionForm.validationState.touchedFields.has('cravadas')}
                errorMessage={registerSessionForm.getFieldError('cravadas')}
                onEnter={() => document.getElementById('energia-field')?.focus()}
              />
            </div>
          </div>

          {/* Card 3: Estado Mental */}
          <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
            <div className="card-header flex items-center gap-3 mb-4">
              <div className="icon-container bg-purple-500/20 p-2 rounded-lg">
                <span className="text-xl">🧠</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Estado Mental</h3>
                <p className="text-sm text-gray-400">Avaliação dos aspectos mentais</p>
              </div>
            </div>

            <div className="space-y-5">
              <MentalSlider
                label="Energia"
                icon="⚡"
                value={registerSessionForm.formData.energiaMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('energiaMedia', value);
                  registerSessionForm.touchField('energiaMedia');
                }}
                tabIndex={9}
                onEnter={() => document.getElementById('foco-field')?.focus()}
              />

              <MentalSlider
                label="Foco"
                icon="🎯"
                value={registerSessionForm.formData.focoMedio}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('focoMedio', value);
                  registerSessionForm.touchField('focoMedio');
                }}
                tabIndex={10}
                onEnter={() => document.getElementById('confianca-field')?.focus()}
              />

              <MentalSlider
                label="Confiança"
                icon="💪"
                value={registerSessionForm.formData.confiancaMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('confiancaMedia', value);
                  registerSessionForm.touchField('confiancaMedia');
                }}
                tabIndex={11}
                onEnter={() => document.getElementById('emocional-field')?.focus()}
              />

              <MentalSlider
                label="Int. Emocional"
                icon="🎭"
                value={registerSessionForm.formData.inteligenciaEmocionalMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('inteligenciaEmocionalMedia', value);
                  registerSessionForm.touchField('inteligenciaEmocionalMedia');
                }}
                tabIndex={12}
                onEnter={() => document.getElementById('interferencias-field')?.focus()}
              />

              <MentalSlider
                label="Interferências"
                icon="📱"
                value={registerSessionForm.formData.interferenciasMedia}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('interferenciasMedia', value);
                  registerSessionForm.touchField('interferenciasMedia');
                }}
                tabIndex={13}
                onEnter={() => document.getElementById('prep-notes-field')?.focus()}
              />
            </div>
          </div>

          {/* Card 4: Notas e Objetivos */}
          <div className="register-card bg-gray-800 border border-gray-700 p-6 rounded-xl">
            <div className="card-header flex items-center gap-3 mb-4">
              <div className="icon-container bg-orange-500/20 p-2 rounded-lg">
                <span className="text-xl">📝</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Notas e Objetivos</h3>
                <p className="text-sm text-gray-400">Preparação, objetivos e reflexões</p>
              </div>
            </div>

            <div className="space-y-4">
              <TextareaField
                label="Notas de Preparação"
                icon="🎯"
                value={registerSessionForm.formData.preparationNotes}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('preparationNotes', value);
                  registerSessionForm.touchField('preparationNotes');
                }}
                placeholder="Como você se preparou para esta sessão?"
                rows={3}
                tabIndex={14}
                maxLength={300}
                hasError={registerSessionForm.hasFieldError('preparationNotes')}
                isValid={registerSessionForm.isFieldValid('preparationNotes')}
                isTouched={registerSessionForm.validationState.touchedFields.has('preparationNotes')}
                errorMessage={registerSessionForm.getFieldError('preparationNotes')}
                onEnter={() => document.getElementById('goals-field')?.focus()}
              />

              <InputField
                label="Objetivos do Dia"
                icon="🎪"
                type="text"
                value={registerSessionForm.formData.dailyGoals}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('dailyGoals', value);
                  registerSessionForm.touchField('dailyGoals');
                }}
                placeholder="Quais eram seus objetivos?"
                tabIndex={15}
                hasError={registerSessionForm.hasFieldError('dailyGoals')}
                isValid={registerSessionForm.isFieldValid('dailyGoals')}
                isTouched={registerSessionForm.validationState.touchedFields.has('dailyGoals')}
                errorMessage={registerSessionForm.getFieldError('dailyGoals')}
                onEnter={() => document.getElementById('notes-field')?.focus()}
              />

              <TextareaField
                label="Notas Finais"
                icon="💭"
                value={registerSessionForm.formData.finalNotes}
                onChange={(value) => {
                  registerSessionForm.handleFieldChange('finalNotes', value);
                  registerSessionForm.touchField('finalNotes');
                }}
                placeholder="Reflexões sobre a sessão, aprendizados, etc."
                rows={3}
                tabIndex={16}
                maxLength={500}
                hasError={registerSessionForm.hasFieldError('finalNotes')}
                isValid={registerSessionForm.isFieldValid('finalNotes')}
                isTouched={registerSessionForm.validationState.touchedFields.has('finalNotes')}
                errorMessage={registerSessionForm.getFieldError('finalNotes')}
                onEnter={() => document.getElementById('objective-checkbox')?.focus()}
              />

              <div className="field-group">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="objective-completed"
                    checked={registerSessionForm.formData.objectiveCompleted}
                    onChange={(e) => {
                      registerSessionForm.handleFieldChange('objectiveCompleted', e.target.checked);
                      registerSessionForm.touchField('objectiveCompleted');
                    }}
                    className="w-4 h-4 text-[#16a249] bg-gray-700 border-gray-600 rounded focus:ring-[#16a249] focus:ring-2"
                    tabIndex={17}
                  />
                  <Label htmlFor="objective-completed" className="text-gray-300 font-medium flex items-center gap-2 cursor-pointer">
                    <span className="text-sm">✅</span>
                    Objetivo do dia foi cumprido
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer com botões */}
        <div className="register-footer flex justify-between items-center pt-6 border-t border-gray-700">
          <Button
            variant="outline"
            onClick={() => registerSessionForm.resetMentalValues()}
            className="border-yellow-600 hover:bg-yellow-700/20 text-yellow-400 px-4 py-2 font-medium"
          >
            Resetar Valores Mentais
          </Button>
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-gray-600 hover:bg-gray-700 text-white px-6"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => registerSessionForm.handleSubmit(onRegisterSession)}
              disabled={registerSessionForm.isSubmitting || !registerSessionForm.isValid}
              className={`px-6 font-medium transition-all duration-200 ${
                registerSessionForm.isValid
                  ? 'bg-[#16a249] hover:bg-[#128a3e] text-white'
                  : 'bg-gray-600 cursor-not-allowed text-gray-300'
              }`}
            >
              {registerSessionForm.isSubmitting ? "Registrando..." : "Registrar Sessão"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
