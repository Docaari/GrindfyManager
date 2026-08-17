// Escolha de modo do motor (F1 / RF-01.4, ADR-246 D-F1-5).
//
// A ferramenta ESTIMA o custo, MOSTRA e SUGERE. Nunca troca sozinha: quem pede
// exato tem direito de esperar. Um numero aproximado que se disfarca de exato e
// pior do que a espera.
import { EXACT_LIMIT } from "@/lib/combo-calc/engine/cost";
import type { EngineCostEstimate } from "@/lib/combo-calc/engine/cost";
import type { EngineMode } from "@/lib/combo-calc/engine/types";
import { tokens } from "@/lib/ui-tokens";

export interface ModeSelectorProps {
  mode: EngineMode;
  onChange: (next: EngineMode) => void;
  cost: EngineCostEstimate | null;
  suggested: EngineMode | null;
}

export function ModeSelector({ mode, onChange, cost, suggested }: ModeSelectorProps) {
  const disagrees = suggested != null && suggested !== mode;

  return (
    <div data-testid="range-lab-mode" className="space-y-1">
      <div className="flex gap-1">
        <button
          type="button"
          data-testid="range-lab-mode-exact"
          onClick={() => onChange("exact")}
          aria-pressed={mode === "exact"}
          className={`flex-1 rounded px-2 py-1 text-xs border ${
            mode === "exact"
              ? "bg-emerald-600 border-emerald-600 text-white"
              : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
          }`}
        >
          Exato
        </button>
        <button
          type="button"
          data-testid="range-lab-mode-mc"
          onClick={() => onChange("monte_carlo")}
          aria-pressed={mode === "monte_carlo"}
          className={`flex-1 rounded px-2 py-1 text-xs border ${
            mode === "monte_carlo"
              ? "bg-emerald-600 border-emerald-600 text-white"
              : `bg-transparent ${tokens.color.neutral.border} ${tokens.color.neutral.text}`
          }`}
        >
          Aproximado
        </button>
      </div>

      {cost && (
        <p className={`text-[10px] ${tokens.color.neutral.text}`}>
          {cost.validPairs.toLocaleString("pt-BR")} confrontos x{" "}
          {cost.runoutsPerPair.toLocaleString("pt-BR")} runouts ={" "}
          <span className="font-mono">{cost.showdowns.toLocaleString("pt-BR")}</span>{" "}
          comparacoes.
        </p>
      )}

      {disagrees && suggested === "monte_carlo" && (
        <p data-testid="range-lab-mode-hint" className={`text-[10px] ${tokens.color.warn.text}`}>
          Acima do orcamento exato ({EXACT_LIMIT.toLocaleString("pt-BR")}). O modo
          aproximado responde rapido e mostra a margem de erro — mas o exato roda
          assim mesmo, se voce preferir esperar.
        </p>
      )}
      {disagrees && suggested === "exact" && (
        <p data-testid="range-lab-mode-hint" className={`text-[10px] ${tokens.color.neutral.text}`}>
          Este spot cabe no modo exato — nao ha por que aceitar margem de erro.
        </p>
      )}
    </div>
  );
}

export default ModeSelector;
