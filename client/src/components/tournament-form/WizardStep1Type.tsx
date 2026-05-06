import {
  TOURNAMENT_PRIMARY_TYPES,
  TYPE_COLORS,
  getTypeLabel,
  type TournamentPrimaryType,
} from "@shared/tournamentTypes";

// =============================================================================
// Sprint 2 - RF-06 Step 1: Tipo Primario
//
// 5 botoes radio (Vanilla, PKO, Mystery, Satellite, Add-on). Cada botao mostra
// label PT-BR via getTypeLabel + cores do SSoT (TYPE_COLORS).
// Add-on adicionado em 2026-05-06 (extensao ADR-031).
// =============================================================================

export interface WizardStep1TypeProps {
  value: TournamentPrimaryType | null;
  onChange: (type: TournamentPrimaryType) => void;
}

export default function WizardStep1Type({ value, onChange }: WizardStep1TypeProps) {
  return (
    <div role="radiogroup" aria-label="Tipo de torneio" className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {TOURNAMENT_PRIMARY_TYPES.map((t) => {
        const colors = TYPE_COLORS[t];
        const selected = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            data-testid={`wizard-step1-type-${t}`}
            aria-selected={selected}
            aria-checked={selected}
            data-selected={selected ? "true" : "false"}
            onClick={() => onChange(t)}
            className={[
              "rounded-md border px-4 py-3 text-left transition-all",
              colors.bg,
              colors.text,
              selected ? `ring-2 ${colors.ring}` : "ring-0 hover:ring-1",
            ].join(" ")}
          >
            <span className="font-medium">{getTypeLabel(t)}</span>
          </button>
        );
      })}
    </div>
  );
}
