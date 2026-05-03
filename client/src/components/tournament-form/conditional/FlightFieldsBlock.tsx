import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

// =============================================================================
// Sprint Flight-1 H6 (Reviewer R1) — refator pra usar tournament_series API.
//
// Substitui flags ADR-031 deprecadas (flightDay/flightAdvanced/flightParentId)
// por:
//   - seriesId: FK para tournament_series (linkar a serie existente)
//   - baggedAt: timestamp de quando bagged (substitui flightAdvanced=true)
//
// Founder pode:
//   1. Linkar a serie existente (dropdown busca /api/tournament-series)
//   2. Marcar "bagged" (checkbox)
//   3. Pra criar serie nova: usa tela /flight (BackfillSeriesDialog)
//
// data-testid:
//   - wizard-flight-series-id
//   - wizard-flight-bagged
//   - wizard-flight-series-empty-hint
// =============================================================================

export interface FlightFieldsValue {
  seriesId: string | null;
  baggedAt: Date | null;
}

export interface FlightFieldsBlockProps {
  value: FlightFieldsValue;
  onChange: (next: FlightFieldsValue) => void;
}

export default function FlightFieldsBlock({ value, onChange }: FlightFieldsBlockProps) {
  const set = (patch: Partial<FlightFieldsValue>) => onChange({ ...value, ...patch });

  const { data: series = [] } = useQuery<any[]>({
    queryKey: ["tournament-series"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/tournament-series");
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  return (
    <div
      data-testid="wizard-step3-flight-block"
      className="space-y-4 rounded-md border border-cyan-300 dark:border-cyan-700 bg-cyan-50/40 dark:bg-cyan-950/20 p-4"
    >
      <div className="text-sm font-semibold">Flight (multi-dia)</div>

      <div>
        <Label htmlFor="wizard-flight-series-id">Linkar a uma série existente</Label>
        <select
          id="wizard-flight-series-id"
          data-testid="wizard-flight-series-id"
          value={value.seriesId ?? ""}
          onChange={(e) => set({ seriesId: e.target.value || null })}
          className="w-full p-2 bg-background border rounded-md"
        >
          <option value="">— sem série (Day 1 isolado) —</option>
          {series.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.network ?? "?"}) — Day 2:{" "}
              {s.day2DateTime
                ? new Date(s.day2DateTime).toLocaleString("pt-BR")
                : "?"}
            </option>
          ))}
        </select>
        {series.length === 0 && (
          <p
            data-testid="wizard-flight-series-empty-hint"
            className="text-xs text-muted-foreground mt-1"
          >
            Nenhuma série criada ainda. Crie uma em <strong>Flight</strong> no menu lateral.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id="wizard-flight-bagged"
          data-testid="wizard-flight-bagged"
          checked={value.baggedAt !== null}
          onCheckedChange={(checked) =>
            set({ baggedAt: checked === true ? new Date() : null })
          }
        />
        <Label htmlFor="wizard-flight-bagged" className="cursor-pointer">
          Bagged (Day 1 passou — avança pro Day 2)
        </Label>
      </div>
    </div>
  );
}
