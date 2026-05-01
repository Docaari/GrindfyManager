// =============================================================================
// Sprint F3 / ADR-052 — HUD stats population benchmark (estatico V1)
//
// Ranges saudaveis MTT 6-max baseados em consenso publico (PokerTracker
// default ranges, recreational tracker data 2NL-200NL). V2 troca por
// dados Grindfy agregados quando user base for grande.
// =============================================================================

export interface BenchmarkRange {
  healthy: [number, number];
  description: string;
}

export const HUD_STATS_BENCHMARK: Record<string, BenchmarkRange> = {
  vpip: { healthy: [18, 26], description: "VPIP MTT 6-max" },
  pfr: { healthy: [14, 22], description: "PFR MTT 6-max" },
  three_bet: { healthy: [4, 9], description: "3Bet MTT 6-max" },
  fold_to_three_bet: { healthy: [50, 70], description: "Fold to 3Bet" },
  four_bet: { healthy: [1.5, 4], description: "4Bet" },
  cbet_flop: { healthy: [55, 75], description: "CBet Flop" },
  cbet_turn: { healthy: [40, 60], description: "CBet Turn" },
  cbet_river: { healthy: [35, 55], description: "CBet River" },
  fold_to_cbet_flop: { healthy: [40, 55], description: "Fold to CBet Flop" },
  fold_to_cbet_turn: { healthy: [40, 55], description: "Fold to CBet Turn" },
  fold_to_cbet_river: { healthy: [35, 50], description: "Fold to CBet River" },
  af: { healthy: [2.0, 3.5], description: "Aggression Factor" },
  agg_pct: { healthy: [50, 65], description: "Aggression %" },
  wtsd: { healthy: [22, 28], description: "Went to Showdown" },
  wsd: { healthy: [48, 55], description: "Won at Showdown" },
  steal: { healthy: [25, 40], description: "Steal %" },
  fold_to_steal: { healthy: [55, 75], description: "Fold to Steal" },
  donk: { healthy: [0, 10], description: "Donk %" },
  bb_per_100: { healthy: [-5, 15], description: "BB/100 MTT" },
};

export type BenchmarkStatus = "below_range" | "in_range" | "above_range";

export function classifyVsBenchmark(
  key: string,
  value: number | null,
): BenchmarkStatus | null {
  if (value === null || value === undefined) return null;
  const range = HUD_STATS_BENCHMARK[key];
  if (!range) return null;
  if (value < range.healthy[0]) return "below_range";
  if (value > range.healthy[1]) return "above_range";
  return "in_range";
}
