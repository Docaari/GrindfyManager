// =============================================================================
// verifyLeakProgressTool — Sprint Coach-2B / RF-05 (READ tool, NAO write)
//
// requiresConfirmation: false, auditLevel: 'log'.
// Re-roda query do baselineStatKey no storage atual e compara com baseline.
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const verifyLeakProgressInputSchema = z.object({
  leakFocusId: z.string().optional(),
});

export type VerifyLeakProgressInput = z.infer<typeof verifyLeakProgressInputSchema>;

function classifyStatus(
  baseline: number,
  current: number,
  currentSample: number,
): "improving" | "stable" | "regressing" | "insufficient_sample" {
  if (currentSample < 30) return "insufficient_sample";
  if (baseline === 0) {
    if (current > 0.001) return "improving";
    if (current < -0.001) return "regressing";
    return "stable";
  }
  // Improvement positive when current is "better" than baseline.
  // For most metrics (ROI, ITM%) higher is better.
  // Use relative delta of (current - baseline) / |baseline|.
  const improvementPct = ((current - baseline) / Math.abs(baseline)) * 100;
  if (improvementPct > 10) return "improving";
  if (improvementPct < -10) return "regressing";
  return "stable";
}

async function handler(rawInput: unknown, ctx: { userId: string }): Promise<any> {
  // MEDIUM-2 reviewer: validar via Zod em runtime (padronizacao com as outras read tools).
  const parsed = verifyLeakProgressInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input: VerifyLeakProgressInput = parsed.data;
  let focus: any;
  if (input.leakFocusId) {
    focus = await (storage as any).findCoachLeakFocus?.(
      ctx.userId,
      undefined,
      undefined,
      input.leakFocusId,
    );
  }
  if (!focus) {
    focus = await (storage as any).findActiveLeakFocus?.(ctx.userId);
  }
  if (!focus) {
    return {
      note: "no_active_focus",
      message: "Sem foco de leak ativo no mes corrente.",
    };
  }

  const current = await (storage as any).queryStatByKey(
    ctx.userId,
    focus.baselineStatKey,
  );
  if (!current) {
    return {
      note: "stat_key_unsupported",
      message: `statKey '${focus.baselineStatKey}' nao mais suportado.`,
      leakFocusId: focus.id,
    };
  }

  const baseline = Number(focus.baselineValue);
  const baselineSample = Number(focus.baselineSampleSize);
  const cur = Number(current.value);
  const curSample = Number(current.sampleSize);
  const delta = cur - baseline;
  const improvementPct = baseline === 0 ? 0 : (delta / Math.abs(baseline)) * 100;
  const status = classifyStatus(baseline, cur, curSample);

  return {
    leakFocusId: focus.id,
    leakCode: focus.leakCode,
    description: focus.description,
    baseline: {
      value: baseline,
      sampleSize: baselineSample,
      statKey: focus.baselineStatKey,
    },
    current: {
      value: cur,
      sampleSize: curSample,
      statKey: focus.baselineStatKey,
    },
    delta,
    improvementPct,
    status,
    message:
      status === "improving"
        ? `Voce esta melhorando em '${focus.leakCode}': ${improvementPct.toFixed(1)}%.`
        : status === "regressing"
          ? `Voce esta regredindo em '${focus.leakCode}': ${improvementPct.toFixed(1)}%.`
          : status === "insufficient_sample"
            ? `Amostra atual ainda pequena (N=${curSample}); aguarde mais sessoes.`
            : `Estavel em '${focus.leakCode}'.`,
  };
}

export const verifyLeakProgressTool = {
  name: "verify_leak_progress",
  description:
    "Verifica progresso do foco de leak ativo do user, comparando stat atual vs baseline.",
  inputSchema: verifyLeakProgressInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
