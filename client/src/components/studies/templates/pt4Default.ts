// =============================================================================
// Sprint F3 — PokerTracker 4 Default template (D2)
// Stats core: VPIP, PFR, 3Bet, Fold to 3Bet, CBet Flop, Fold to CBet Flop,
// AF, WTSD, W$SD
// =============================================================================

import type { HudLayout } from "../StatsSnapshotEditor";

export const pt4DefaultTemplate: Pick<HudLayout, "name" | "isDefault" | "sections"> = {
  name: "Padrao PT4",
  isDefault: true,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        { key: "vpip", label: "VPIP", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "pfr", label: "PFR", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "three_bet", label: "3Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
        { key: "fold_to_three_bet", label: "Fold to 3Bet", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" },
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
        { key: "wtsd", label: "WTSD", decimals: 1, suffix: "%", min: 0, max: 100, group: "showdown" },
        { key: "wsd", label: "W$SD", decimals: 1, suffix: "%", min: 0, max: 100, group: "showdown" },
      ],
    },
  ],
};
