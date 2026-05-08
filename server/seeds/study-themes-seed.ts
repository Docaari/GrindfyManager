// =============================================================================
// Sprint Estudos-Habito-1 — Curated Study Themes Seed (ADR-127)
//
// 30 temas curated em 5 categorias. Cada tema com:
//   - slug (kebab-case unico)
//   - name (PT-BR)
//   - color hex + emoji default (string vazia — user customiza no UI)
//   - category enum
//   - linkedStats: array de stat_id do HUD_STAT_CATALOG (RF-3.3 auto-suggest)
//   - linkedLessons: array de lesson_id da Biblioteca (best-effort lookup at seed time)
//
// Idempotente. Roda lazy per-user no primeiro GET /api/study-themes via
// storage.ensureCuratedThemesForUser(userId).
// Roda manualmente via scripts/seed-study-themes.ts --user USER-XXXX.
// =============================================================================

export type CuratedCategory = "preflop" | "postflop" | "icm" | "mental" | "specific";

export interface CuratedTheme {
  slug: string;                         // unique kebab-case
  name: string;                         // PT-BR
  color: string;                        // hex 7 chars
  emoji: string;                        // default empty; user pode customizar
  category: CuratedCategory;
  linkedStats: string[];                // stat_id do HUD_STAT_CATALOG
  linkedLessonSlugs: string[];          // slugs da Biblioteca; o storage resolve para library_lessons.id
}

// =============================================================================
// PREFLOP — 8 themes
// =============================================================================

const PREFLOP: CuratedTheme[] = [
  {
    slug: "preflop-rfi-tight",
    name: "RFI Tight (mid+late stages)",
    color: "#0ea5e9",
    emoji: "",
    category: "preflop",
    linkedStats: ["rfi_overall", "rfi_ep", "rfi_mp"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-rfi-loose",
    name: "RFI Loose (early stages)",
    color: "#0ea5e9",
    emoji: "",
    category: "preflop",
    linkedStats: ["rfi_overall", "rfi_btn", "rfi_co"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-3bet-ip",
    name: "3-bet em posicao",
    color: "#22c55e",
    emoji: "",
    category: "preflop",
    linkedStats: ["threebet_pct", "threebet_btn_vs_co", "threebet_co_vs_mp"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-3bet-oop",
    name: "3-bet fora de posicao",
    color: "#22c55e",
    emoji: "",
    category: "preflop",
    linkedStats: ["threebet_pct", "threebet_sb_vs_btn", "threebet_bb_vs_btn"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-vs-3bet",
    name: "Defesa vs 3-bet (flat/4-bet)",
    color: "#a855f7",
    emoji: "",
    category: "preflop",
    linkedStats: ["fold_to_3bet", "call_3bet_pct", "fourbet_pct"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-bb-defense",
    name: "BB Defense (call vs raise)",
    color: "#a855f7",
    emoji: "",
    category: "preflop",
    linkedStats: ["bb_defense_pct", "bb_call_vs_btn", "bb_call_vs_co"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-blind-war-squeeze",
    name: "Blind War + Squeeze",
    color: "#f97316",
    emoji: "",
    category: "preflop",
    linkedStats: ["squeeze_pct", "sb_vs_btn_steal", "bb_vs_btn_3bet"],
    linkedLessonSlugs: [],
  },
  {
    slug: "preflop-late-reg-deep",
    name: "Late reg deep stack",
    color: "#eab308",
    emoji: "",
    category: "preflop",
    linkedStats: ["rfi_overall", "threebet_pct"],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// POSTFLOP — 8 themes
// =============================================================================

const POSTFLOP: CuratedTheme[] = [
  {
    slug: "postflop-cbet-oop-small",
    name: "C-bet OOP small (range bet)",
    color: "#f59e0b",
    emoji: "",
    category: "postflop",
    linkedStats: ["cbet_flop_oop", "cbet_flop_oop_pfr", "cbet_size_small"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-cbet-oop-polar",
    name: "C-bet OOP polarizado",
    color: "#f59e0b",
    emoji: "",
    category: "postflop",
    linkedStats: ["cbet_flop_oop", "cbet_size_big"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-donk-leads",
    name: "Donk leads (when, why, when not)",
    color: "#84cc16",
    emoji: "",
    category: "postflop",
    linkedStats: ["donk_lead_flop", "donk_lead_turn"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-turn-barrel",
    name: "Turn barrel decision",
    color: "#10b981",
    emoji: "",
    category: "postflop",
    linkedStats: ["double_barrel_pct", "turn_cbet_pfr_ip", "fold_to_turn_cbet"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-river-bluff-value",
    name: "River bluff vs value",
    color: "#06b6d4",
    emoji: "",
    category: "postflop",
    linkedStats: ["triple_barrel_pct", "river_bet_pct", "fold_to_river_bet"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-multiway-cbet",
    name: "Multiway c-bet (3+ players)",
    color: "#3b82f6",
    emoji: "",
    category: "postflop",
    linkedStats: ["cbet_flop_multiway", "cbet_flop_3way"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-cooler-river",
    name: "Cooler spots no river",
    color: "#8b5cf6",
    emoji: "",
    category: "postflop",
    linkedStats: ["river_bet_pct", "fold_to_river_bet"],
    linkedLessonSlugs: [],
  },
  {
    slug: "postflop-board-texture",
    name: "Analise de textura de board",
    color: "#ec4899",
    emoji: "",
    category: "postflop",
    linkedStats: ["cbet_flop_oop", "cbet_flop_ip"],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// ICM — 6 themes
// =============================================================================

const ICM: CuratedTheme[] = [
  {
    slug: "icm-bubble-play",
    name: "ICM no bubble",
    color: "#dc2626",
    emoji: "",
    category: "icm",
    linkedStats: ["push_fold_threshold_15bb", "fold_pct_bubble", "shove_range_btn"],
    linkedLessonSlugs: ["a6-seis-medos-do-poker"],
  },
  {
    slug: "icm-final-table",
    name: "Final table ICM",
    color: "#dc2626",
    emoji: "",
    category: "icm",
    linkedStats: ["push_fold_threshold_15bb", "shove_range_btn", "shove_range_co"],
    linkedLessonSlugs: [],
  },
  {
    slug: "icm-pay-jumps",
    name: "Pay jumps strategy",
    color: "#b91c1c",
    emoji: "",
    category: "icm",
    linkedStats: ["fold_pct_bubble"],
    linkedLessonSlugs: [],
  },
  {
    slug: "icm-ft-ladder",
    name: "FT ladder management",
    color: "#b91c1c",
    emoji: "",
    category: "icm",
    linkedStats: ["push_fold_threshold_15bb"],
    linkedLessonSlugs: [],
  },
  {
    slug: "icm-stack-aware",
    name: "Stack-aware ICM (covered/coverer)",
    color: "#991b1b",
    emoji: "",
    category: "icm",
    linkedStats: ["shove_range_btn", "fold_to_shove_pct"],
    linkedLessonSlugs: [],
  },
  {
    slug: "icm-mtt-push-fold",
    name: "MTT push/fold (10-20bb)",
    color: "#991b1b",
    emoji: "",
    category: "icm",
    linkedStats: ["push_fold_threshold_15bb", "shove_range_btn", "fold_to_shove_pct"],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// MENTAL — 5 themes (heavy linkedLessons — Bloco A "Antes das Cartas")
// =============================================================================

const MENTAL: CuratedTheme[] = [
  {
    slug: "mental-tilt-control",
    name: "Tilt control",
    color: "#7c3aed",
    emoji: "",
    category: "mental",
    linkedStats: [],
    linkedLessonSlugs: ["a7-combustivel-nao-gatilho", "a4-responsabilidade-vs-culpa"],
  },
  {
    slug: "mental-a-game",
    name: "A-game maintenance",
    color: "#7c3aed",
    emoji: "",
    category: "mental",
    linkedStats: [],
    linkedLessonSlugs: ["a1-mentalidade-fixa-vs-crescimento", "a9-sistema-acima-forca-vontade"],
  },
  {
    slug: "mental-loss-recovery",
    name: "Loss recovery (post-downswing)",
    color: "#6d28d9",
    emoji: "",
    category: "mental",
    linkedStats: [],
    linkedLessonSlugs: ["a4-responsabilidade-vs-culpa", "a3-identidade-como-narrativa"],
  },
  {
    slug: "mental-variance-acceptance",
    name: "Variance acceptance",
    color: "#6d28d9",
    emoji: "",
    category: "mental",
    linkedStats: [],
    linkedLessonSlugs: ["a2-dicotomia-do-controle"],
  },
  {
    slug: "mental-decision-fatigue",
    name: "Decision fatigue",
    color: "#5b21b6",
    emoji: "",
    category: "mental",
    linkedStats: [],
    linkedLessonSlugs: ["a9-sistema-acima-forca-vontade"],
  },
];

// =============================================================================
// SPECIFIC — 3 themes
// =============================================================================

const SPECIFIC: CuratedTheme[] = [
  {
    slug: "specific-short-stack",
    name: "Short stack push/fold (5-15bb)",
    color: "#0891b2",
    emoji: "",
    category: "specific",
    linkedStats: ["push_fold_threshold_15bb", "shove_range_btn", "fold_to_shove_pct"],
    linkedLessonSlugs: [],
  },
  {
    slug: "specific-phased-day2",
    name: "Phased Day 2 strategy",
    color: "#0891b2",
    emoji: "",
    category: "specific",
    linkedStats: [],
    linkedLessonSlugs: [],
  },
  {
    slug: "specific-satellite-bubble",
    name: "Satellite bubble (flat ICM)",
    color: "#0e7490",
    emoji: "",
    category: "specific",
    linkedStats: ["push_fold_threshold_15bb", "fold_pct_bubble"],
    linkedLessonSlugs: [],
  },
];

// =============================================================================
// EXPORT — 30 themes total
// =============================================================================

export const CURATED_STUDY_THEMES: CuratedTheme[] = [
  ...PREFLOP,
  ...POSTFLOP,
  ...ICM,
  ...MENTAL,
  ...SPECIFIC,
];

// Sanity check — fail at module load if count diverges from spec.
if (CURATED_STUDY_THEMES.length !== 30) {
  throw new Error(
    `[study-themes-seed] expected 30 curated themes, got ${CURATED_STUDY_THEMES.length}. ` +
    `Categories: preflop=${PREFLOP.length} postflop=${POSTFLOP.length} icm=${ICM.length} ` +
    `mental=${MENTAL.length} specific=${SPECIFIC.length}.`,
  );
}

export const CURATED_STUDY_THEMES_BY_CATEGORY: Record<CuratedCategory, CuratedTheme[]> = {
  preflop: PREFLOP,
  postflop: POSTFLOP,
  icm: ICM,
  mental: MENTAL,
  specific: SPECIFIC,
};

// =============================================================================
// NOTAS DE INTEGRACAO (storage layer — implementer)
// =============================================================================
// 1. ensureCuratedThemesForUser(userId): chamado lazy no primeiro GET /api/study-themes
//    quando o user nao tem rows com is_curated=true. Faz INSERT ON CONFLICT DO NOTHING
//    para cada CuratedTheme — UNIQUE parcial uq_study_themes_user_slug_curated garante
//    idempotency.
//
// 2. resolveLessonSlugsToIds(slugs: string[]): query
//      SELECT id FROM library_lessons WHERE slug = ANY($1) AND is_published = true
//    Retorna {slug -> id} map. Slugs nao encontrados sao silenciosamente dropped do
//    linked_lessons array — nao quebra seed.
//
// 3. Auto-suggest (RF-3.3): query lookup
//      SELECT id, name FROM study_themes
//        WHERE user_id = $1 AND is_curated = true
//        AND linked_stats @> jsonb_build_array($2::text)
//      LIMIT 1
//    Hits o GIN index idx_study_themes_curated_stats.
//
// 4. Update do catalog futuro: incrementar themes ou ajustar linkedStats requer
//    re-rodar seed para todos os users (`npx tsx scripts/seed-study-themes.ts --refresh`).
//    INSERT ON CONFLICT continua idempotent; UPDATE explicito quando linked_stats muda.
//
// 5. Note de stat_id: as strings em linkedStats sao referencias logicas ao
//    HUD_STAT_CATALOG (shared/hud-stat-catalog.ts). NAO ha FK; ao detectar
//    stat removida do catalog, a UI mostra warning + CTA "Remover" (spec RF-3
//    edge case "Catalog HUD nao tem stat_id mais"). Implementer deve validar
//    em runtime que cada stat_id em linkedStats existe no catalog atual antes
//    de seed (prevenir typos).
