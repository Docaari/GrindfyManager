// =============================================================================
// reportCost — Sprint AI-3.1 / RF-07 (ADR-176)
//
// A1-M1: consolida 4 callsites duplicados (computeCost weekly, computeMonthlyCost,
// computeDailyDebriefCost, computeQuarterlyCost) que hardcodam pricing Sonnet 4.6
// inline. Adiciona Haiku 4.5 ratecard (bug latente: custo Haiku invisivel em
// `cost_usd_estimate`).
//
// Pricing Anthropic (USD per 1M tokens) — https://docs.anthropic.com/pricing (as of 2026-01):
//   Sonnet 4.6:
//     input:      3.00
//     output:    15.00
//     cacheRead:  0.30
//     cacheWrite: 3.75
//   Haiku 4.5:
//     input:      1.00
//     output:     5.00
//     cacheRead:  0.10
//     cacheWrite: 1.25
//
// Lessons: #10 (DRY).
// =============================================================================

export const SONNET_46_PRICE_PER_M = {
  input: 3.00,
  output: 15.00,
  cacheRead: 0.30,
  cacheWrite: 3.75,
} as const;

export const HAIKU_45_PRICE_PER_M = {
  input: 1.00,
  output: 5.00,
  cacheRead: 0.10,
  cacheWrite: 1.25,
} as const;

export type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type Ratecard = "sonnet46" | "haiku45";

function safe(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula custo USD do uso Anthropic com base no ratecard escolhido.
 * Default ratecard = 'sonnet46'. Retorna number (alinhado com numeric column
 * `cost_usd_estimate`).
 */
export function computeReportCost(usage: AnthropicUsage, ratecard: Ratecard = "sonnet46"): number {
  const card = ratecard === "haiku45" ? HAIKU_45_PRICE_PER_M : SONNET_46_PRICE_PER_M;
  const i = safe(usage?.input_tokens);
  const o = safe(usage?.output_tokens);
  const cr = safe(usage?.cache_read_input_tokens);
  const cw = safe(usage?.cache_creation_input_tokens);
  return (i * card.input + o * card.output + cr * card.cacheRead + cw * card.cacheWrite) / 1_000_000;
}
