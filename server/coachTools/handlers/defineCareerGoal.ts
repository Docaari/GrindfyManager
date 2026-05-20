// =============================================================================
// defineCareerGoalTool — Sprint AI-2B / RF-02 (ADR-168)
//
// Write tool (confirm v1 - ADR-146). Cap 5 ativas (COACH_CAREER_GOALS_MAX_ACTIVE).
// Sync opt-in com ai_structured_profile.metas (entry origem='career_goal').
//
// Lessons aplicadas: #34 (injectedStorage 3o arg), #8 (presença individual no
// registry, não length), #6 (FX → USD em evaluate; aqui só inserção).
// =============================================================================

import { z } from "zod";

const MAX_ACTIVE_DEFAULT = 5;

export const defineCareerGoalInputSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  targetMetric: z
    .enum(["profit_usd", "tournaments_count", "roi_pct", "bankroll_usd", "custom"])
    .optional(),
  targetValue: z.number().positive().optional(),
  targetDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .optional(),
  horizon: z.enum(["mes", "trimestre", "ano", "multi_ano"]).default("trimestre"),
});

export type DefineCareerGoalInput = z.infer<typeof defineCareerGoalInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../../storage/careerGoalsStorage");
  return mod;
}

function getMaxActive(): number {
  const raw = process.env.COACH_CAREER_GOALS_MAX_ACTIVE;
  const n = raw ? parseInt(raw, 10) : MAX_ACTIVE_DEFAULT;
  return Number.isFinite(n) && n > 0 ? n : MAX_ACTIVE_DEFAULT;
}

async function preview(input: DefineCareerGoalInput, ctx: { userId: string; injectedStorage?: any }): Promise<any> {
  const storage = await resolveStorage(ctx.injectedStorage);
  let activeCount = 0;
  try {
    activeCount = storage.countActiveCareerGoals
      ? await storage.countActiveCareerGoals(ctx.userId)
      : 0;
  } catch (err) {
    console.error("defineCareerGoal.preview.count.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
  }
  const cap = getMaxActive();
  let wouldExceedCap = false;
  let oldestActive: any = null;
  if (activeCount >= cap) {
    wouldExceedCap = true;
    try {
      const active = storage.listActiveCareerGoals
        ? await storage.listActiveCareerGoals(ctx.userId)
        : [];
      if (Array.isArray(active) && active.length > 0) {
        // Tabela já vem ordenada DESC por createdAt — oldest = último.
        const sorted = [...active].sort((a, b) => {
          const ad = new Date(a?.createdAt ?? 0).getTime();
          const bd = new Date(b?.createdAt ?? 0).getTime();
          return ad - bd;
        });
        oldestActive = sorted[0] ?? null;
      }
    } catch (err) {
      console.error("defineCareerGoal.preview.list.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    payloadBefore: null,
    payloadAfter: {
      title: input.title,
      description: input.description ?? null,
      targetMetric: input.targetMetric ?? null,
      targetValue: input.targetValue ?? null,
      targetDeadline: input.targetDeadline ?? null,
      horizon: input.horizon,
      status: "active",
    },
    wouldExceedCap,
    oldestActive,
  };
}

async function executeConfirmed(
  input: DefineCareerGoalInput,
  ctx: { userId: string; injectedStorage?: any },
  _tx?: any,
): Promise<any> {
  const storage = await resolveStorage(ctx.injectedStorage);
  const cap = Number(process.env.COACH_CAREER_GOALS_MAX_ACTIVE ?? 5);
  if (typeof storage.countActiveCareerGoals === "function") {
    const activeCount = Number(await storage.countActiveCareerGoals(ctx.userId)) || 0;
    if (activeCount >= cap) {
      throw new Error("career_goals_cap_reached");
    }
  }
  const created = await storage.createCareerGoal(ctx.userId, {
    title: input.title,
    description: input.description ?? null,
    targetMetric: input.targetMetric ?? null,
    targetValue: input.targetValue ?? null,
    targetDeadline: input.targetDeadline ?? null,
    horizon: input.horizon,
  });
  // Sync opt-in com ai_structured_profile.metas (entry resumida).
  if (typeof storage.appendStructuredProfileMeta === "function") {
    try {
      const prazo = input.horizon === "mes" || input.horizon === "trimestre" ? input.horizon : "trimestre";
      await storage.appendStructuredProfileMeta(ctx.userId, {
        id: created?.id ?? null,
        texto: input.title,
        prazo,
        origem: "career_goal",
        criadaEm: new Date().toISOString(),
      });
    } catch (err) {
      console.error("defineCareerGoal.sync.metas.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    payloadBefore: null,
    payloadAfter: created,
    affectedEntityType: "career_goals",
    affectedEntityId: created?.id ?? null,
    output: {
      goalId: created?.id ?? null,
      title: created?.title ?? input.title,
      status: created?.status ?? "active",
      message: `Meta '${created?.title ?? input.title}' criada.`,
    },
  };
}

async function undo(
  _before: any,
  payloadAfter: any,
  ctx: { userId: string; injectedStorage?: any },
  _tx?: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  if (!payloadAfter?.id) throw new Error("undo_invalid_payload");
  const storage = await resolveStorage(ctx.injectedStorage);
  await storage.deleteCareerGoal(payloadAfter.id);
  if (typeof storage.removeStructuredProfileMetaByCareerGoal === "function") {
    try {
      await storage.removeStructuredProfileMetaByCareerGoal(ctx.userId, payloadAfter.id);
    } catch (err) {
      console.error("defineCareerGoal.undo.sync.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { reversedEntityType: "career_goals", reversedEntityId: payloadAfter.id };
}

export const defineCareerGoalTool = {
  name: "define_career_goal",
  description:
    "Cria uma meta de carreira estruturada (title + targetMetric + targetValue + horizon). Confirme antes.",
  inputSchema: defineCareerGoalInputSchema,
  requiresConfirmation: true as const,
  auditLevel: "persist" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  preview,
  executeConfirmed,
  undo,
  handler: async () => {
    throw new Error("write_tool_use_executeConfirmed");
  },
};
