// =============================================================================
// analyzeVariance — Sprint AI-2A / RF-06.1 (ADR-166)
//
// Diagnostic tool. Reusa server/coach/varianceAnalysis.ts (DRY).
// =============================================================================

import { z } from "zod";

export const analyzeVarianceInputSchema = z.object({
  period: z.enum(["30d", "90d", "6m", "12m"]).optional().default("90d"),
  dimension: z.enum(["overall", "stake", "site"]).optional().default("overall"),
});

export type AnalyzeVarianceInput = z.infer<typeof analyzeVarianceInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function handler(input: AnalyzeVarianceInput, ctx: any): Promise<any> {
  const parsed = analyzeVarianceInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const performance = await store.getPerformanceByPeriod?.(ctx.userId, parsed.period, parsed.dimension);
  const varianceVsExpected = await store.getVarianceVsExpected?.(ctx.userId, parsed.period, parsed.dimension);

  const { computeVarianceAnalysis } = await import("../../coach/varianceAnalysis");
  const result = computeVarianceAnalysis({
    performance: performance ?? { tournaments: [], sampleSize: 0 },
    varianceVsExpected: varianceVsExpected ?? null,
  });

  return result;
}

export const analyzeVarianceTool = {
  name: "analyze_variance" as const,
  description:
    "Analise variance vs expected ROI. Usa PrimeDope quando disponivel; fallback heuristico (stddev * 1.5).",
  inputSchema: analyzeVarianceInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
