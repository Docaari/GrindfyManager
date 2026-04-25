import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SATELLITE_REWARD_TYPES } from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06 SatelliteFieldsBlock
//
// Campos:
//   - satelliteRewardType: Select (ticket/package/cash/mixed)
//   - satelliteTargetTemplateId: Combobox dos templates do user (autocomplete via useQuery)
//   - satelliteTargetName: Input texto livre (fallback)
//   - satelliteTicketValue: Input number
//   - satelliteExtraCash: Input number
//   - Quando rewardType=package: liberta os 5 campos package_* + notes
//
// Hint: "Adicione o torneio destino para ver ROI consolidado" quando target ausente.
// =============================================================================

export interface SatelliteFieldsValue {
  satelliteRewardType: string | null;
  satelliteTargetTemplateId: string | null;
  satelliteTargetName: string;
  satelliteTicketValue: string;
  satelliteExtraCash: string;
  packageBuyIn: string;
  packageAccommodation: string;
  packageTravel: string;
  packageMeals: string;
  packageOther: string;
  packageNotes: string;
}

export interface SatelliteFieldsBlockProps {
  value: SatelliteFieldsValue;
  onChange: (next: SatelliteFieldsValue) => void;
}

export default function SatelliteFieldsBlock({ value, onChange }: SatelliteFieldsBlockProps) {
  const set = (patch: Partial<SatelliteFieldsValue>) => onChange({ ...value, ...patch });

  // Templates do user para autocomplete do target. Empty array fallback se sem dados.
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/tournament-templates"],
    queryFn: async () => {
      const res = await fetch("/api/tournament-templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const isPackage = value.satelliteRewardType === "package";
  const hasTarget =
    (value.satelliteTargetTemplateId && value.satelliteTargetTemplateId.length > 0) ||
    (value.satelliteTargetName && value.satelliteTargetName.length > 0);

  return (
    <div data-testid="wizard-step3-satellite-block" className="space-y-4 rounded-md border border-amber-300 dark:border-amber-700 p-4 bg-amber-50/40 dark:bg-amber-950/20">
      <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">
        Campos do Satélite
      </div>

      {/* Reward type */}
      <div>
        <Label htmlFor="wizard-satellite-reward-type">Tipo de prêmio</Label>
        <select
          id="wizard-satellite-reward-type"
          data-testid="wizard-satellite-reward-type"
          value={value.satelliteRewardType ?? ""}
          onChange={(e) => set({ satelliteRewardType: e.target.value || null })}
          className="w-full p-2 bg-background border rounded-md"
        >
          <option value="">Selecione…</option>
          {SATELLITE_REWARD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Target template (autocomplete dos templates) */}
      <div>
        <Label htmlFor="wizard-satellite-target-template-id">Torneio destino (biblioteca)</Label>
        <input
          id="wizard-satellite-target-template-id"
          data-testid="wizard-satellite-target-template-id"
          list="wizard-satellite-target-templates"
          value={value.satelliteTargetTemplateId ?? ""}
          onChange={(e) => set({ satelliteTargetTemplateId: e.target.value || null })}
          className="w-full p-2 bg-background border rounded-md"
          placeholder="Buscar nos seus templates"
        />
        <datalist id="wizard-satellite-target-templates">
          {templates.map((tpl: any) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </datalist>
      </div>

      {/* Target name (fallback) */}
      <div>
        <Label htmlFor="wizard-satellite-target-name">Nome do torneio destino</Label>
        <Input
          id="wizard-satellite-target-name"
          data-testid="wizard-satellite-target-name"
          value={value.satelliteTargetName}
          onChange={(e) => set({ satelliteTargetName: e.target.value })}
          placeholder="Sunday Million, WCOOP Main, etc. (Outro)"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wizard-satellite-ticket-value">Valor do ticket</Label>
          <Input
            id="wizard-satellite-ticket-value"
            data-testid="wizard-satellite-ticket-value"
            type="number"
            step="0.01"
            value={value.satelliteTicketValue}
            onChange={(e) => set({ satelliteTicketValue: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label htmlFor="wizard-satellite-extra-cash">Cash extra</Label>
          <Input
            id="wizard-satellite-extra-cash"
            data-testid="wizard-satellite-extra-cash"
            type="number"
            step="0.01"
            value={value.satelliteExtraCash}
            onChange={(e) => set({ satelliteExtraCash: e.target.value })}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Hint */}
      {!hasTarget && (
        <p
          data-testid="wizard-satellite-target-hint"
          className="text-sm text-amber-700 dark:text-amber-300 bg-amber-100/40 dark:bg-amber-900/30 rounded-md p-2"
        >
          Adicione o torneio destino para ver ROI consolidado
        </p>
      )}

      {/* Package fields (so quando rewardType=package) */}
      {isPackage && (
        <div className="space-y-3 border-t pt-3 mt-2">
          <div className="text-sm font-medium">Detalhes do pacote</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="wizard-satellite-package-buyIn">Buy-in do destino</Label>
              <Input
                id="wizard-satellite-package-buyIn"
                data-testid="wizard-satellite-package-buyIn"
                type="number"
                step="0.01"
                value={value.packageBuyIn}
                onChange={(e) => set({ packageBuyIn: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="wizard-satellite-package-accommodation">Hospedagem</Label>
              <Input
                id="wizard-satellite-package-accommodation"
                data-testid="wizard-satellite-package-accommodation"
                type="number"
                step="0.01"
                value={value.packageAccommodation}
                onChange={(e) => set({ packageAccommodation: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="wizard-satellite-package-travel">Viagem</Label>
              <Input
                id="wizard-satellite-package-travel"
                data-testid="wizard-satellite-package-travel"
                type="number"
                step="0.01"
                value={value.packageTravel}
                onChange={(e) => set({ packageTravel: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="wizard-satellite-package-meals">Alimentação</Label>
              <Input
                id="wizard-satellite-package-meals"
                data-testid="wizard-satellite-package-meals"
                type="number"
                step="0.01"
                value={value.packageMeals}
                onChange={(e) => set({ packageMeals: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="wizard-satellite-package-other">Outros</Label>
              <Input
                id="wizard-satellite-package-other"
                data-testid="wizard-satellite-package-other"
                type="number"
                step="0.01"
                value={value.packageOther}
                onChange={(e) => set({ packageOther: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="wizard-satellite-package-notes">Observações</Label>
            <Textarea
              id="wizard-satellite-package-notes"
              data-testid="wizard-satellite-package-notes"
              value={value.packageNotes}
              onChange={(e) => set({ packageNotes: e.target.value })}
              placeholder="Detalhes do pacote (cidade, data, etc.)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
