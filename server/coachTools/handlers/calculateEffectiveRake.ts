// =============================================================================
// calculateEffectiveRake — Sprint AI-2A / RF-06.4 (ADR-166)
//
// Agrega rake por torneio + rakeback de wallet_transactions.reason='rakeback'.
// Quando rake field ausente, estima 10% do buy-in (default MTT) e marca
// rakeEstimated=true.
// =============================================================================

import { z } from "zod";

export const calculateEffectiveRakeInputSchema = z.object({
  period: z.enum(["30d", "90d", "6m"]).optional().default("90d"),
  site: z.string().optional(),
});

export type CalculateEffectiveRakeInput = z.infer<typeof calculateEffectiveRakeInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

function periodToDateRange(period: "30d" | "90d" | "6m"): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "30d") start.setUTCDate(end.getUTCDate() - 30);
  else if (period === "90d") start.setUTCDate(end.getUTCDate() - 90);
  else start.setUTCMonth(end.getUTCMonth() - 6);
  return { start, end };
}

async function handler(input: CalculateEffectiveRakeInput, ctx: any): Promise<any> {
  const parsed = calculateEffectiveRakeInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const perf = await store.getPerformanceByPeriod?.(ctx.userId, parsed.period);
  const tournaments = perf?.tournaments ?? [];

  let totalBuyInUsd = 0;
  let totalRakeUsd = 0;
  let rakeEstimated = false;
  const bySiteMap = new Map<string, { buyIn: number; rake: number; count: number }>();

  for (const t of tournaments) {
    const buyIn = Number(t.buyInUsd ?? t.buyIn ?? 0);
    let rake = Number(t.rakeUsd ?? t.rake ?? NaN);
    if (!Number.isFinite(rake)) {
      rake = buyIn * 0.10;
      rakeEstimated = true;
    }
    totalBuyInUsd += buyIn;
    totalRakeUsd += rake;
    const site = t.site ?? "Unknown";
    const cur = bySiteMap.get(site) ?? { buyIn: 0, rake: 0, count: 0 };
    cur.buyIn += buyIn;
    cur.rake += rake;
    cur.count += 1;
    bySiteMap.set(site, cur);
  }

  const { start, end } = periodToDateRange(parsed.period);
  const rakeback = await store.getRakebackTransactions?.(ctx.userId, start, end);
  const totalRakebackUsd = Number(rakeback?.totalUsd ?? 0);

  const effectiveRakePct = totalBuyInUsd > 0 ? (totalRakeUsd / totalBuyInUsd) * 100 : 0;
  const netRakePct = totalBuyInUsd > 0 ? ((totalRakeUsd - totalRakebackUsd) / totalBuyInUsd) * 100 : 0;

  const bySite = Array.from(bySiteMap.entries()).map(([site, agg]) => ({
    site,
    buyInUsd: agg.buyIn,
    rakeUsd: agg.rake,
    effectiveRakePct: agg.buyIn > 0 ? (agg.rake / agg.buyIn) * 100 : 0,
    tournamentCount: agg.count,
  }));

  return {
    period: parsed.period,
    totalBuyInUsd,
    totalRakeUsd,
    totalRakebackUsd,
    effectiveRakePct,
    netRakePct,
    rakeEstimated,
    bySite,
  };
}

export const calculateEffectiveRakeTool = {
  name: "calculate_effective_rake" as const,
  description: "Calcula rake efetivo agregado, com breakdown por site + descontando rakeback.",
  inputSchema: calculateEffectiveRakeInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
