// =============================================================================
// startGrindSessionTool — Sprint Coach-2B / RF-03 (write tool)
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const startGrindSessionInputSchema = z
  .object({
    mode: z.enum(["from_planned", "instant"]),
    plannedSessionId: z.string().optional(),
    startTime: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "from_planned" && !val.plannedSessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plannedSessionId obrigatorio em mode=from_planned",
        path: ["plannedSessionId"],
      });
    }
  });

export type StartGrindSessionInput = z.infer<typeof startGrindSessionInputSchema>;

async function fetchPayloadBefore(
  input: StartGrindSessionInput,
  ctx: { userId: string },
  _tx: any,
): Promise<any> {
  if (input.mode === "from_planned" && input.plannedSessionId) {
    const planned = await (storage as any).getPlannedSession(input.plannedSessionId);
    return planned ? { ...planned, mode: "from_planned" } : { mode: "from_planned" };
  }
  return { mode: "instant" };
}

async function executeConfirmed(
  input: StartGrindSessionInput,
  ctx: { userId: string },
  _tx: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  const startedAt = input.startTime ? new Date(input.startTime) : new Date();

  if (input.mode === "from_planned") {
    const planned = await (storage as any).getPlannedSession(input.plannedSessionId);
    if (!planned) throw new Error("session_not_found");
    if (planned.userId !== ctx.userId) throw new Error("unauthorized");
    if (planned.status !== "planned") throw new Error("session_not_planned");
    const updated = await (storage as any).updatePlannedSession(
      input.plannedSessionId,
      { status: "active", startTime: startedAt },
    );
    return {
      payloadAfter: { ...updated, mode: "from_planned" },
      affectedEntityType: "planned_session",
      affectedEntityId: planned.id,
      output: { sessionId: planned.id, status: "active", startedAt: startedAt.toISOString() },
    };
  }

  const created = await (storage as any).createGrindSession({
    userId: ctx.userId,
    status: "active",
    startTime: startedAt,
    date: startedAt,
  });
  return {
    payloadAfter: { ...created, mode: "instant" },
    affectedEntityType: "grind_session",
    affectedEntityId: created.id,
    output: { sessionId: created.id, status: "active", startedAt: startedAt.toISOString() },
  };
}

async function undo(
  payloadBefore: any,
  payloadAfter: any,
  ctx: { userId: string },
  _tx: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  if (payloadAfter?.mode === "instant") {
    await (storage as any).deleteGrindSession(payloadAfter.id);
    return { reversedEntityType: "grind_session", reversedEntityId: payloadAfter.id };
  }
  // from_planned: restore para planned, clear startTime
  const id = payloadBefore?.id ?? payloadAfter?.id;
  await (storage as any).updatePlannedSession(id, { status: "planned", startTime: null });
  return { reversedEntityType: "planned_session", reversedEntityId: id };
}

export const startGrindSessionTool = {
  name: "start_grind_session",
  description: "Inicia sessao de grind (from_planned ou instant). Confirme antes.",
  inputSchema: startGrindSessionInputSchema,
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
