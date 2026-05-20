// =============================================================================
// markOffDay — Sprint AI-2A / RF-05 (ADR-165)
//
// Cria row em user_off_days. UNIQUE (user_id, off_date) -> idempotente.
// =============================================================================

import { z } from "zod";

export const markOffDayInputSchema = z.object({
  offDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "offDate must be YYYY-MM-DD"),
  reason: z.string().max(200).optional(),
});

export type MarkOffDayInput = z.infer<typeof markOffDayInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function fetchPayloadBefore(): Promise<any> {
  return null;
}

async function executeConfirmed(input: MarkOffDayInput, ctx: any, _tx: any): Promise<any> {
  const parsed = markOffDayInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  let hasPlanned = 0;
  try {
    hasPlanned = Number(await store.countPlannedTournamentsForDate?.(ctx.userId, parsed.offDate)) || 0;
  } catch (err) {
    console.error("mark_off_day.count_planned.error", { userId: ctx.userId, offDate: parsed.offDate, err });
  }

  const created = await store.createUserOffDay?.({
    userId: ctx.userId,
    offDate: parsed.offDate,
    reason: parsed.reason,
  });

  return {
    payloadAfter: created,
    affectedEntityType: "user_off_day",
    affectedEntityId: created?.id,
    output: {
      offDayId: created?.id,
      hasPlannedTournaments: hasPlanned > 0,
      created: created?.created !== false,
    },
  };
}

async function undo(
  _before: any,
  payloadAfter: any,
  ctx: any,
  _tx: any,
): Promise<{ reversedEntityType: string }> {
  const store = await resolveStorage(ctx?.injectedStorage);
  if (payloadAfter?.id) {
    await store.deleteUserOffDay?.(payloadAfter.id);
  }
  return { reversedEntityType: "user_off_day" };
}

export const markOffDayTool = {
  name: "mark_off_day" as const,
  description: "Marca um dia como off (folga). bulk_propose_grade pula dias listados.",
  inputSchema: markOffDayInputSchema,
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
