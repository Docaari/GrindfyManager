// =============================================================================
// logLeakFocusTool — Sprint Coach-2B / RF-05 (write tool)
//
// Schema novo coach_leak_focus. UNIQUE (user, leakCode, targetMonth) — 409 em
// duplicata. Undo: UPDATE status=abandoned (NAO hard-delete).
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const logLeakFocusInputSchema = z.object({
  leakCode: z.string(),
  description: z.string().max(200),
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  baselineStat: z.object({
    statKey: z.string(),
    currentValue: z.number(),
    sampleSize: z.number().int().positive(),
  }),
  studyPlanNotes: z.string().max(1000).optional(),
});

export type LogLeakFocusInput = z.infer<typeof logLeakFocusInputSchema>;

async function fetchPayloadBefore(
  input: LogLeakFocusInput,
  ctx: { userId: string },
  _tx: any,
): Promise<any> {
  const existing = await (storage as any).findCoachLeakFocus?.(
    ctx.userId,
    input.leakCode,
    input.targetMonth,
  );
  return existing ?? null;
}

async function executeConfirmed(
  input: LogLeakFocusInput,
  ctx: { userId: string },
  _tx: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  const existing = await (storage as any).findCoachLeakFocus?.(
    ctx.userId,
    input.leakCode,
    input.targetMonth,
  );
  if (existing && existing.status === "active") {
    throw new Error("leak_focus_already_active");
  }

  const created = await (storage as any).createCoachLeakFocus({
    userId: ctx.userId,
    leakCode: input.leakCode,
    description: input.description,
    targetMonth: input.targetMonth,
    baselineStatKey: input.baselineStat.statKey,
    baselineValue: String(input.baselineStat.currentValue),
    baselineSampleSize: input.baselineStat.sampleSize,
    studyPlanNotes: input.studyPlanNotes ?? null,
    status: "active",
  });

  return {
    payloadAfter: created,
    affectedEntityType: "coach_leak_focus",
    affectedEntityId: created.id,
    output: {
      leakFocusId: created.id,
      leakCode: created.leakCode,
      targetMonth: created.targetMonth,
      message: `Foco de leak '${created.leakCode}' registrado para ${created.targetMonth}.`,
    },
  };
}

async function undo(
  _before: any,
  payloadAfter: any,
  _ctx: { userId: string },
  _tx: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  if (!payloadAfter?.id) throw new Error("undo_invalid_payload");
  await (storage as any).updateCoachLeakFocus(payloadAfter.id, {
    status: "abandoned",
  });
  return { reversedEntityType: "coach_leak_focus", reversedEntityId: payloadAfter.id };
}

export const logLeakFocusTool = {
  name: "log_leak_focus",
  description:
    "Define ou atualiza o foco de leak do mes do user. Confirme antes.",
  inputSchema: logLeakFocusInputSchema,
  requiresConfirmation: true as const,
  auditLevel: "persist" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  fetchPayloadBefore,
  executeConfirmed,
  undo,
  handler: async () => {
    throw new Error("write_tool_use_executeConfirmed");
  },
};
