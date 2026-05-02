// =============================================================================
// Sprint Stats-V3.5 — SECTION_ALIASES + resolveSection (ADR-067, RF-2 spec V3.5)
//
// Spec : Docs/specs/sprint-stats-v3.5-ocr-context-aware.md (secao 4.2)
// ADR  : 067 (Section-aware OCR mapping)
//
// Mapeia headings brutos extraidos do popup Hand2Note (texto livre via OCR LLM)
// para HudGroupId canonico do catalogo. Cobertura obrigatoria: cada um dos 16
// HudGroupId tem >=3 aliases (label PT-BR oficial, EN canonico, variantes
// Hand2Note conhecidas). Headings nao mapeados retornam null (degrada
// graciosamente — comportamento legacy preservado em fuzzyMatchStat).
//
// Normalizacao: lowercase + strip non-alphanumeric (mantendo espaco) + collapse.
// Reuso server+frontend (frontend usa para render badge + override dropdown).
//
// Regra de duplicidade: se um alias literal aparecer em 2 grupos potenciais,
// escolhemos o mais especifico (ex: "bb defense" -> bb_defense, NAO blind_war_bb).
// =============================================================================

import type { HudGroupId } from "./hud-stat-catalog";

// Mapa de heading bruto (apos normalizacao) -> HudGroupId.
// Cobre os 16 HudGroupId conforme tabela canonica da spec V3.5 secao 4.2.
export const SECTION_ALIASES: Record<string, HudGroupId> = {
  // ---- basics ----
  "basics": "basics",
  "basicos": "basics",
  "fundamentos": "basics",

  // ---- rfi ----
  "rfi": "rfi",
  "rfi por posicao": "rfi",
  "rfi by position": "rfi",
  "open raise": "rfi",

  // ---- threebet (preflop 3bet) ----
  "3bet": "threebet",
  "three bet": "threebet",
  "threebet": "threebet",
  "3bet pf": "threebet",
  "3 bet preflop": "threebet",

  // ---- resteal ----
  "resteal": "resteal",
  "re steal": "resteal",
  "resteal pf": "resteal",

  // ---- pos_flop_pfr_ip ----
  "pos flop pfr ip": "pos_flop_pfr_ip",
  "posflop pfr ip": "pos_flop_pfr_ip",
  "pfr ip": "pos_flop_pfr_ip",
  "as pfr ip": "pos_flop_pfr_ip",

  // ---- pos_flop_pfr_oop ----
  "pos flop pfr oop": "pos_flop_pfr_oop",
  "posflop pfr oop": "pos_flop_pfr_oop",
  "pfr oop": "pos_flop_pfr_oop",
  "as pfr oop": "pos_flop_pfr_oop",

  // ---- pos_flop_multiway ----
  "pos flop multiway": "pos_flop_multiway",
  "multiway": "pos_flop_multiway",
  "mw": "pos_flop_multiway",
  "multi way": "pos_flop_multiway",

  // ---- cbets_by_board ----
  "cbets por textura": "cbets_by_board",
  "cbets by board": "cbets_by_board",
  "cbet by texture": "cbets_by_board",
  "c bet textura": "cbets_by_board",

  // ---- caller_pre_flop ----
  "caller pre flop": "caller_pre_flop",
  "caller preflop": "caller_pre_flop",
  "as caller": "caller_pre_flop",
  "cold call": "caller_pre_flop",

  // ---- threeway_bb ----
  "3 way bb": "threeway_bb",
  "3way bb": "threeway_bb",
  "bb 3 way": "threeway_bb",
  "three way bb": "threeway_bb",

  // ---- bb_defense ----
  // Regra de duplicidade (spec 4.2): "bb defense" / "big blind defense" sao do
  // grupo bb_defense (NAO blind_war_bb). Blind war BB tem aliases especificos
  // ("blind war bb", "bb war", etc).
  "bb defense": "bb_defense",
  "big blind defense": "bb_defense",
  "defesa do bb": "bb_defense",
  "defesa big blind": "bb_defense",
  "bb defend": "bb_defense",

  // ---- pos_flop_pfc_ip ----
  "pos flop pfc ip": "pos_flop_pfc_ip",
  "posflop pfc ip": "pos_flop_pfc_ip",
  "pfc ip": "pos_flop_pfc_ip",
  "as caller ip": "pos_flop_pfc_ip",

  // ---- blind_war_sb ----
  "blind war sb": "blind_war_sb",
  "sb vs bb": "blind_war_sb",
  "small blind war": "blind_war_sb",
  "sb war": "blind_war_sb",
  "sb open vs bb": "blind_war_sb",

  // ---- blind_war_bb ----
  // "bb vs sb" eh especifico de blind_war_bb (BB defendendo vs SB open).
  "blind war bb": "blind_war_bb",
  "bb vs sb": "blind_war_bb",
  "big blind war": "blind_war_bb",
  "bb war": "blind_war_bb",
  "bb defend vs sb": "blind_war_bb",

  // ---- threebet_pot_ip ----
  "3bet pot ip": "threebet_pot_ip",
  "3 bet pot ip": "threebet_pot_ip",
  "threebet pot ip": "threebet_pot_ip",
  "3bp ip": "threebet_pot_ip",

  // ---- threebet_pot_oop_vs_lp ----
  "3bet pot oop vs lp": "threebet_pot_oop_vs_lp",
  "3 bet pot oop vs lp": "threebet_pot_oop_vs_lp",
  "3bp oop vs lp": "threebet_pot_oop_vs_lp",
  "threebet pot oop": "threebet_pot_oop_vs_lp",
};

/**
 * Normaliza heading bruto e resolve para HudGroupId via SECTION_ALIASES.
 *
 * Normalizacao (Reviewer fix [NIT] V3.5):
 *   - NFD decompose + strip combining marks (preserva chars latinos com acento:
 *     "Posição" -> "posicao", "Básicos" -> "basicos")
 *   - lowercase
 *   - replace non-alphanumeric (mantendo espacos como separador) por espaco
 *   - collapse whitespace + trim
 *
 * Retorna null para entradas vazias/null/undefined OU headings sem alias
 * (degrada graciosamente — fuzzyMatchStat com sectionHint=null preserva
 * comportamento legacy).
 */
export function resolveSection(
  rawHeading: string | null | undefined,
): HudGroupId | null {
  if (rawHeading === null || rawHeading === undefined) return null;
  if (typeof rawHeading !== "string") return null;
  const normalized = String(rawHeading)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length === 0) return null;
  return SECTION_ALIASES[normalized] ?? null;
}
