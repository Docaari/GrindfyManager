// Range Lab / F3b — a cascata: de onde veio o numero do veredito, degrau a degrau.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.2)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md (D-F3-26, D-F3-32)
//
// O componente NAO recalcula nada: ele desenha os degraus que `buildCascade`
// devolveu. Numero montado aqui a partir de outra fonte e como os dois paineis
// divergem sem ninguem perceber.
//
// Degrau indisponivel nao vira barra de massa zero: zero na barra seria lido como
// "as suas cartas mataram o range inteiro", que e outra coisa que "nao sei".
import type { Cascade, CascadeStep } from "@/lib/combo-calc/cascade";
import { NOMINAL_COMBOS } from "@/lib/combo-calc/cascade";
import { describeCascadeStep } from "@/lib/combo-calc/uiRules";
import { decisionPalette, tokens } from "@/lib/ui-tokens";

export interface CascadeBarProps {
  cascade: Cascade;
}

/** Massa de combos: inteiro sem casa decimal, fracao com uma. */
function formatMass(mass: number): string {
  return Number.isInteger(mass) ? String(mass) : mass.toFixed(1).replace(".", ",");
}

function widthPercent(mass: number): string {
  if (!Number.isFinite(mass) || mass <= 0) return "0%";
  const fraction = Math.min(1, mass / NOMINAL_COMBOS);
  // Piso visivel: um degrau com massa real nao pode sumir da barra e parecer zero.
  return `${Math.max(2, fraction * 100)}%`;
}

function StepRow({ step }: { step: CascadeStep }) {
  const copy = describeCascadeStep(step);

  return (
    <div
      data-testid={`range-lab-cascade-step-${step.id}`}
      data-status={step.status}
      className="space-y-0.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-gray-300">{copy.label}</span>
        {step.status === "ok" && (
          <span className="font-mono text-[11px] font-bold text-gray-100">
            {formatMass(step.mass)}
          </span>
        )}
      </div>
      {step.status === "ok" ? (
        <div className="h-1.5 w-full rounded bg-gray-800">
          <div
            className={`h-1.5 rounded ${decisionPalette.cascade(step.id)}`}
            style={{ width: widthPercent(step.mass) }}
          />
        </div>
      ) : null}
      {copy.note !== null && (
        <p className={`text-[10px] ${tokens.color.neutral.text}`}>{copy.note}</p>
      )}
    </div>
  );
}

export function CascadeBar({ cascade }: CascadeBarProps) {
  return (
    <div
      data-testid="range-lab-cascade"
      className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        De onde vem esse numero
      </h3>
      {cascade.steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </div>
  );
}

export default CascadeBar;
