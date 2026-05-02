// =============================================================================
// logSessionCompletedTool — Sprint Coach-2B / RF-03 (write tool)
//
// Transit active -> completed. Logging parcial aceito. Undo restaura
// status='active' + valores anteriores integralmente.
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const logSessionCompletedInputSchema = z.object({
  sessionId: z.string(),
  endTime: z.string().optional(),
  volume: z.number().int().nonnegative().optional(),
  profit: z.number().optional(),
  fts: z.number().int().nonnegative().optional(),
  cravadas: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

export type LogSessionCompletedInput = z.infer<
  typeof logSessionCompletedInputSchema
>;

async function fetchPayloadBefore(
  input: LogSessionCompletedInput,
  ctx: { userId: string },
  _tx: any,
): Promise<any> {
  const session = await (storage as any).getGrindSession(input.sessionId);
  return session ?? null;
}

async function executeConfirmed(
  input: LogSessionCompletedInput,
  ctx: { userId: string },
  _tx: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  const session = await (storage as any).getGrindSession(input.sessionId);
  if (!session) throw new Error("session_not_found");
  if (session.userId !== ctx.userId) throw new Error("unauthorized");
  if (session.status !== "active") throw new Error("session_not_active");

  const endTime = input.endTime ? new Date(input.endTime) : new Date();
  const updates: any = { status: "completed", endTime };
  if (input.volume !== undefined) updates.volume = input.volume;
  if (input.profit !== undefined) updates.profit = String(input.profit);
  if (input.fts !== undefined) updates.fts = input.fts;
  if (input.cravadas !== undefined) updates.cravadas = input.cravadas;
  if (input.notes !== undefined) updates.notes = input.notes;

  const updated = await (storage as any).updateGrindSession(
    input.sessionId,
    updates,
  );

  let durationMinutes = 0;
  if (session.startTime && endTime) {
    const start = new Date(session.startTime).getTime();
    durationMinutes = Math.max(0, Math.round((endTime.getTime() - start) / 60000));
  }

  return {
    payloadAfter: updated,
    affectedEntityType: "grind_session",
    affectedEntityId: session.id,
    output: {
      sessionId: session.id,
      status: "completed",
      durationMinutes,
      message: `Sessao ${session.id} marcada como completed.`,
    },
  };
}

async function undo(
  payloadBefore: any,
  payloadAfter: any,
  _ctx: { userId: string },
  _tx: any,
): Promise<{ reversedEntityType: string; reversedEntityId?: string }> {
  const id = payloadBefore?.id ?? payloadAfter?.id;
  if (!id) throw new Error("undo_invalid_payload");
  await (storage as any).updateGrindSession(id, {
    status: "active",
    endTime: payloadBefore?.endTime ?? null,
    volume: payloadBefore?.volume ?? 0,
    profit: payloadBefore?.profit ?? "0",
    fts: payloadBefore?.fts ?? 0,
    cravadas: payloadBefore?.cravadas ?? 0,
    notes: payloadBefore?.notes ?? null,
  });
  return { reversedEntityType: "grind_session", reversedEntityId: id };
}

export const logSessionCompletedTool = {
  name: "log_session_completed",
  description:
    "Marca sessao como completed e registra metricas finais. Confirme antes.",
  inputSchema: logSessionCompletedInputSchema,
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
