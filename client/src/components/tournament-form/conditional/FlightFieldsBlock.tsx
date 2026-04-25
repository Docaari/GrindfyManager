import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FLIGHT_DAY_SUGGESTIONS } from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06 FlightFieldsBlock
//
// Campos:
//   - flightDay (Input + datalist FLIGHT_DAY_SUGGESTIONS)
//   - flightAdvanced (Checkbox, so quando Day 1A/B/C/D/E)
//   - flightParentId (autocomplete dos Day 1 do user — endpoint pode nao existir
//     ainda; useQuery vazio fallback para Sprint 3+)
//
// Hints:
//   - Day Final: "Position e prize obrigatorios"
//   - Estados visuais: Day 1 (verde), intermediario (amarelo), Final (azul)
// =============================================================================

export interface FlightFieldsValue {
  flightDay: string;
  flightAdvanced: boolean | null;
  flightParentId: string | null;
}

export interface FlightFieldsBlockProps {
  value: FlightFieldsValue;
  onChange: (next: FlightFieldsValue) => void;
}

const DAY_LETTER_REGEX = /^\d+[A-Z]$/;

function classifyFlightDay(day: string): "day1" | "intermediate" | "final" | "none" {
  if (!day) return "none";
  if (day === "Final") return "final";
  if (DAY_LETTER_REGEX.test(day)) return "day1";
  // Day 2, 3, "Day 2", etc.
  if (/^Day\s?\d+$/.test(day) || /^\d+$/.test(day)) return "intermediate";
  return "none";
}

export default function FlightFieldsBlock({ value, onChange }: FlightFieldsBlockProps) {
  const set = (patch: Partial<FlightFieldsValue>) => onChange({ ...value, ...patch });

  // Endpoint Day-1 parent flights (Sprint 3+ implementara). Usa fallback [].
  const { data: parents = [] } = useQuery<any[]>({
    queryKey: ["/api/tournaments/flight-parents"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/tournaments/flight-parents", { credentials: "include" });
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const classification = classifyFlightDay(value.flightDay);
  const isDayLetter = classification === "day1";
  const isFinal = classification === "final";
  const isIntermediate = classification === "intermediate";

  // Estado visual por classification
  const containerColor =
    isFinal
      ? "border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20"
      : isDayLetter
        ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20"
        : isIntermediate
          ? "border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20"
          : "border-cyan-300 dark:border-cyan-700 bg-cyan-50/40 dark:bg-cyan-950/20";

  return (
    <div
      data-testid="wizard-step3-flight-block"
      className={`space-y-4 rounded-md border p-4 ${containerColor}`}
    >
      <div className="text-sm font-semibold">Flight (multi-dia)</div>

      <div>
        <Label htmlFor="wizard-flight-day">Dia do flight</Label>
        <Input
          id="wizard-flight-day"
          data-testid="wizard-flight-day"
          list="wizard-flight-day-suggestions"
          value={value.flightDay}
          onChange={(e) => set({ flightDay: e.target.value })}
          placeholder="1A, 1B, 2, Final…"
        />
        <datalist id="wizard-flight-day-suggestions">
          {FLIGHT_DAY_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {isDayLetter && (
        <div className="flex items-center gap-3">
          <Checkbox
            id="wizard-flight-advanced"
            data-testid="wizard-flight-advanced"
            checked={value.flightAdvanced === true}
            onCheckedChange={(checked) => set({ flightAdvanced: checked === true })}
          />
          <Label htmlFor="wizard-flight-advanced" className="cursor-pointer">
            Avancei pro Day 2/Final?
          </Label>
        </div>
      )}

      {isFinal && (
        <p
          data-testid="wizard-flight-final-hint"
          className="text-sm text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30 rounded-md p-2"
        >
          Position e prize obrigatórios para Day Final.
        </p>
      )}

      <div>
        <Label htmlFor="wizard-flight-parent-id">Vincular a um Day 1 anterior (opcional)</Label>
        <input
          id="wizard-flight-parent-id"
          data-testid="wizard-flight-parent-id"
          list="wizard-flight-parents"
          value={value.flightParentId ?? ""}
          onChange={(e) => set({ flightParentId: e.target.value || null })}
          className="w-full p-2 bg-background border rounded-md"
          placeholder={parents.length ? "Selecione um Day 1 anterior" : "Nenhum Day 1 disponível"}
        />
        <datalist id="wizard-flight-parents">
          {parents.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name ?? p.flightDay ?? p.id}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}
