// =============================================================================
// Curated Study Themes Seed (ADR-127, refactored Sprint Themes-V2 2026-05-08)
//
// Taxonomia v2: 20 temas em 3 categorias (preflop / postflop / multiway).
// Substitui catalog v1 (30 temas / 5 categorias). Migration 0059 faz soft-drop
// dos antigos via UPDATE is_curated=false para preservar FKs (sessions,
// study_theme_spot_links).
//
// Cada tema:
//   - slug (kebab-case unico)
//   - name (PT-BR, simplificado)
//   - color hex + emoji default (string vazia — user customiza no UI)
//   - category enum (preflop | postflop | multiway)
//   - linkedStats: stat_id do HUD_STAT_CATALOG (RF-3.3 auto-suggest)
//   - linkedLessonSlugs: vazio inicial; coach pode mapear via tools depois
//
// Idempotente. Roda lazy per-user no primeiro GET /api/study-themes via
// storage.ensureCuratedThemesForUser(userId).
// Roda manualmente via scripts/seed-study-themes.ts --user USER-XXXX.
// =============================================================================

export type CuratedCategory = "preflop" | "postflop" | "multiway";

export interface CuratedTheme {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  category: CuratedCategory;
  linkedStats: string[];
  linkedLessonSlugs: string[];
}

// =============================================================================
// PREFLOP — 8 temas
// =============================================================================

const PREFLOP: CuratedTheme[] = [
  {
    slug: "preflop-rfi",
    name: "RFI",
    color: "#0ea5e9",
    emoji: "",
    category: "preflop",
    linkedStats: ["rfi_total", "rfi_btn", "rfi_co", "rfi_hj", "rfi_lj", "rfi_mp", "rfi_ep", "rfi_sb"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-flats",
    name: "Flats",
    color: "#06b6d4",
    emoji: "",
    category: "preflop",
    linkedStats: ["cold_call_total", "cold_call_btn", "cold_call_co", "cold_call_sb", "cold_call_vs_lp", "flat_3bet"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-3bets-ip",
    name: "3bets IP",
    color: "#22c55e",
    emoji: "",
    category: "preflop",
    linkedStats: ["threebet_btn", "threebet_co", "threebet_vs_lp", "fold_vs_threebet_ip", "call_vs_3bet_ip"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-3bets-oop",
    name: "3bets OOP",
    color: "#16a34a",
    emoji: "",
    category: "preflop",
    linkedStats: ["threebet_sb", "threebet_bb", "threebet_vs_ep", "fold_vs_threebet_oop", "call_vs_3bet_oop", "squeeze_pf"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-bb-defense",
    name: "Defesa de BB",
    color: "#a855f7",
    emoji: "",
    category: "preflop",
    linkedStats: [
      "bb_defend_vs_steal",
      "bb_fold_vs_steal",
      "bb_3bet_vs_steal",
      "bb_call_vs_btn",
      "bb_call_vs_co",
      "bb_fold_vs_btn",
      "bb_fold_vs_co",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-blindwar-sb",
    name: "Blindwar SB",
    color: "#f97316",
    emoji: "",
    category: "preflop",
    linkedStats: ["sb_open_vs_bb", "sb_3bet_vs_bb_iso", "sb_steal_attempt", "sb_steal_success", "sb_3bet_pf_vs_bb", "sb_4bet_vs_bb"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-blindwar-bb",
    name: "Blindwar BB",
    color: "#eab308",
    emoji: "",
    category: "preflop",
    linkedStats: ["bb_defend_vs_sb_open", "bb_3bet_vs_sb_open", "bb_call_vs_sb_open", "bb_fold_vs_sb_open", "bb_4bet_vs_sb"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-icm",
    name: "ICM Preflop",
    color: "#dc2626",
    emoji: "",
    category: "preflop",
    linkedStats: ["resteal_short", "rfi_sb_short", "rfi_btn_short", "rfi_co_short", "threebet_short", "fold_to_resteal"],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// POSTFLOP — 9 temas
// =============================================================================

const POSTFLOP: CuratedTheme[] = [
  {
    slug: "postflop-srp-ip-vs-bb",
    name: "SRP IP vs BB",
    color: "#f59e0b",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "cbet_ip_vs_bb",
      "second_barrel_vs_bb",
      "third_barrel_vs_bb",
      "cbet_flop_utg_vs_bb",
      "cbet_turn_utg_vs_bb",
      "cbet_river_utg_vs_bb",
      "bxb",
      "fold_vs_xr_flop",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-srp-bb-vs-ip",
    name: "SRP BB vs IP",
    color: "#fb923c",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "bb_check_raise_flop",
      "bb_donk_flop",
      "fold_vs_cbet_oop",
      "bb_call_vs_btn",
      "bb_call_vs_co",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-flat-pot-oop-agressor",
    name: "Flat pot OOP agressor",
    color: "#ef4444",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "cbet_flop_oop",
      "xf_flop",
      "xc_flop",
      "xr_flop",
      "second_barrel_oop",
      "delay_cbet_oop",
      "third_barrel_oop",
      "xx_bet_bet",
      "probe_turn_oop",
      "probe_river_oop",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-flat-pot-ip-pagador",
    name: "Flat pot IP pagador",
    color: "#84cc16",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "float_flop_ip",
      "raise_cbet_ip",
      "call_cbet_ip",
      "fold_cbet_ip",
      "lead_flop_ip",
      "float_turn_ip",
      "raise_turn_ip",
      "call_turn_cbet_ip",
      "fold_turn_cbet_ip",
      "river_steal_ip",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-3bet-pot-oop",
    name: "3bet pot OOP",
    color: "#8b5cf6",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "cbet_3bet_pot_oop_vs_lp",
      "xc_3bet_pot_oop",
      "xr_3bet_pot_oop",
      "xf_3bet_pot_oop",
      "second_barrel_3bet_pot_oop",
      "third_barrel_3bet_pot_oop",
      "delay_cbet_3bet_pot_oop",
      "fold_vs_float_3bet_oop",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-3bet-pot-ip",
    name: "3bet pot IP",
    color: "#a855f7",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "cbet_3bet_pot_ip",
      "second_barrel_3bet_pot_ip",
      "third_barrel_3bet_pot_ip",
      "xb_3bet_pot_ip",
      "fold_vs_xr_3bet_ip",
      "call_vs_xr_3bet_ip",
      "raise_xr_3bet_ip",
      "wwsf_3bet_pot_ip",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-blindwar-sb",
    name: "Blindwar SB",
    color: "#ec4899",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "sb_cbet_vs_bb_flop",
      "sb_cbet_vs_bb_turn",
      "sb_cbet_vs_bb_river",
      "sb_xc_vs_bb_flop",
      "sb_xr_vs_bb_flop",
      "sb_xf_vs_bb_flop",
      "sb_donk_flop",
      "sb_probe_turn",
      "sb_probe_river",
      "sb_xx_river_bet",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-blindwar-bb",
    name: "Blindwar BB",
    color: "#f43f5e",
    emoji: "",
    category: "postflop",
    linkedStats: [
      "bb_donk_flop_sb",
      "bb_xc_flop_sb",
      "bb_xr_flop_sb",
      "bb_xf_flop_sb",
      "bb_xc_turn_sb",
      "bb_xr_turn_sb",
      "bb_probe_turn_sb",
      "bb_probe_river_sb",
      "bb_call_vs_sb_cbet",
      "bb_fold_vs_sb_cbet",
      "bb_raise_vs_sb_cbet",
      "bb_xx_river_bet_sb",
      "bb_lead_flop_sb",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-icm",
    name: "ICM Posflop",
    color: "#b91c1c",
    emoji: "",
    category: "postflop",
    linkedStats: [],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// MULTIWAY — 3 temas
// =============================================================================

const MULTIWAY: CuratedTheme[] = [
  {
    slug: "multiway-agressor-oop",
    name: "Agressor OOP",
    color: "#3b82f6",
    emoji: "",
    category: "multiway",
    linkedStats: [
      "cbet_multiway_3way",
      "cbet_multiway_4way_plus",
      "multiway_pot_size_avg",
      "wwsf_multiway",
      "wtsd_multiway",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "multiway-caller-ip",
    name: "Caller IP",
    color: "#0891b2",
    emoji: "",
    category: "multiway",
    linkedStats: [
      "fold_to_cbet_multiway",
      "call_cbet_multiway",
      "raise_cbet_multiway",
      "xc_multiway",
      "xr_multiway",
    ],
    linkedLessonSlugs: [],
  },
  {
    slug: "multiway-bb-oop",
    name: "BB OOP",
    color: "#14b8a6",
    emoji: "",
    category: "multiway",
    linkedStats: [
      "bb_defense_3way",
      "bb_3bet_3way",
      "bb_call_3way",
      "bb_fold_3way",
      "bb_squeeze_3way",
      "bb_donk_3way",
      "bb_xr_3way",
      "bb_xc_3way",
    ],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// EXPORT — 20 temas total
// =============================================================================

export const CURATED_STUDY_THEMES: CuratedTheme[] = [
  ...PREFLOP,
  ...POSTFLOP,
  ...MULTIWAY,
];

if (CURATED_STUDY_THEMES.length !== 20) {
  throw new Error(
    `[study-themes-seed] expected 20 curated themes, got ${CURATED_STUDY_THEMES.length}. ` +
    `Categories: preflop=${PREFLOP.length} postflop=${POSTFLOP.length} multiway=${MULTIWAY.length}.`,
  );
}

export const CURATED_STUDY_THEMES_BY_CATEGORY: Record<CuratedCategory, CuratedTheme[]> = {
  preflop: PREFLOP,
  postflop: POSTFLOP,
  multiway: MULTIWAY,
};

// =============================================================================
// LEGACY SLUGS (v1 → v2 migration reference)
// =============================================================================
// Slugs do catalog v1 que foram dropados (soft-drop via migration 0059).
// Listados aqui para referencia de queries futuras + UI legacy banner.
// =============================================================================
export const LEGACY_CURATED_SLUGS_V1: string[] = [
  // v1 preflop (8)
  "preflop-rfi-tight",
  "preflop-rfi-loose",
  "preflop-3bet-ip",
  "preflop-3bet-oop",
  "preflop-vs-3bet",
  "preflop-bb-defense",
  "preflop-blind-war-squeeze",
  "preflop-late-reg-deep",
  // v1 postflop (8)
  "postflop-cbet-oop-small",
  "postflop-cbet-oop-polar",
  "postflop-donk-leads",
  "postflop-turn-barrel",
  "postflop-river-bluff-value",
  "postflop-multiway-cbet",
  "postflop-cooler-river",
  "postflop-board-texture",
  // v1 icm (6)
  "icm-bubble-play",
  "icm-final-table",
  "icm-pay-jumps",
  "icm-ft-ladder",
  "icm-stack-aware",
  "icm-mtt-push-fold",
  // v1 mental (5)
  "mental-tilt-control",
  "mental-a-game",
  "mental-loss-recovery",
  "mental-variance-acceptance",
  "mental-decision-fatigue",
  // v1 specific (3)
  "specific-short-stack",
  "specific-phased-day2",
  "specific-satellite-bubble",
];

// =============================================================================
// NOTAS DE INTEGRACAO (storage layer — implementer)
// =============================================================================
// 1. ensureCuratedThemesForUser(userId): chamado lazy no primeiro GET /api/study-themes
//    quando o user nao tem rows com is_curated=true para os slugs v2. UNIQUE parcial
//    uq_study_themes_user_slug_curated garante idempotency.
//
// 2. resolveLessonSlugsToIds(slugs: string[]): query
//      SELECT id FROM library_lessons WHERE slug = ANY($1) AND is_published = true
//    Slugs nao encontrados sao silenciosamente dropped do linked_lessons array.
//
// 3. Auto-suggest (RF-3.3): query lookup
//      SELECT id, name FROM study_themes
//        WHERE user_id = $1 AND is_curated = true
//        AND linked_stats @> jsonb_build_array($2::text)
//      LIMIT 1
//
// 4. Migration v1 → v2 (migration 0059):
//      UPDATE study_themes
//        SET is_curated = false
//        WHERE is_curated = true AND slug = ANY($LEGACY_CURATED_SLUGS_V1)
//    Preserva rows + FKs (sessions, spot_links). Os 20 v2 entram via lazy seed.
//
// 5. Note de stat_id: as strings em linkedStats sao referencias logicas ao
//    HUD_STAT_CATALOG (shared/hud-stat-catalog.ts). Validacao runtime opcional
//    contra STAT_INDEX_BY_ID.
