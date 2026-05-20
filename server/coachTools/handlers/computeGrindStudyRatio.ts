// =============================================================================
// computeGrindStudyRatio — Sprint AI-2A / RF-06.3 (ADR-166)
// =============================================================================

import { z } from "zod";

export const computeGrindStudyRatioInputSchema = z.object({
  period: z.enum(["30d", "90d"]).optional().default("30d"),
});

export type ComputeGrindStudyRatioInput = z.infer<typeof computeGrindStudyRatioInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function handler(input: ComputeGrindStudyRatioInput, ctx: any): Promise<any> {
  const parsed = computeGrindStudyRatioInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const grindHours = Number((await store.getGrindHoursForPeriod?.(ctx.userId, parsed.period)) ?? 0);
  const studyMinutes = Number((await store.getStudyMinutesForPeriod?.(ctx.userId, parsed.period)) ?? 0);
  const studyHours = studyMinutes / 60;

  let ratio: number | null = null;
  let interpretation: "abaixo" | "dentro" | "acima" | "sem_estudo" = "sem_estudo";
  if (studyHours > 0) {
    ratio = grindHours / studyHours;
    if (ratio < 5) interpretation = "abaixo";
    else if (ratio <= 10) interpretation = "dentro";
    else interpretation = "acima";
  }

  return {
    grindHours,
    studyHours,
    ratio,
    benchmark: {
      range: "5:1 a 10:1",
      interpretation,
    },
  };
}

export const computeGrindStudyRatioTool = {
  name: "compute_grind_study_ratio" as const,
  description: "Calcula ratio grind:estudo do periodo. Benchmark: 5:1 a 10:1.",
  inputSchema: computeGrindStudyRatioInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
