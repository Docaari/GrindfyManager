// Range Lab / F3b — o cartao do MDF: quanto o blefe dele precisa funcionar,
// quanto voce precisa defender, e se os blefes dele fecham a conta.
//
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.4, "A tela")
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-32 a copy nasce fora do JSX, D-F3-34 responde antes do spot)
//
// DUAS COISAS QUE ESTE COMPONENTE NAO FAZ
//
// 1. Ele nao escreve frase. Todas as frases vem de `describeMdf` (`uiRules.ts`),
//    que e testada sem DOM — cacar texto no DOM e o anti-padrao da licao #2, e a
//    D-F3-16 e requisito de aceite, nao decoracao.
// 2. Ele nao espera a corrida. As tres porcentagens saem de `potCurrent` e
//    `callAmount`: esconde-las atras do resultado seria perda gratuita. So o
//    bloco de value/blefe depende do motor, e ele chega pronto em `balance`.
import { computeMdf } from "@/lib/combo-calc/mdf";
import type { BluffBalance } from "@/lib/combo-calc/mdf";
import { requiredEquity } from "@/lib/combo-calc/ev";
import { describeMdf } from "@/lib/combo-calc/uiRules";
import { decisionPalette, tokens } from "@/lib/ui-tokens";

export interface MdfPanelProps {
  potCurrent: number;
  callAmount: number;
  /** `null` enquanto nao ha corrida — o cartao continua de pe sem ele. */
  balance: BluffBalance | null;
}

export function MdfPanel({ potCurrent, callAmount, balance }: MdfPanelProps) {
  const mdf = computeMdf(potCurrent, callAmount);
  const copy = describeMdf({
    mdf,
    requiredEquity: requiredEquity(potCurrent, callAmount),
    balance,
  });

  return (
    <div
      data-testid="range-lab-mdf-panel"
      className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {copy.status === "ok" ? copy.headline : null}
        </h3>
        {/*
          A formula viaja em ATRIBUTO. Na face do cartao ela viraria a quarta coisa
          parecida ao lado de tres porcentagens (D-F3-16).
        */}
        <span
          data-testid="range-lab-mdf-formula"
          title={copy.formulaTooltip}
          aria-label={copy.formulaTooltip}
          className={`shrink-0 cursor-help text-[10px] underline decoration-dotted ${tokens.color.neutral.text}`}
        >
          como se calcula
        </span>
      </div>

      {copy.status === "degraded" ? (
        <p data-testid="range-lab-mdf-degraded" className={`text-xs ${tokens.color.warn.text}`}>
          {copy.headline}
        </p>
      ) : (
        <div className="space-y-1">
          <p data-testid="range-lab-mdf-line-hero" className="text-xs text-gray-300">
            {copy.heroEquityLine}
          </p>
          <p data-testid="range-lab-mdf-line-defense" className="text-xs text-gray-300">
            {copy.defenseLine}
          </p>
          <p data-testid="range-lab-mdf-line-mdf" className="text-xs text-gray-300">
            {copy.mdfLine}
          </p>
          {copy.balanceLine !== null && balance !== null && balance.status === "ok" && (
            <p
              data-testid="range-lab-mdf-balance"
              className={`rounded px-2 py-1 text-xs text-white ${decisionPalette.balance(balance.verdict)}`}
            >
              {copy.balanceLine}
            </p>
          )}
        </div>
      )}

      <p data-testid="range-lab-mdf-action" className="text-xs font-semibold text-gray-200">
        {copy.action}
      </p>
    </div>
  );
}

export default MdfPanel;
