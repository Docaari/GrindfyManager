// Range Lab / F3b — o que as SUAS duas cartas tiram do range dele.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.3, criterio 5)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-13 o botao, D-F3-27 etiqueta e nao particao, D-F3-29 Monte Carlo,
//          D-F3-30 quem decide se o painel existe)
//
// NAO HA `if` DE DISPONIBILIDADE AQUI. Quem decide e `blockerAvailability`, que e
// pura e testavel sem RTL; este componente so renderiza o que ela devolveu. O
// motivo tambem chega pronto, de `describeBlockerUnavailable`.
//
// A frase de rodape e REQUISITO, nao decoracao: as duas colunas por carta somam
// mais que o total, porque o combo igual a sua mao e bloqueado pelas DUAS cartas.
// O tipo protege o codigo; a frase e a unica coisa que protege a leitura.
import { cardKey } from "@/lib/combo-calc/cards";
import type { BlockerAvailability, BlockerReport } from "@/lib/combo-calc/blockers";
import type { ConfrontationSplit, ConfrontOutcome } from "@/lib/combo-calc/confront";
import { describeBlockerUnavailable } from "@/lib/combo-calc/uiRules";
import { decisionPalette, tokens } from "@/lib/ui-tokens";

export interface BlockerPanelProps {
  availability: BlockerAvailability;
  report: BlockerReport | null;
  /** Fora do river a enumeracao so roda sob pedido (D-F3-13). */
  onComputeDelta: () => void;
}

const OUTCOME_LABEL: Record<ConfrontOutcome, string> = {
  value: "value",
  bluff: "blefe",
  chop: "chop",
  unknown: "sem numero",
};

const OVERLAP_NOTE =
  "As colunas sao etiquetas, nao divisao: a mao igual a sua e bloqueada pelas duas " +
  "cartas e aparece nas duas. O total conta cada combo uma vez so.";

const MONTE_CARLO_NOTE =
  "No modo aproximado o efeito em pontos ficaria menor que a propria margem de erro. " +
  "Troque para o modo exato para ve-lo.";

const NO_BLOCKED_NOTE = "As suas cartas nao tiram nenhuma mao do range dele neste bordo.";

function formatMass(mass: number): string {
  return Number.isInteger(mass) ? String(mass) : mass.toFixed(1).replace(".", ",");
}

/** Fracao de equity para pontos percentuais, com uma casa. */
function formatPoints(fraction: number): string {
  return Math.abs(fraction * 100)
    .toFixed(1)
    .replace(".", ",");
}

function BucketChips({ split }: { split: ConfrontationSplit }) {
  const outcomes: ConfrontOutcome[] = ["value", "bluff", "chop", "unknown"];
  return (
    <div className="flex flex-wrap gap-1">
      {outcomes
        .filter((outcome) => split[outcome].combos > 0)
        .map((outcome) => (
          <span
            key={outcome}
            className={`rounded px-1.5 py-0.5 text-[10px] text-white ${decisionPalette.confront(outcome)}`}
          >
            {formatMass(split[outcome].mass)} de {OUTCOME_LABEL[outcome]}
          </span>
        ))}
    </div>
  );
}

export function BlockerPanel({ availability, report, onComputeDelta }: BlockerPanelProps) {
  if (!availability.available) {
    return (
      <div
        data-testid="range-lab-blocker-panel"
        className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
      >
        <p data-testid="range-lab-blocker-unavailable" className={`text-xs ${tokens.color.neutral.text}`}>
          {describeBlockerUnavailable(availability)}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="range-lab-blocker-panel"
      className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        O que as suas cartas tiram dele
      </h3>

      {report === null ? (
        <p className={`text-xs ${tokens.color.neutral.text}`}>
          Aguardando a leitura do range dele neste bordo.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {report.perCard.map((column, index) => (
              <div
                key={cardKey(column.card)}
                data-testid={`range-lab-blocker-card-${index}`}
                className="space-y-1 rounded border border-gray-800 p-2"
              >
                <div className="font-mono text-xs font-bold text-gray-100">
                  {cardKey(column.card)}
                </div>
                <BucketChips split={column.removed} />
              </div>
            ))}
          </div>

          <p data-testid="range-lab-blocker-total" className="text-xs text-gray-300">
            No total, as suas cartas tiram {report.blockedCombos} combos do range dele
            {" "}({formatMass(report.blockedMass)} de massa).
          </p>

          <p data-testid="range-lab-blocker-overlap-note" className={`text-[10px] ${tokens.color.neutral.text}`}>
            {OVERLAP_NOTE}
          </p>

          {report.delta.status === "ok" && (
            <p data-testid="range-lab-blocker-delta" className="text-xs text-gray-200">
              Bloquear essas maos {report.delta.delta < 0 ? "custou" : "rendeu"}{" "}
              {formatPoints(report.delta.delta)} pontos de equity para voce.
            </p>
          )}

          {report.delta.status === "unavailable" && report.delta.reason === "monte_carlo_mode" && (
            <p data-testid="range-lab-blocker-delta" className={`text-xs ${tokens.color.neutral.text}`}>
              {MONTE_CARLO_NOTE}
            </p>
          )}

          {report.delta.status === "unavailable" && report.delta.reason === "no_blocked_combos" && (
            <p data-testid="range-lab-blocker-delta" className={`text-xs ${tokens.color.neutral.text}`}>
              {NO_BLOCKED_NOTE}
            </p>
          )}

          {report.delta.status === "unavailable" && report.delta.reason === "not_requested" && (
            <button
              type="button"
              data-testid="range-lab-blocker-compute-delta"
              onClick={onComputeDelta}
              className={`rounded px-2 py-1 text-[11px] border ${tokens.color.action.border} ${tokens.color.action.text}`}
            >
              Calcular o efeito em pontos de equity
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default BlockerPanel;
