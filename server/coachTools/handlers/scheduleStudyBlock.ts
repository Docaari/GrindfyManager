// =============================================================================
// scheduleStudyBlock — Sprint AI-2A / RF-03 (ADR-165)
//
// Cria um bloco em study_sessions_v2 com status='planned'. Valida ownership
// de theme + entitlement de lesson.
// =============================================================================

import { z } from "zod";

export const scheduleStudyBlockInputSchema = z.object({
  topic: z.string().min(1).max(160),
  startAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?$/, "startAt must be ISO 8601"),
  durationMinutes: z.number().int().min(15).max(240),
  studyThemeId: z.string().optional(),
  lessonId: z.string().optional(),
});

export type ScheduleStudyBlockInput = z.infer<typeof scheduleStudyBlockInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function fetchPayloadBefore(
  _input: ScheduleStudyBlockInput,
  _ctx: any,
  _tx: any,
): Promise<any> {
  return null;
}

async function executeConfirmed(
  input: ScheduleStudyBlockInput,
  ctx: any,
  _tx: any,
): Promise<any> {
  const parsed = scheduleStudyBlockInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  // ownership theme
  if (parsed.studyThemeId) {
    try {
      const theme = await store.getStudyTheme?.(parsed.studyThemeId);
      if (theme && theme.userId !== ctx.userId) {
        throw new Error("theme_not_accessible");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "theme_not_accessible") throw err;
      console.error("schedule_study_block.theme.error", { err });
    }
  }

  // entitlement lesson
  if (parsed.lessonId) {
    let hasAccess = false;
    try {
      if (typeof store.hasLessonEntitlement === "function") {
        hasAccess = !!(await store.hasLessonEntitlement(ctx.userId, parsed.lessonId));
      } else {
        const lessonMod = await import("../../services/lessonEntitlement");
        hasAccess = !!(await lessonMod.hasAccess(ctx.userId, parsed.lessonId));
      }
    } catch (err) {
      console.error("schedule_study_block.lesson.error", { err });
      hasAccess = false;
    }
    if (!hasAccess) {
      throw new Error("lesson_not_accessible");
    }
  }

  try {
    const start = new Date(parsed.startAt);
    const end = new Date(start.getTime() + parsed.durationMinutes * 60 * 1000);
    await store.listStudySessionsV2InRange?.({ userId: ctx.userId, from: start, to: end });
  } catch (err) {
    console.error("schedule_study_block.conflict_check.error", { userId: ctx.userId, err });
  }

  const row = await store.createStudySessionV2?.({
    userId: ctx.userId,
    topic: parsed.topic,
    themeId: parsed.studyThemeId ?? null,
    lessonId: parsed.lessonId ?? null,
    startAt: parsed.startAt,
    scheduledFor: parsed.startAt,
    durationMinutes: parsed.durationMinutes,
    status: "planned",
  });

  return {
    payloadAfter: row,
    affectedEntityType: "study_session_v2",
    affectedEntityId: row?.id,
    output: { sessionId: row?.id, status: "planned" },
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
    await store.deleteStudySessionV2?.(payloadAfter.id);
  }
  return { reversedEntityType: "study_session_v2" };
}

export const scheduleStudyBlockTool = {
  name: "schedule_study_block" as const,
  description:
    "Agenda um bloco de estudo (study_sessions_v2 status='planned'). Ownership de theme + entitlement de lesson exigidos.",
  inputSchema: scheduleStudyBlockInputSchema,
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
