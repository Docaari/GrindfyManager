// =============================================================================
// Sprint Stats-V2 — Catalogo HUD estatico (RF-01, RF-02, RF-15)
//
// Catalogo de 200+ stats HUD profissionais espelhando export PT4. Usado por:
//   - Customizer (escolha de stats por layout)
//   - Comparator/heatmap (cores via direction semantics — ADR-063)
//   - Coach tool grouped (ADR-062)
//
// Versionado via git (sem persistencia DB — ADR-058).
// =============================================================================

export type StatDirection =
  | "higher_better"
  | "lower_better"
  | "context"
  | "neutral";

export type StatUnit = "pct" | "bb" | "count";

export type HudGroupId =
  | "basics"
  | "rfi"
  | "threebet"
  | "resteal"
  | "pos_flop_pfr_ip"
  | "pos_flop_pfr_oop"
  | "pos_flop_multiway"
  | "cbets_by_board"
  | "caller_pre_flop"
  | "threeway_bb"
  | "bb_defense"
  | "pos_flop_pfc_ip"
  | "blind_war_sb"
  | "blind_war_bb"
  | "threebet_pot_ip"
  | "threebet_pot_oop_vs_lp";

export interface StatField {
  id: string;
  label: string;
  group: HudGroupId;
  subgroup?: string;
  targetMin: number;
  targetMax: number;
  direction: StatDirection;
  unit: StatUnit;
  formula?: string;
}

// Ordem dos grupos preservada em iteracao por payload V2 (ADR-062).
export const HUD_GROUP_IDS: HudGroupId[] = [
  "basics",
  "rfi",
  "threebet",
  "resteal",
  "pos_flop_pfr_ip",
  "pos_flop_pfr_oop",
  "pos_flop_multiway",
  "cbets_by_board",
  "caller_pre_flop",
  "threeway_bb",
  "bb_defense",
  "pos_flop_pfc_ip",
  "blind_war_sb",
  "blind_war_bb",
  "threebet_pot_ip",
  "threebet_pot_oop_vs_lp",
];

// Labels PT-BR por grupo (RF-02).
export const HUD_GROUP_LABELS: Record<HudGroupId, string> = {
  basics: "Basicos",
  rfi: "RFI por posicao",
  threebet: "3Bet",
  resteal: "Resteal",
  pos_flop_pfr_ip: "Pos-flop PFR IP",
  pos_flop_pfr_oop: "Pos-flop PFR OOP",
  pos_flop_multiway: "Pos-flop Multiway",
  cbets_by_board: "CBets por textura",
  caller_pre_flop: "Caller pre-flop",
  threeway_bb: "3-way BB",
  bb_defense: "BB defense",
  pos_flop_pfc_ip: "Pos-flop PFC IP",
  blind_war_sb: "Blind war SB",
  blind_war_bb: "Blind war BB",
  threebet_pot_ip: "3Bet pot IP",
  threebet_pot_oop_vs_lp: "3Bet pot OOP vs LP",
};

// -----------------------------------------------------------------------------
// Helpers para construir entries em batch sem boilerplate
// -----------------------------------------------------------------------------

function entry(unit: StatUnit) {
  return (
    id: string,
    label: string,
    group: HudGroupId,
    targetMin: number,
    targetMax: number,
    direction: StatDirection,
  ): StatField => ({ id, label, group, targetMin, targetMax, direction, unit });
}

const pct = entry("pct");
const bb = entry("bb");
const cnt = entry("count");

// -----------------------------------------------------------------------------
// Catalogo (>=200 entries)
// -----------------------------------------------------------------------------

export const HUD_STAT_CATALOG: StatField[] = [
  // === basics (12) ===
  pct("vpip", "VPIP", "basics", 20, 25, "context"),
  pct("pfr", "PFR", "basics", 16, 20, "context"),
  pct("wwsf_pct", "WWSF", "basics", 45, 55, "higher_better"),
  pct("wtsd", "WTSD", "basics", 24, 30, "context"),
  pct("wsd", "W$SD", "basics", 48, 55, "higher_better"),
  pct("threebet_pf", "3Bet PF", "basics", 6, 9, "context"),
  pct("fold_to_3bet", "Fold to 3Bet", "basics", 50, 60, "lower_better"),
  pct("fourbet_pf", "4Bet PF", "basics", 4, 8, "context"),
  pct("fold_to_4bet", "Fold to 4Bet", "basics", 45, 55, "lower_better"),
  cnt("af", "AF", "basics", 2, 4, "neutral"),
  cnt("hands_played", "Hands", "basics", 0, 1000000, "neutral"),
  bb("bb_per_100", "BB/100", "basics", 5, 15, "higher_better"),

  // === rfi (15) ===
  pct("rfi_ep", "RFI EP", "rfi", 12, 16, "context"),
  pct("rfi_mp", "RFI MP", "rfi", 14, 18, "context"),
  pct("rfi_lj", "RFI LJ", "rfi", 16, 22, "context"),
  pct("rfi_hj", "RFI HJ", "rfi", 20, 26, "context"),
  pct("rfi_co", "RFI CO", "rfi", 26, 32, "context"),
  pct("rfi_btn", "RFI BTN", "rfi", 40, 50, "context"),
  pct("rfi_sb", "RFI SB", "rfi", 28, 38, "context"),
  pct("rfi_sb_17bb_plus", "RFI SB (17bb+)", "rfi", 30, 40, "context"),
  pct("rfi_sb_short", "RFI SB short", "rfi", 35, 45, "context"),
  pct("rfi_btn_short", "RFI BTN short", "rfi", 45, 55, "context"),
  pct("rfi_co_short", "RFI CO short", "rfi", 30, 38, "context"),
  pct("limp_pf", "Limp PF", "rfi", 0, 2, "lower_better"),
  bb("open_raise_size_avg", "Open size avg", "rfi", 2, 3, "neutral"),
  pct("rfi_total", "RFI total", "rfi", 22, 28, "context"),
  pct("rfi_late_position", "RFI LP", "rfi", 30, 40, "context"),

  // === threebet (20) ===
  pct("threebet_total", "3Bet total", "threebet", 6, 9, "context"),
  pct("threebet_short", "3Bet short", "threebet", 8, 12, "context"),
  pct("threebet_vs_short", "3Bet vs short", "threebet", 8, 12, "context"),
  pct("threebet_non_btn", "3Bet non-BTN", "threebet", 5, 8, "context"),
  pct("threebet_btn", "3Bet BTN", "threebet", 8, 12, "context"),
  pct("threebet_co", "3Bet CO", "threebet", 7, 10, "context"),
  pct("threebet_sb", "3Bet SB", "threebet", 9, 13, "context"),
  pct("threebet_bb", "3Bet BB", "threebet", 10, 14, "context"),
  pct("threebet_sb_vs_steal", "3Bet SB vs steal", "threebet", 12, 16, "context"),
  pct("threebet_bb_vs_steal", "3Bet BB vs steal", "threebet", 14, 18, "context"),
  pct("threebet_vs_ep", "3Bet vs EP", "threebet", 4, 7, "context"),
  pct("threebet_vs_lp", "3Bet vs LP", "threebet", 8, 12, "context"),
  pct("fold_vs_threebet_oop", "Fold vs 3Bet OOP", "threebet", 50, 60, "lower_better"),
  pct("fold_vs_threebet_ip", "Fold vs 3Bet IP", "threebet", 45, 55, "lower_better"),
  pct("fold_vs_3bet", "Fold vs 3Bet", "threebet", 50, 60, "lower_better"),
  pct("call_vs_3bet_ip", "Call vs 3Bet IP", "threebet", 25, 35, "context"),
  pct("call_vs_3bet_oop", "Call vs 3Bet OOP", "threebet", 15, 25, "context"),
  pct("fourbet_vs_3bet", "4Bet vs 3Bet", "threebet", 8, 14, "context"),
  pct("squeeze_pf", "Squeeze PF", "threebet", 6, 10, "context"),
  pct("cold_4bet", "Cold 4Bet", "threebet", 2, 5, "context"),

  // === resteal (10) ===
  pct("sb_resteal", "SB Resteal", "resteal", 10, 16, "context"),
  pct("bb_resteal", "BB Resteal", "resteal", 12, 18, "context"),
  pct("resteal_vs_btn", "Resteal vs BTN", "resteal", 12, 18, "context"),
  pct("resteal_vs_co", "Resteal vs CO", "resteal", 10, 16, "context"),
  pct("resteal_vs_sb", "Resteal vs SB", "resteal", 14, 20, "context"),
  pct("fold_to_resteal", "Fold vs Resteal", "resteal", 50, 60, "lower_better"),
  pct("call_resteal", "Call Resteal", "resteal", 20, 30, "context"),
  pct("fourbet_vs_resteal", "4Bet vs Resteal", "resteal", 12, 18, "context"),
  pct("resteal_short", "Resteal short", "resteal", 18, 26, "context"),
  pct("resteal_total", "Resteal total", "resteal", 12, 18, "context"),

  // === pos_flop_pfr_ip (14) ===
  pct("cbet_flop_ip", "CBet Flop IP", "pos_flop_pfr_ip", 55, 70, "context"),
  pct("cbet_ip_vs_bb", "CBet IP vs BB", "pos_flop_pfr_ip", 55, 70, "context"),
  pct("second_barrel_vs_bb", "2nd Barrel vs BB", "pos_flop_pfr_ip", 45, 55, "context"),
  pct("third_barrel_vs_bb", "3rd Barrel vs BB", "pos_flop_pfr_ip", 35, 50, "context"),
  pct("cbet_flop_utg_vs_bb", "CBet Flop UTG vs BB", "pos_flop_pfr_ip", 55, 70, "context"),
  pct("cbet_turn_utg_vs_bb", "CBet Turn UTG vs BB", "pos_flop_pfr_ip", 45, 55, "context"),
  pct("cbet_river_utg_vs_bb", "CBet River UTG vs BB", "pos_flop_pfr_ip", 35, 50, "context"),
  pct("bxb", "BxB", "pos_flop_pfr_ip", 35, 45, "context"),
  pct("fold_vs_xr_flop", "Fold vs XR Flop", "pos_flop_pfr_ip", 35, 50, "lower_better"),
  pct("call_vs_xr_flop", "Call vs XR Flop", "pos_flop_pfr_ip", 35, 50, "context"),
  pct("call_vs_xr_bet_bet", "Call vs XR Bet-Bet", "pos_flop_pfr_ip", 30, 45, "context"),
  pct("fold_vs_probe_river", "Fold vs Probe River", "pos_flop_pfr_ip", 40, 55, "lower_better"),
  pct("call_vs_probe_river", "Call vs Probe River", "pos_flop_pfr_ip", 35, 50, "context"),
  pct("raise_vs_probe_river", "Raise vs Probe River", "pos_flop_pfr_ip", 5, 12, "context"),

  // === pos_flop_pfr_oop (12) ===
  pct("cbet_flop_oop", "CBet Flop OOP", "pos_flop_pfr_oop", 50, 65, "context"),
  pct("xf_flop", "X/F Flop", "pos_flop_pfr_oop", 30, 45, "context"),
  pct("xc_flop", "X/C Flop", "pos_flop_pfr_oop", 20, 30, "context"),
  pct("xr_flop", "X/R Flop", "pos_flop_pfr_oop", 8, 14, "context"),
  pct("second_barrel_oop", "2nd Barrel OOP", "pos_flop_pfr_oop", 40, 55, "context"),
  pct("delay_cbet_oop", "Delay CBet OOP", "pos_flop_pfr_oop", 25, 40, "context"),
  pct("third_barrel_oop", "3rd Barrel OOP", "pos_flop_pfr_oop", 30, 45, "context"),
  pct("xx_bet_bet", "XX-Bet-Bet OOP", "pos_flop_pfr_oop", 35, 50, "context"),
  pct("xx_bet_xf", "XX-Bet-X/F OOP", "pos_flop_pfr_oop", 30, 45, "context"),
  pct("fold_vs_cbet_oop", "Fold vs CBet OOP", "pos_flop_pfr_oop", 45, 55, "lower_better"),
  pct("probe_turn_oop", "Probe Turn OOP", "pos_flop_pfr_oop", 35, 50, "context"),
  pct("probe_river_oop", "Probe River OOP", "pos_flop_pfr_oop", 25, 40, "context"),

  // === pos_flop_multiway (10) ===
  pct("cbet_multiway_3way", "CBet 3-way", "pos_flop_multiway", 30, 45, "context"),
  pct("cbet_multiway_4way_plus", "CBet 4+ way", "pos_flop_multiway", 20, 35, "context"),
  pct("fold_to_cbet_multiway", "Fold to CBet MW", "pos_flop_multiway", 55, 70, "lower_better"),
  pct("call_cbet_multiway", "Call CBet MW", "pos_flop_multiway", 25, 40, "context"),
  pct("raise_cbet_multiway", "Raise CBet MW", "pos_flop_multiway", 5, 12, "context"),
  pct("xc_multiway", "X/C MW", "pos_flop_multiway", 20, 35, "context"),
  pct("xr_multiway", "X/R MW", "pos_flop_multiway", 5, 12, "context"),
  bb("multiway_pot_size_avg", "MW pot size avg", "pos_flop_multiway", 0, 100, "neutral"),
  pct("wwsf_multiway", "WWSF MW", "pos_flop_multiway", 35, 45, "higher_better"),
  pct("wtsd_multiway", "WTSD MW", "pos_flop_multiway", 28, 36, "context"),

  // === cbets_by_board (12) ===
  pct("cbet_dry_board", "CBet Dry Board", "cbets_by_board", 65, 80, "context"),
  pct("cbet_wet_board", "CBet Wet Board", "cbets_by_board", 40, 55, "context"),
  pct("cbet_paired_board", "CBet Paired", "cbets_by_board", 60, 75, "context"),
  pct("cbet_monotone_board", "CBet Monotone", "cbets_by_board", 35, 50, "context"),
  pct("cbet_two_tone_board", "CBet 2-Tone", "cbets_by_board", 45, 60, "context"),
  pct("cbet_low_board", "CBet Low Board", "cbets_by_board", 60, 75, "context"),
  pct("cbet_high_board", "CBet High Board", "cbets_by_board", 50, 65, "context"),
  pct("cbet_a_high_board", "CBet A-High", "cbets_by_board", 65, 80, "context"),
  pct("cbet_k_high_board", "CBet K-High", "cbets_by_board", 60, 75, "context"),
  pct("cbet_q_high_board", "CBet Q-High", "cbets_by_board", 55, 70, "context"),
  pct("cbet_connected_board", "CBet Connected", "cbets_by_board", 45, 60, "context"),
  pct("cbet_disconnected_board", "CBet Disconnected", "cbets_by_board", 60, 75, "context"),

  // === caller_pre_flop (8) ===
  pct("cold_call_total", "Cold Call total", "caller_pre_flop", 4, 8, "context"),
  pct("cold_call_btn", "Cold Call BTN", "caller_pre_flop", 6, 12, "context"),
  pct("cold_call_co", "Cold Call CO", "caller_pre_flop", 4, 8, "context"),
  pct("cold_call_sb", "Cold Call SB", "caller_pre_flop", 5, 10, "context"),
  pct("cold_call_vs_ep", "Cold Call vs EP", "caller_pre_flop", 3, 6, "context"),
  pct("cold_call_vs_lp", "Cold Call vs LP", "caller_pre_flop", 6, 12, "context"),
  pct("flat_3bet", "Flat 3Bet", "caller_pre_flop", 12, 22, "context"),
  pct("squeeze_caller", "Squeeze (caller)", "caller_pre_flop", 6, 10, "context"),

  // === threeway_bb (8) ===
  pct("bb_defense_3way", "BB defense 3-way", "threeway_bb", 30, 40, "context"),
  pct("bb_3bet_3way", "BB 3Bet 3-way", "threeway_bb", 8, 14, "context"),
  pct("bb_call_3way", "BB Call 3-way", "threeway_bb", 25, 35, "context"),
  pct("bb_fold_3way", "BB Fold 3-way", "threeway_bb", 55, 70, "context"),
  pct("bb_squeeze_3way", "BB Squeeze 3-way", "threeway_bb", 8, 14, "context"),
  pct("bb_donk_3way", "BB Donk 3-way", "threeway_bb", 5, 10, "context"),
  pct("bb_xr_3way", "BB X/R 3-way", "threeway_bb", 8, 14, "context"),
  pct("bb_xc_3way", "BB X/C 3-way", "threeway_bb", 25, 40, "context"),

  // === bb_defense (16) ===
  pct("bb_defend_vs_steal", "BB Defend vs Steal", "bb_defense", 50, 65, "higher_better"),
  pct("bb_fold_vs_steal", "BB Fold vs Steal", "bb_defense", 35, 50, "lower_better"),
  pct("bb_call_vs_steal", "BB Call vs Steal", "bb_defense", 30, 45, "context"),
  pct("bb_3bet_vs_steal", "BB 3Bet vs Steal", "bb_defense", 14, 20, "context"),
  pct("bb_fold_vs_btn", "BB Fold vs BTN", "bb_defense", 30, 45, "lower_better"),
  pct("bb_fold_vs_co", "BB Fold vs CO", "bb_defense", 35, 50, "lower_better"),
  pct("bb_fold_vs_sb", "BB Fold vs SB", "bb_defense", 25, 40, "lower_better"),
  pct("bb_fold_vs_ep", "BB Fold vs EP", "bb_defense", 50, 65, "lower_better"),
  pct("bb_3bet_vs_btn", "BB 3Bet vs BTN", "bb_defense", 14, 20, "context"),
  pct("bb_3bet_vs_co", "BB 3Bet vs CO", "bb_defense", 12, 18, "context"),
  pct("bb_3bet_vs_sb", "BB 3Bet vs SB", "bb_defense", 14, 20, "context"),
  pct("bb_call_vs_btn", "BB Call vs BTN", "bb_defense", 32, 45, "context"),
  pct("bb_call_vs_co", "BB Call vs CO", "bb_defense", 30, 42, "context"),
  pct("bb_call_vs_sb", "BB Call vs SB", "bb_defense", 35, 50, "context"),
  pct("bb_check_raise_flop", "BB X/R Flop", "bb_defense", 8, 14, "context"),
  pct("bb_donk_flop", "BB Donk Flop", "bb_defense", 5, 12, "context"),

  // === pos_flop_pfc_ip (10) ===
  pct("float_flop_ip", "Float Flop IP", "pos_flop_pfc_ip", 35, 50, "context"),
  pct("raise_cbet_ip", "Raise CBet IP", "pos_flop_pfc_ip", 8, 14, "context"),
  pct("call_cbet_ip", "Call CBet IP", "pos_flop_pfc_ip", 35, 50, "context"),
  pct("fold_cbet_ip", "Fold CBet IP", "pos_flop_pfc_ip", 38, 50, "lower_better"),
  pct("lead_flop_ip", "Lead Flop IP", "pos_flop_pfc_ip", 5, 12, "context"),
  pct("float_turn_ip", "Float Turn IP", "pos_flop_pfc_ip", 25, 38, "context"),
  pct("raise_turn_ip", "Raise Turn IP", "pos_flop_pfc_ip", 8, 14, "context"),
  pct("call_turn_cbet_ip", "Call Turn CBet IP", "pos_flop_pfc_ip", 35, 50, "context"),
  pct("fold_turn_cbet_ip", "Fold Turn CBet IP", "pos_flop_pfc_ip", 35, 50, "lower_better"),
  pct("river_steal_ip", "River Steal IP", "pos_flop_pfc_ip", 18, 30, "context"),

  // === blind_war_sb (28) ===
  pct("sb_open_vs_bb", "SB Open vs BB", "blind_war_sb", 35, 50, "context"),
  pct("sb_complete_vs_bb", "SB Complete vs BB", "blind_war_sb", 0, 5, "lower_better"),
  pct("sb_3bet_vs_bb_iso", "SB 3Bet vs BB iso", "blind_war_sb", 12, 18, "context"),
  pct("sb_fold_vs_bb_3bet", "SB Fold vs BB 3Bet", "blind_war_sb", 50, 60, "lower_better"),
  pct("sb_4bet_vs_bb", "SB 4Bet vs BB", "blind_war_sb", 8, 14, "context"),
  pct("sb_call_vs_bb_3bet", "SB Call vs BB 3Bet", "blind_war_sb", 25, 38, "context"),
  pct("sb_cbet_vs_bb_flop", "SB CBet vs BB Flop", "blind_war_sb", 50, 65, "context"),
  pct("sb_cbet_vs_bb_turn", "SB CBet vs BB Turn", "blind_war_sb", 40, 55, "context"),
  pct("sb_cbet_vs_bb_river", "SB CBet vs BB River", "blind_war_sb", 30, 45, "context"),
  pct("sb_xc_vs_bb_flop", "SB X/C vs BB Flop", "blind_war_sb", 25, 38, "context"),
  pct("sb_xr_vs_bb_flop", "SB X/R vs BB Flop", "blind_war_sb", 8, 14, "context"),
  pct("sb_xf_vs_bb_flop", "SB X/F vs BB Flop", "blind_war_sb", 30, 45, "context"),
  pct("sb_steal_attempt", "SB Steal attempt", "blind_war_sb", 40, 55, "context"),
  pct("sb_steal_success", "SB Steal success", "blind_war_sb", 50, 65, "higher_better"),
  pct("sb_3bet_pf_vs_bb", "SB 3Bet PF vs BB", "blind_war_sb", 14, 22, "context"),
  pct("sb_limp_vs_bb", "SB Limp vs BB", "blind_war_sb", 0, 3, "lower_better"),
  pct("sb_iso_limp", "SB Iso Limp", "blind_war_sb", 25, 40, "context"),
  bb("sb_open_size_vs_bb", "SB Open size", "blind_war_sb", 2, 2.8, "neutral"),
  pct("sb_call_vs_bb_oop", "SB Call vs BB OOP", "blind_war_sb", 18, 30, "context"),
  pct("sb_donk_flop", "SB Donk Flop", "blind_war_sb", 5, 10, "context"),
  pct("sb_probe_turn", "SB Probe Turn", "blind_war_sb", 30, 45, "context"),
  pct("sb_probe_river", "SB Probe River", "blind_war_sb", 25, 40, "context"),
  pct("sb_xx_river_bet", "SB XX River Bet", "blind_war_sb", 30, 45, "context"),
  pct("sb_call_vs_bb_xr", "SB Call vs BB XR", "blind_war_sb", 30, 45, "context"),
  pct("sb_fold_vs_bb_xr", "SB Fold vs BB XR", "blind_war_sb", 35, 50, "lower_better"),
  pct("sb_raise_vs_bb_xr", "SB Raise vs BB XR", "blind_war_sb", 8, 14, "context"),
  pct("sb_wtsd_vs_bb", "SB WTSD vs BB", "blind_war_sb", 28, 38, "context"),
  pct("sb_wsd_vs_bb", "SB W$SD vs BB", "blind_war_sb", 45, 55, "higher_better"),

  // === blind_war_bb (26) ===
  pct("bb_defend_vs_sb_open", "BB Defend vs SB Open", "blind_war_bb", 60, 75, "higher_better"),
  pct("bb_3bet_vs_sb_open", "BB 3Bet vs SB Open", "blind_war_bb", 14, 22, "context"),
  pct("bb_call_vs_sb_open", "BB Call vs SB Open", "blind_war_bb", 40, 55, "context"),
  pct("bb_fold_vs_sb_open", "BB Fold vs SB Open", "blind_war_bb", 25, 40, "lower_better"),
  pct("bb_4bet_vs_sb", "BB 4Bet vs SB", "blind_war_bb", 8, 14, "context"),
  pct("bb_iso_vs_sb_limp", "BB Iso vs SB Limp", "blind_war_bb", 35, 50, "context"),
  pct("bb_check_vs_sb_limp", "BB Check vs SB Limp", "blind_war_bb", 50, 65, "context"),
  pct("bb_donk_flop_sb", "BB Donk Flop vs SB", "blind_war_bb", 5, 12, "context"),
  pct("bb_xc_flop_sb", "BB X/C Flop vs SB", "blind_war_bb", 28, 40, "context"),
  pct("bb_xr_flop_sb", "BB X/R Flop vs SB", "blind_war_bb", 8, 14, "context"),
  pct("bb_xf_flop_sb", "BB X/F Flop vs SB", "blind_war_bb", 30, 45, "context"),
  pct("bb_xc_turn_sb", "BB X/C Turn vs SB", "blind_war_bb", 25, 38, "context"),
  pct("bb_xr_turn_sb", "BB X/R Turn vs SB", "blind_war_bb", 6, 12, "context"),
  pct("bb_probe_turn_sb", "BB Probe Turn vs SB", "blind_war_bb", 30, 45, "context"),
  pct("bb_probe_river_sb", "BB Probe River vs SB", "blind_war_bb", 25, 40, "context"),
  pct("bb_call_vs_sb_cbet", "BB Call vs SB CBet", "blind_war_bb", 35, 50, "context"),
  pct("bb_fold_vs_sb_cbet", "BB Fold vs SB CBet", "blind_war_bb", 35, 50, "lower_better"),
  pct("bb_raise_vs_sb_cbet", "BB Raise vs SB CBet", "blind_war_bb", 8, 14, "context"),
  pct("bb_xx_river_bet_sb", "BB XX River Bet vs SB", "blind_war_bb", 30, 45, "context"),
  pct("bb_lead_flop_sb", "BB Lead Flop vs SB", "blind_war_bb", 5, 12, "context"),
  pct("bb_open_3bet_pot_sb", "BB Open 3Bet Pot vs SB", "blind_war_bb", 50, 65, "context"),
  pct("bb_wtsd_vs_sb", "BB WTSD vs SB", "blind_war_bb", 28, 38, "context"),
  pct("bb_wsd_vs_sb", "BB W$SD vs SB", "blind_war_bb", 48, 55, "higher_better"),
  pct("bb_resteal_short_sb", "BB Resteal short vs SB", "blind_war_bb", 18, 28, "context"),
  pct("bb_call_short_sb", "BB Call short vs SB", "blind_war_bb", 45, 60, "context"),
  pct("bb_fold_short_sb", "BB Fold short vs SB", "blind_war_bb", 25, 40, "lower_better"),

  // === threebet_pot_ip (8) ===
  pct("cbet_3bet_pot_ip", "CBet 3Bet Pot IP", "threebet_pot_ip", 50, 65, "context"),
  pct("second_barrel_3bet_pot_ip", "2nd Barrel 3Bet IP", "threebet_pot_ip", 45, 60, "context"),
  pct("third_barrel_3bet_pot_ip", "3rd Barrel 3Bet IP", "threebet_pot_ip", 35, 50, "context"),
  pct("xb_3bet_pot_ip", "X-back 3Bet IP", "threebet_pot_ip", 25, 40, "context"),
  pct("fold_vs_xr_3bet_ip", "Fold vs XR 3Bet IP", "threebet_pot_ip", 30, 45, "lower_better"),
  pct("call_vs_xr_3bet_ip", "Call vs XR 3Bet IP", "threebet_pot_ip", 30, 45, "context"),
  pct("raise_xr_3bet_ip", "Raise XR 3Bet IP", "threebet_pot_ip", 5, 12, "context"),
  pct("wwsf_3bet_pot_ip", "WWSF 3Bet IP", "threebet_pot_ip", 50, 60, "higher_better"),

  // === threebet_pot_oop_vs_lp (8) ===
  pct("cbet_3bet_pot_oop_vs_lp", "CBet 3Bet Pot OOP vs LP", "threebet_pot_oop_vs_lp", 55, 70, "context"),
  pct("xc_3bet_pot_oop", "X/C 3Bet OOP", "threebet_pot_oop_vs_lp", 20, 35, "context"),
  pct("xr_3bet_pot_oop", "X/R 3Bet OOP", "threebet_pot_oop_vs_lp", 8, 14, "context"),
  pct("xf_3bet_pot_oop", "X/F 3Bet OOP", "threebet_pot_oop_vs_lp", 25, 40, "context"),
  pct("fold_vs_float_3bet_oop", "Fold vs Float 3Bet OOP", "threebet_pot_oop_vs_lp", 35, 50, "lower_better"),
  pct("second_barrel_3bet_pot_oop", "2nd Barrel 3Bet OOP", "threebet_pot_oop_vs_lp", 45, 58, "context"),
  pct("third_barrel_3bet_pot_oop", "3rd Barrel 3Bet OOP", "threebet_pot_oop_vs_lp", 30, 45, "context"),
  pct("delay_cbet_3bet_pot_oop", "Delay CBet 3Bet OOP", "threebet_pot_oop_vs_lp", 25, 40, "context"),
];

// Total = 12+15+20+10+14+12+10+12+8+8+16+10+28+26+8+8 = 217 stats.

// -----------------------------------------------------------------------------
// Helpers exportados
// -----------------------------------------------------------------------------

// MINOR-2 reviewer: exportado para uso em parsers (evita O(n) .find() em loops).
export const STAT_INDEX_BY_ID = new Map<string, StatField>(
  HUD_STAT_CATALOG.map((s) => [s.id, s]),
);

const STATS_INDEX_BY_GROUP = ((): Map<HudGroupId, StatField[]> => {
  const map = new Map<HudGroupId, StatField[]>();
  for (const g of HUD_GROUP_IDS) map.set(g, []);
  for (const stat of HUD_STAT_CATALOG) {
    map.get(stat.group)?.push(stat);
  }
  return map;
})();

export function getStatById(id: string): StatField | undefined {
  return STAT_INDEX_BY_ID.get(id);
}

export function getStatsByGroup(group: HudGroupId): StatField[] {
  return STATS_INDEX_BY_GROUP.get(group) ?? [];
}

export function getDefaultRange(
  id: string,
): { min: number; max: number } | null {
  const stat = STAT_INDEX_BY_ID.get(id);
  if (!stat) return null;
  return { min: stat.targetMin, max: stat.targetMax };
}
