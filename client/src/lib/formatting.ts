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
