// =============================================================================
// Sprint F3 — Generic MTT template (D2)
// 12 stats minimas: VPIP, PFR, 3Bet, 4Bet, CBet F/T/R, Fold to CBet F/T/R,
// Donk%, Steal%
// =============================================================================

import type { HudLayout } from "../StatsSnapshotEditor";

export const genericMttTemplate: Pick<HudLayout, "name" | "isDefault" | "sections"> = {
  name: "MTT Generico",
  isDefault: false,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        { key: "vpip", label: "VPIP", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "pfr", label: "PFR", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "three_bet", label: "3Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "four_bet", label: "4Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "steal", label: "Steal", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
      ],
    },
    {
      label: "CBet",
      sortOrder: 1,
      stats: [
        { key: "cbet_flop", label: "CBet Flop", decimals: 1, suffix: "%", min: 0, max: 100, group: "flop" },
        { key: "cbet_turn", label: "CBet Turn", decimals: 1, suffix: "%", min: 0, max: 100, group: "turn" },
        { key: "cbet_river", label: "CBet River", decimals: 1, suffix: "%", min: 0, max: 100, group: "river" },
      ],
    },
    {
      label: "Fold to CBet",
      sortOrder: 2,
      stats: [
        { key: "fold_to_cbet_flop", label: "Fold to CBet Flop", decimals: 1, suffix: "%", min: 0, max: 100, group: "flop" },
        { key: "fold_to_cbet_turn", label: "Fold to CBet Turn", decimals: 1, suffix: "%", min: 0, max: 100, group: "turn" },
        { key: "fold_to_cbet_river", label: "Fold to CBet River", decimals: 1, suffix: "%", min: 0, max: 100, group: "river" },
      ],
    },
    {
      label: "Outros",
      sortOrder: 3,
      stats: [
        { key: "donk", label: "Donk", decimals: 1, suffix: "%", min: 0, max: 100, group: "other" },
      ],
    },
  ],
};
