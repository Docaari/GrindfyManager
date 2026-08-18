// =============================================================================
// Sprint grade-planner-library-and-multi-day — RF-02 (ADR-245 §D1).
//
// Seletor "Dias" do modal de criacao da grade: 7 chips domingo-primeiro. Puro de
// apresentacao — o picker NAO decide nada. Dia OFF ou sem perfil ativo continua
// clicavel e marcavel (D3 do founder: a decisao de pular acontece no submit,
// em shared/grade-multi-day.ts), e so recebe marcacao visual + title.
//
// O state (`selectedDays`) vive no caller (DayCreateTournamentDialog), nao em
// TournamentFormState: dias sao conceito do LOTE, nao do torneio.
// =============================================================================

import { weekDays } from "./types";
import type { DayProfile } from "@shared/grade-multi-day";

/** Rotulo curto por dayOfWeek, na ordem de Date#getDay. */
const DEFAULT_DAY_LABELS: readonly string[] = weekDays.map((d) => d.short);

/** Estado do dia sob o ponto de vista da grade — vira `data-day-state`. */
type DayState = "active" | "off" | "no-profile";

const CHIP_BASE =
  "rounded-full border px-3 py-1 text-xs transition-colors";
const CHIP_ON = "border-emerald-500 bg-emerald-500/20 font-medium text-emerald-200";
const CHIP_OFF =
  "border-gray-700 bg-gray-800 text-gray-300 hover:border-emerald-500/60 hover:text-emerald-200";
/** Sinalizacao de "este dia seria pulado" — nao bloqueia, so avisa. */
const CHIP_SKIPPABLE = "border-dashed border-amber-500/60 text-amber-200";

const DAY_STATE_TITLE: Record<DayState, string> = {
  active: "Dia com perfil ativo",
  off: "Dia OFF — sera pulado ao salvar (o perfil do dia nao muda)",
  "no-profile": "Dia sem perfil ativo — sera pulado ao salvar",
};

export interface WeekDaysPickerProps {
  /** Dias marcados (0..6). */
  selectedDays: readonly number[];
  /** Sobe o dia clicado; quem decide marcar/desmarcar e o caller. */
  onToggleDay: (dayOfWeek: number) => void;
  /** Mesma assinatura de GradePlanner.getActiveProfile. */
  getProfileForDay: (dayOfWeek: number) => DayProfile;
  /** Rotulos curtos indexados por dayOfWeek. Default: weekDays[].short. */
  dayLabels?: readonly string[];
}

function resolveDayState(profile: DayProfile): DayState {
  if (profile === "OFF") return "off";
  if (profile === "A" || profile === "B" || profile === "C") return "active";
  return "no-profile";
}

export function WeekDaysPicker(props: WeekDaysPickerProps): JSX.Element {
  const {
    selectedDays,
    onToggleDay,
    getProfileForDay,
    dayLabels = DEFAULT_DAY_LABELS,
  } = props;

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Dias</label>
      <div
        data-testid="week-days-picker"
        role="group"
        aria-label="Dias da semana"
        className="flex flex-wrap items-center gap-1.5"
      >
        {weekDays.map((day) => {
          const state = resolveDayState(getProfileForDay(day.id));
          const selected = selectedDays.includes(day.id);
          const skippable = state !== "active";
          return (
            <button
              key={day.id}
              type="button"
              data-testid={`week-day-chip-${day.id}`}
              data-day-state={state}
              aria-pressed={selected}
              title={DAY_STATE_TITLE[state]}
              onClick={() => onToggleDay(day.id)}
              className={`${CHIP_BASE} ${selected ? CHIP_ON : CHIP_OFF} ${
                skippable ? CHIP_SKIPPABLE : ""
              }`}
            >
              {dayLabels[day.id] ?? day.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default WeekDaysPicker;
