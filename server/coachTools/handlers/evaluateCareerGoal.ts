// =============================================================================
// evaluateCareerGoalTool — Sprint AI-2B / RF-02 (ADR-168)
//
// Read-only puro: NÃO grava progress_note no DB (ADR-168 §RF-02.2).
// Divisão por zero → progressPct=null + confidence='low'. Tournaments < 5 →
// estimate='unknown' + confidence='low' (lesson #6 FX → USD em profit).
// =============================================================================

import { z } from "zod";

export const evaluateCareerGoalInputSchema = z.object({
  goalId: z.string().min(1),
});

export type EvaluateCareerGoalInput = z.infer<typeof evaluateCareerGoalInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const careerMod: any = await import("../../storage/careerGoalsStorage");
  const baseMod: any = await import("../../storage");
  return { ...careerMod, ...((baseMod as any).storage ?? {}) };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function handler(
  input: EvaluateCareerGoalInput,
  ctx: { userId: string; injectedStorage?: any },
): Promise<any> {
  const parsed = evaluateCareerGoalInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", details: parsed.error.issues };
  }
  const storage = await resolveStorage(ctx.injectedStorage);
  const goal = await storage.getCareerGoal(ctx.userId, parsed.data.goalId);
  if (!goal) {
    return { ok: false, error: "not_found" };
  }

  const targetValue =
    typeof goal.targetValue === "number"
      ? goal.targetValue
      : (goal.targetValue != null && goal.targetValue !== "" ? Number(goal.targetValue) : null);

  const now = new Date();
  const createdAt = goal.createdAt instanceof Date ? goal.createdAt : new Date(goal.createdAt ?? now);
  const deadline = goal.targetDeadline ? new Date(String(goal.targetDeadline)) : null;
  const daysRemaining = deadline ? daysBetween(now, deadline) : null;

  let currentValue: number | null = null;
  let sample = 0;
  try {
    if (goal.targetMetric === "profit_usd" || goal.targetMetric === "tournaments_count" || goal.targetMetric === "roi_pct") {
      const range = `${fmtYmd(createdAt)} to ${fmtYmd(now)}`;
      const perf = await storage.getPerformanceByPeriod?.(ctx.userId, range, {});
      sample = Number(perf?.tournaments ?? perf?.count ?? 0);
      if (goal.targetMetric === "profit_usd") currentValue = Number(perf?.profit ?? 0);
      else if (goal.targetMetric === "tournaments_count") currentValue = sample;
      else if (goal.targetMetric === "roi_pct") {
        const buyIn = Number(perf?.buyInSum ?? perf?.buyIn ?? 0);
        const profit = Number(perf?.profit ?? 0);
        currentValue = buyIn > 0 ? (profit / buyIn) * 100 : null;
      }
    } else if (goal.targetMetric === "bankroll_usd") {
      currentValue = typeof storage.getConsolidatedBalanceUsd === "function"
        ? Number(await storage.getConsolidatedBalanceUsd(ctx.userId))
        : null;
      sample = 1;
    }
  } catch (err) {
    console.error("evaluateCareerGoal.metric.error", { userId: ctx.userId, goalId: goal.id, err: err instanceof Error ? err.message : String(err) });
  }

  let progressPct: number | null = null;
  let confidence: "high" | "medium" | "low" = "low";
  let estimate: "on_track" | "behind" | "ahead" | "unknown" = "unknown";

  if (targetValue == null || targetValue <= 0) {
    progressPct = null;
    confidence = "low";
  } else if (currentValue == null) {
    progressPct = null;
    confidence = "low";
  } else {
    progressPct = (currentValue / targetValue) * 100;
    if (sample >= 20) confidence = "high";
    else if (sample >= 8) confidence = "medium";
    else confidence = "low";

    if (sample < 5) {
      estimate = "unknown";
    } else if (deadline) {
      // Heurística: progresso proporcional ao tempo decorrido.
      const totalDays = daysBetween(createdAt, deadline) || 1;
      const elapsed = daysBetween(createdAt, now);
      const expectedPct = (elapsed / totalDays) * 100;
      if (progressPct >= expectedPct * 1.05) estimate = "ahead";
      else if (progressPct < expectedPct * 0.85) estimate = "behind";
      else estimate = "on_track";
    } else {
      estimate = "unknown";
    }
  }

  const narrative = (() => {
    if (estimate === "ahead") return "Ritmo acima do esperado pelo prazo.";
    if (estimate === "behind") return "Ritmo abaixo do esperado pelo prazo.";
    if (estimate === "on_track") return "Ritmo dentro do esperado.";
    return "Dados insuficientes para projecao confiavel.";
  })();

  return {
    goal: {
      id: goal.id,
      title: goal.title,
      targetMetric: goal.targetMetric,
      targetValue,
      targetDeadline: goal.targetDeadline,
      horizon: goal.horizon,
      status: goal.status,
      createdAt: goal.createdAt,
    },
    progress: {
      currentValue,
      progressPct,
      estimate,
      daysRemaining,
      narrative,
      confidence,
    },
  };
}

export const evaluateCareerGoalTool = {
  name: "evaluate_career_goal",
  description:
    "Avalia o progresso de uma meta de carreira (read-only, nao grava DB).",
  inputSchema: evaluateCareerGoalInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
