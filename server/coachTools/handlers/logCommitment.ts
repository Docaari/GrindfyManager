// =============================================================================
// logCommitmentTool — Coach AI UX Overhaul (#8) — write tool de accountability.
//
// O jogador se compromete a algo ("vou estudar PKO essa semana") e o Coach
// registra em coach_commitments. O tick B-FOLLOWUP cobra no vencimento + o
// contexto do chat injeta os compromissos abertos (fecha o loop). Confirmacao
// SEMPRE (ADR-146). Undo: status='cancelled'.
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const logCommitmentInputSchema = z.object({
  text: z.string().min(3).max(280),
  category: z.enum(["study", "volume", "grind", "mental", "other"]).optional(),
  dueDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), // YYYY-MM-DD
});

export type LogCommitmentInput = z.infer<typeof logCommitmentInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  return injected ?? storage;
}

async function fetchPayloadBefore(): Promise<any> {
  return null; // sempre cria um novo — sem estado anterior.
}

async function executeConfirmed(
  input: LogCommitmentInput,
  ctx: { userId: string; chatSessionId?: string | null; injectedStorage?: any },
  _tx?: any,
): Promise<any> {
  const store = await resolveStorage(ctx.injectedStorage);
  const created = await store.createCoachCommitment({
    userId: ctx.userId,
    text: input.text,
    category: input.category ?? null,
    dueDate: input.dueDate,
    source: "tool",
    chatSessionId: ctx.chatSessionId ?? null,
    status: "active",
  });
  return {
    payloadBefore: null,
    payloadAfter: created,
    affectedEntityType: "coach_commitments",
    affectedEntityId: created?.id ?? null,
    output: {
      commitmentId: created?.id ?? null,
      text: created?.text ?? input.text,
      dueDate: created?.dueDate ?? input.dueDate,
      message: `Compromisso registrado: "${input.text}" (cobro em ${input.dueDate}).`,
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
  const store = await resolveStorage(ctx.injectedStorage);
  await store.updateCoachCommitmentStatus(payloadAfter.id, "cancelled");
  return { reversedEntityType: "coach_commitments", reversedEntityId: payloadAfter.id };
}

export const logCommitmentTool = {
  name: "log_commitment",
  description:
    "Registra um compromisso do jogador (ex: 'vou estudar PKO essa semana') com uma data de cobranca (dueDate YYYY-MM-DD). O Coach cobra no vencimento. Confirme antes.",
  inputSchema: logCommitmentInputSchema,
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
