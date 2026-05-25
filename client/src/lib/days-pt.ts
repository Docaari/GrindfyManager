// =============================================================================
// DAYS_PT — nomes dos dias da semana em PT-BR sem acentuacao (compativel com
// strings consultadas via NFKD/ASCII em testes e logs).
//
// Indice 0 = Domingo (paridade Date#getDay).
// =============================================================================

export const DAYS_PT = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
] as const;

export type DayOfWeekPt = (typeof DAYS_PT)[number];

export default DAYS_PT;
