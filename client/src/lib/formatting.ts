// =============================================================================
// Funcoes de formatacao reutilizaveis
//
// NOTA: formatCurrency e formatCurrencyBR continuam em utils.ts (ja centralizadas).
// Este arquivo contem funcoes adicionais de formatacao que estavam duplicadas.
// =============================================================================

/**
 * Formata um numero como porcentagem com 1 casa decimal.
 * Exemplo: 12.345 -> "12.3%"
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Dinheiro SEM centavos, no mesmo padrao visual de `formatCurrency` (utils.ts):
 * separador de milhar brasileiro e simbolo `$`. Ex.: -1234.56 -> "-$1.235".
 *
 * Existe para eixo de grafico e para frase corrida, onde os centavos so poluem.
 * Todo numero exibido em card ou tabela continua usando `formatCurrency`, com
 * centavos.
 *
 * Antes desta funcao havia TRES formatacoes de dinheiro convivendo no dashboard
 * (`en-US` nos cards, `pt-BR` no grafico de evolucao e uma terceira nas dicas):
 * o mesmo valor aparecia escrito de dois jeitos em telas vizinhas.
 */
export function formatCurrencyRounded(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  const abs = Math.abs(rounded).toLocaleString('pt-BR');
  return `${rounded < 0 ? '-' : ''}$${abs}`;
}
