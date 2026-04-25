import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// =============================================================================
// Sprint 2 - RF-06 Step 4: Campos comuns
//
// Campos: site, time, buyIn, name, guaranteed, position, prize, fieldSize.
// Add-on / Re-entry em collapse (toggle).
// =============================================================================

export interface WizardStep4Value {
  site: string;
  time: string;
  buyIn: string;
  name: string;
  guaranteed: string;
  position: number | null;
  prize: string;
  fieldSize: string;
  allowsAddOn: boolean;
  addOnCost: string;
  allowsReentry: boolean;
  maxReentries: number | null;
}

export interface WizardStep4CommonProps {
  value: WizardStep4Value;
  onChange: (next: WizardStep4Value) => void;
}

export default function WizardStep4Common({ value, onChange }: WizardStep4CommonProps) {
  const set = (patch: Partial<WizardStep4Value>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wizard-step4-site">Site</Label>
          <Input
            id="wizard-step4-site"
            data-testid="wizard-step4-site"
            value={value.site}
            onChange={(e) => set({ site: e.target.value })}
            placeholder="PokerStars"
          />
        </div>
        <div>
          <Label htmlFor="wizard-step4-time">Horário</Label>
          <Input
            id="wizard-step4-time"
            data-testid="wizard-step4-time"
            type="time"
            value={value.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wizard-step4-buyIn">Buy-in</Label>
          <Input
            id="wizard-step4-buyIn"
            data-testid="wizard-step4-buyIn"
            type="number"
            step="0.01"
            value={value.buyIn}
            onChange={(e) => set({ buyIn: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label htmlFor="wizard-step4-guaranteed">Garantido</Label>
          <Input
            id="wizard-step4-guaranteed"
            data-testid="wizard-step4-guaranteed"
            type="number"
            step="0.01"
            value={value.guaranteed}
            onChange={(e) => set({ guaranteed: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="wizard-step4-name">Nome (opcional)</Label>
        <Input
          id="wizard-step4-name"
          data-testid="wizard-step4-name"
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Deixe vazio para gerar automaticamente"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wizard-step4-position">Posição (resultado)</Label>
          <Input
            id="wizard-step4-position"
            data-testid="wizard-step4-position"
            type="number"
            value={value.position == null ? "" : String(value.position)}
            onChange={(e) =>
              set({ position: e.target.value === "" ? null : parseInt(e.target.value, 10) })
            }
            placeholder="—"
          />
        </div>
        <div>
          <Label htmlFor="wizard-step4-prize">Prêmio</Label>
          <Input
            id="wizard-step4-prize"
            data-testid="wizard-step4-prize"
            type="number"
            step="0.01"
            value={value.prize}
            onChange={(e) => set({ prize: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="wizard-step4-fieldSize">Tamanho do field</Label>
        <Input
          id="wizard-step4-fieldSize"
          data-testid="wizard-step4-fieldSize"
          type="number"
          value={value.fieldSize}
          onChange={(e) => set({ fieldSize: e.target.value })}
          placeholder="0"
        />
      </div>

      {/* Add-on collapse */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="wizard-step4-toggle-addon">Permite Add-on?</Label>
          <Switch
            id="wizard-step4-toggle-addon"
            data-testid="wizard-step4-toggle-addon"
            checked={value.allowsAddOn}
            onCheckedChange={(checked) => set({ allowsAddOn: checked === true })}
          />
        </div>
        {value.allowsAddOn && (
          <div className="mt-2">
            <Label htmlFor="wizard-step4-addon-cost">Custo do Add-on</Label>
            <Input
              id="wizard-step4-addon-cost"
              data-testid="wizard-step4-addon-cost"
              type="number"
              step="0.01"
              value={value.addOnCost}
              onChange={(e) => set({ addOnCost: e.target.value })}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      {/* Re-entry collapse */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="wizard-step4-toggle-reentry">Permite Re-entry?</Label>
          <Switch
            id="wizard-step4-toggle-reentry"
            data-testid="wizard-step4-toggle-reentry"
            checked={value.allowsReentry}
            onCheckedChange={(checked) => set({ allowsReentry: checked === true })}
          />
        </div>
        {value.allowsReentry && (
          <div className="mt-2">
            <Label htmlFor="wizard-step4-max-reentries">Máximo de re-entries</Label>
            <Input
              id="wizard-step4-max-reentries"
              data-testid="wizard-step4-max-reentries"
              type="number"
              value={value.maxReentries == null ? "" : String(value.maxReentries)}
              onChange={(e) =>
                set({
                  maxReentries: e.target.value === "" ? null : parseInt(e.target.value, 10),
                })
              }
              placeholder="ilimitado"
            />
          </div>
        )}
      </div>
    </div>
  );
}
