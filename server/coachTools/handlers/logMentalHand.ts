// =============================================================================
// logMentalHandTool — Sprint AI-2B / RF-06 (ADR-171)
//
// Write tool (confirm v1). Framework Tendler — situação/emoção/resposta real
// vs ideal. occurredAt default = now().
// =============================================================================

import { z } from "zod";

export const logMentalHandInputSchema = z.object({
  situation: z.string().min(1).max(1000),
  emotion: z.enum(["frustration", "tilt", "fear", "overconfidence", "fatigue", "other"]),
  realResponse: z.string().min(1).max(1000),
  idealResponse: z.string().min(1).max(1000),
  tags: z.array(z.string().max(40)).max(10).optional(),
  linkedGrindSessionId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

export type LogMentalHandInput = z.infer<typeof logMentalHandInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../../storage/mentalHandsStorage");
  return mod;
}

async function preview(input: LogMentalHandInput, _ctx: { userId: string }): Promise<any> {
  return {
    payloadBefore: null,
    payloadAfter: {
      situation: input.situation,
      emotion: input.emotion,
      realResponse: input.realResponse,
      idealResponse: input.idealResponse,
      tags: input.tags ?? null,
      linkedGrindSessionId: input.linkedGrindSessionId ?? null,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    },
  };
}

async function executeConfirmed(
  input: LogMentalHandInput,
  ctx: { userId: string; injectedStorage?: any },
  _tx?: any,
): Promise<any> {
  const storage = await resolveStorage(ctx.injectedStorage);
  const payload = {
    userId: ctx.userId,
    situation: input.situation,
    emotion: input.emotion,
    realResponse: input.realResponse,
    idealResponse: input.idealResponse,
    tags: input.tags ?? null,
    linkedGrindSessionId: input.linkedGrindSessionId ?? null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
  };
  // Convenção: payload 1-arg com userId; o helper real aceita o mesmo shape
  // (extrai userId internamente). Spies em testes recebem o payload inteiro.
  const created = await storage.createMentalHand(payload);
  return {
    payloadBefore: null,
    payloadAfter: created,
    affectedEntityType: "mental_hand_history",
    affectedEntityId: created?.id ?? null,
    output: {
      handId: created?.id ?? null,
      emotion: created?.emotion ?? input.emotion,
      message: "Mental hand registrada.",
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
  await storage.deleteMentalHand(payloadAfter.id);
  return { reversedEntityType: "mental_hand_history", reversedEntityId: payloadAfter.id };
}

export const logMentalHandTool = {
  name: "log_mental_hand",
  description:
    "Registra uma 'mental hand' (framework Tendler): situacao/emocao/resposta real vs ideal. Confirme antes.",
  inputSchema: logMentalHandInputSchema,
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
