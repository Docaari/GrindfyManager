import { Button } from "@/components/ui/button";

// =============================================================================
// Sprint 2 - RF-06 WizardNav
//
// Botoes Voltar / Avancar / Submit + indicador "N de M".
// Step 1: Voltar disabled (ou oculto), Submit oculto.
// Step final: Avancar oculto, Submit visivel.
// =============================================================================

export interface WizardNavProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canAdvance: boolean;
  isSubmitting?: boolean;
}

export default function WizardNav({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  canAdvance,
  isSubmitting,
}: WizardNavProps) {
  const isFirst = currentStep <= 1;
  const isLast = currentStep >= totalSteps;
  return (
    <div className="flex items-center justify-between gap-2 pt-4 border-t">
      <div>
        {!isFirst && (
          <Button
            type="button"
            variant="outline"
            data-testid="wizard-nav-back"
            onClick={onBack}
          >
            Voltar
          </Button>
        )}
      </div>
      <div data-testid="wizard-nav-step-indicator" className="text-sm text-muted-foreground">
        Etapa {currentStep} de {totalSteps}
      </div>
      <div>
        {!isLast && (
          <Button
            type="button"
            data-testid="wizard-nav-next"
            disabled={!canAdvance}
            onClick={onNext}
          >
            Avançar
          </Button>
        )}
        {isLast && (
          <Button
            type="button"
            data-testid="wizard-nav-submit"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>
    </div>
  );
}
