/**
 * Vocabulario de dimensoes de agrupamento da Biblioteca de Torneios
 * (Sprint torneios-custom-families — Fase 1).
 *
 * Uma "receita" (recipe) e o subconjunto de dimensoes que define uma familia.
 * A receita DEFAULT (as 6 dims legadas, SEM dayOfWeek, na ordem canonica)
 * preserva byte-compat com a familyKey gravada em saved_tournament_highlights /
 * premium_library_highlights. Receitas customizadas usam chave prefixada "g1:".
 *
 * Compartilhado entre o agrupamento server-side (libraryGrouping.ts) e o
 * construtor de receitas no client (TournamentLibraryNew.tsx).
 */

export type GroupDim =
  | "site"
  | "abi"
  | "type"
  | "speed"
  | "fieldBucket"
  | "timeBin"
  | "dayOfWeek";

/** Ordem canonica das dimensoes — dayOfWeek SEMPRE por ultimo (additivo). */
export const CANONICAL_DIM_ORDER: GroupDim[] = [
  "site",
  "abi",
  "type",
  "speed",
  "fieldBucket",
  "timeBin",
  "dayOfWeek",
];

/** Receita default = as 6 dims legadas (sem dayOfWeek). Byte-compat com a chave atual. */
export const DEFAULT_RECIPE: GroupDim[] = CANONICAL_DIM_ORDER.slice(0, 6);
