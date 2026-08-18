/**
 * Ajuste manual do resultado final da sessao (grind-live) — helper puro.
 *
 * Spec: Docs/specs/grind-live-manual-session-result.md (RF-03)
 * ADR:  Docs/architecture/decisions/244-grind-live-manual-session-result.md (D4)
 *
 * O jogador declara o resultado final da sessao em USD; o investido NAO muda e o
 * ROI e recalculado sobre a mesma base. Quando a base de investimento nao existe
 * (zero, negativa ou nao finita), o ROI e `null` + motivo nomeado — nunca zero
 * inventado (`.claude/rules/03-padrao-codigo.md`, "Falhar alto"). O valor
 * devolvido nao e arredondado: arredondar e responsabilidade da exibicao.
 */

export interface ComputeAdjustedResultInput {
  /** Resultado declarado pelo jogador, em USD. Aceita negativo e zero. */
  manualProfitUsd: number;
  /** Base de investimento da sessao, em USD. Nunca e alterada pelo ajuste. */
  investedUsd: number;
}

export interface AdjustedResult {
  /** Eco do valor declarado, sem transformacao. */
  profitUsd: number;
  /** `(manualProfitUsd * 100) / investedUsd`, ou `null` sem base valida. */
  roi: number | null;
  /** Presente apenas quando `roi` e `null`. */
  reason?: 'invested_zero';
}

export function computeAdjustedResult(
  input: ComputeAdjustedResultInput,
): AdjustedResult {
  const manualProfitUsd = input.manualProfitUsd;
  const investedUsd = input.investedUsd;

  // Base ausente/inconsistente recusa o calculo. `typeof` cobre o chamador
  // quebrado (null/undefined) que o tipo declara como number.
  if (
    typeof investedUsd !== 'number' ||
    !Number.isFinite(investedUsd) ||
    investedUsd <= 0
  ) {
    return { profitUsd: manualProfitUsd, roi: null, reason: 'invested_zero' };
  }

  // Multiplicar antes de dividir preserva os decimais exatos das razoes comuns
  // (88 / 1000 * 100 sairia 8.799999999999999 na ordem inversa).
  return {
    profitUsd: manualProfitUsd,
    roi: (manualProfitUsd * 100) / investedUsd,
  };
}
