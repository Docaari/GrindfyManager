// =============================================================================
// logStudySessionTool — Sprint Coach-2B / RF-06 (write tool)
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

export const logStudySessionInputSchema = z.object({
  topic: z.enum([
    "solver",
    "hand_review",
    "video",
    "library",
    "mental",
    "other",
  ]),
  durationMinutes: z.number().int().min(5).max(480),
  date: z.string().optional(),
  studyCardId: z.string().optional(),
  insights: z.string().max(2000).optional(),
  focusScore: z.number().int().min(0).max(10).optional(),
  productivityScore: z.number().int().min(0).max(10).optional(),
});

export type LogStudySessionInput = z.infer<typeof logStudySessionInputSchema>;

async function fetchPayloadBefore(
  _input: LogStudySessionInput,
  _ctx: { userId: string },
  _tx: any,
): Promise<any> {
  return null;
}

async function executeConfirmed(
  input: LogStudySessionInput,
  ctx: { userId: string },
  _tx: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  if (input.studyCardId) {
    const card = await (storage as any).getStudyCard(input.studyCardId, ctx.userId)
      ?? await (storage as any).getStudyCard(input.studyCardId);
    if (card && card.userId !== ctx.userId) {
      throw new Error("unauthorized");
    }
  }

  const date = input.date ? new Date(input.date) : new Date();
  const created = await (storage as any).createStudySession({
    userId: ctx.userId,
    topic: input.topic,
    durationMinutes: input.durationMinutes,
    date,
    studyCardId: input.studyCardId ?? null,
    insights: input.insights ?? null,
    focusScore: input.focusScore ?? null,
    productivityScore: input.productivityScore ?? null,
    activities: [input.topic],
  });

  return {
    payloadAfter: created,
    affectedEntityType: "study_session",
    affectedEntityId: created.id,
    output: {
      studySessionId: created.id,
      topic: created.topic ?? input.topic,
      durationMinutes: created.durationMinutes ?? input.durationMinutes,
      date: (created.date ?? date).toString(),
      message: `Sessao de estudo registrada (${input.topic}, ${input.durationMinutes}min).`,
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
  await (storage as any).deleteStudySession(payloadAfter.id);
  return { reversedEntityType: "study_session", reversedEntityId: payloadAfter.id };
}

export const logStudySessionTool = {
  name: "log_study_session",
  description: "Registra sessao de estudo. Confirme antes.",
  inputSchema: logStudySessionInputSchema,
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
