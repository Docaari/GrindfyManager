// =============================================================================
// Sprint F3 — Hold'em Manager 3 Default template (D2)
// PT4 set + AGG%, BB/100, Steal%, Fold to Steal
// =============================================================================

import type { HudLayout } from "../StatsSnapshotEditor";

export const hm3DefaultTemplate: Pick<HudLayout, "name" | "isDefault" | "sections"> = {
  name: "Padrao HM3",
  isDefault: false,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        { key: "vpip", label: "VPIP", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "pfr", label: "PFR", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "three_bet", label: "3Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "fold_to_three_bet", label: "Fold to 3Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "steal", label: "Steal", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "fold_to_steal", label: "Fold to Steal", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
      ],
    },
    {
      label: "Flop",
      sortOrder: 1,
      stats: [
        { key: "cbet_flop", label: "CBet Flop", decimals: 1, suffix: "%", min: 0, max: 100, group: "flop" },
        { key: "fold_to_cbet_flop", label: "Fold to CBet Flop", decimals: 1, suffix: "%", min: 0, max: 100, group: "flop" },
      ],
    },
    {
      label: "Postflop / Showdown",
      sortOrder: 2,
      stats: [
        { key: "af", label: "AF", decimals: 1, min: 0, max: 99, group: "agg" },
        { key: "agg_pct", label: "AGG%", decimals: 1, suffix: "%", min: 0, max: 100, group: "agg" },
        { key: "wtsd", label: "WTSD", decimals: 1, suffix: "%", min: 0, max: 100, group: "showdown" },
        { key: "wsd", label: "W$SD", decimals: 1, suffix: "%", min: 0, max: 100, group: "showdown" },
      ],
    },
    {
      label: "Resultado",
      sortOrder: 3,
      stats: [
        { key: "bb_per_100", label: "BB/100", decimals: 2, min: -200, max: 200, group: "other" },
      ],
    },
  ],
};
