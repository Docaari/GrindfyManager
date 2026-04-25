import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// =============================================================================
// Sprint 2 - RF-06 Step 2: Modificadores
//
// 2 checkboxes ortogonais (isFlight, isLive). Estado: { isFlight, isLive }.
// =============================================================================

export interface WizardStep2Value {
  isFlight: boolean;
  isLive: boolean;
}

export interface WizardStep2ModifiersProps {
  value: WizardStep2Value;
  onChange: (next: WizardStep2Value) => void;
}

export default function WizardStep2Modifiers({ value, onChange }: WizardStep2ModifiersProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="wizard-step2-isFlight"
          data-testid="wizard-step2-isFlight"
          checked={value.isFlight}
          onCheckedChange={(checked) =>
            onChange({ ...value, isFlight: checked === true })
          }
        />
        <Label htmlFor="wizard-step2-isFlight" className="cursor-pointer">
          <span className="font-medium">É Flight (multi-dia)</span>
          <p className="text-sm text-muted-foreground mt-0.5">
            Torneios que acontecem em multiplos dias (Day 1A/1B, Day 2, Final).
          </p>
        </Label>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="wizard-step2-isLive"
          data-testid="wizard-step2-isLive"
          checked={value.isLive}
          onCheckedChange={(checked) =>
            onChange({ ...value, isLive: checked === true })
          }
        />
        <Label htmlFor="wizard-step2-isLive" className="cursor-pointer">
          <span className="font-medium">É Live (presencial)</span>
          <p className="text-sm text-muted-foreground mt-0.5">
            Torneios presenciais (BSOP, WSOP, satélites para eventos live).
          </p>
        </Label>
      </div>
    </div>
  );
}
