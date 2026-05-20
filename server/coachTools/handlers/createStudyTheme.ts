// =============================================================================
// createStudyTheme — Sprint AI-2A / RF-04 (ADR-165)
//
// Cria study_theme + sync bidirecional linkedStats -> user_focus_stats.linked_themes
// (lesson #33). Undo deleta tema + reverte sync.
// =============================================================================

import { z } from "zod";

export const createStudyThemeInputSchema = z.object({
  name: z.string().min(3).max(50),
  category: z.enum(["preflop", "postflop", "multiway"]).optional(),
  linkedStats: z.array(z.string()).max(10).optional(),
});

export type CreateStudyThemeInput = z.infer<typeof createStudyThemeInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

async function fetchPayloadBefore(): Promise<any> {
  return null;
}

async function executeConfirmed(
  input: CreateStudyThemeInput,
  ctx: any,
  _tx: any,
): Promise<any> {
  const parsed = createStudyThemeInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const lookup = normalize(parsed.name);
  const existing = await store.findStudyThemeByName?.(ctx.userId, lookup);
  if (existing) {
    throw new Error("theme_name_duplicate");
  }

  const created = await store.createStudyTheme?.({
    userId: ctx.userId,
    name: parsed.name,
    category: parsed.category,
    linkedStats: parsed.linkedStats ?? [],
  });

  // sync bidirecional
  const linkedStats = parsed.linkedStats ?? [];
  for (const statCode of linkedStats) {
    try {
      await store.appendStatToThemes?.(ctx.userId, statCode, created.id);
    } catch (err) {
      console.error("create_study_theme.sync.error", { statCode, err });
    }
  }

  return {
    payloadAfter: { ...(created ?? {}), linkedStats },
    affectedEntityType: "study_theme",
    affectedEntityId: created?.id,
    output: { themeId: created?.id, name: created?.name },
  };
}

async function undo(
  _before: any,
  payloadAfter: any,
  ctx: any,
  _tx: any,
): Promise<{ reversedEntityType: string }> {
  const store = await resolveStorage(ctx?.injectedStorage);
  const themeId = payloadAfter?.id;
  const linkedStats: string[] = payloadAfter?.linkedStats ?? [];
  for (const statCode of linkedStats) {
    try {
      await store.removeStatFromThemes?.(ctx.userId, statCode, themeId);
    } catch (err) {
      console.error("create_study_theme.undo.sync.error", { err });
    }
  }
  if (themeId) {
    await store.deleteStudyTheme?.(themeId);
  }
  return { reversedEntityType: "study_theme" };
}

export const createStudyThemeTool = {
  name: "create_study_theme" as const,
  description:
    "Cria um study_theme (preflop|postflop|multiway). linkedStats sincroniza com user_focus_stats.",
  inputSchema: createStudyThemeInputSchema,
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
