import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// =============================================================================
// Sprint 2 - RF-06 LiveFieldsBlock
//
// 5 campos package_* opcionais + packageNotes (textarea) + total agregado.
// =============================================================================

export interface LiveFieldsValue {
  packageBuyIn: string;
  packageAccommodation: string;
  packageTravel: string;
  packageMeals: string;
  packageOther: string;
  packageNotes: string;
}

export interface LiveFieldsBlockProps {
  value: LiveFieldsValue;
  onChange: (next: LiveFieldsValue) => void;
}

function toNum(v: string): number {
  if (!v) return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

export default function LiveFieldsBlock({ value, onChange }: LiveFieldsBlockProps) {
  const set = (patch: Partial<LiveFieldsValue>) => onChange({ ...value, ...patch });

  const total =
    toNum(value.packageBuyIn) +
    toNum(value.packageAccommodation) +
    toNum(value.packageTravel) +
    toNum(value.packageMeals) +
    toNum(value.packageOther);

  return (
    <div
      data-testid="wizard-step3-live-block"
      className="space-y-4 rounded-md border border-emerald-300 dark:border-emerald-700 p-4 bg-emerald-50/40 dark:bg-emerald-950/20"
    >
      <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        Pacote Live (presencial)
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wizard-live-package-buyIn">Buy-in</Label>
          <Input
            id="wizard-live-package-buyIn"
            data-testid="wizard-live-package-buyIn"
            type="number"
            step="0.01"
            value={value.packageBuyIn}
            onChange={(e) => set({ packageBuyIn: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wizard-live-package-accommodation">Hospedagem</Label>
          <Input
            id="wizard-live-package-accommodation"
            data-testid="wizard-live-package-accommodation"
            type="number"
            step="0.01"
            value={value.packageAccommodation}
            onChange={(e) => set({ packageAccommodation: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wizard-live-package-travel">Viagem</Label>
          <Input
            id="wizard-live-package-travel"
            data-testid="wizard-live-package-travel"
            type="number"
            step="0.01"
            value={value.packageTravel}
            onChange={(e) => set({ packageTravel: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="wizard-live-package-meals">Alimentação</Label>
          <Input
            id="wizard-live-package-meals"
            data-testid="wizard-live-package-meals"
            type="number"
            step="0.01"
            value={value.packageMeals}
            onChange={(e) => set({ packageMeals: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="wizard-live-package-other">Outros</Label>
          <Input
            id="wizard-live-package-other"
            data-testid="wizard-live-package-other"
            type="number"
            step="0.01"
            value={value.packageOther}
            onChange={(e) => set({ packageOther: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="wizard-live-package-notes">Observações</Label>
        <Textarea
          id="wizard-live-package-notes"
          data-testid="wizard-live-package-notes"
          value={value.packageNotes}
          onChange={(e) => set({ packageNotes: e.target.value })}
          placeholder="Detalhes do pacote (cidade, data, contato local, etc.)"
        />
      </div>

      <p
        data-testid="wizard-live-package-total"
        className="text-sm text-emerald-700 dark:text-emerald-300 font-medium"
      >
        Total estimado: ${total.toFixed(2)}
      </p>
    </div>
  );
}
