// =============================================================================
// registerTournamentInGradeTool — Sprint Coach-2B / RF-04 (write tool)
//
// Adiciona torneio ao grade. XOR templateId/manualEntry. Auto-fill via library
// quando templateId presente.
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";

const manualEntrySchema = z.object({
  site: z.string(),
  name: z.string(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(["Vanilla", "PKO", "Mystery", "Satellite"]),
  speed: z.enum(["Normal", "Turbo", "Hyper"]),
  buyIn: z.number().positive(),
  guaranteed: z.number().nonnegative().optional(),
});

export const registerTournamentInGradeInputSchema = z
  .object({
    templateId: z.string().optional(),
    manualEntry: manualEntrySchema.optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    profile: z.enum(["A", "B", "C"]).optional().default("A"),
    prioridade: z.number().int().min(1).max(3).optional().default(2),
  })
  .superRefine((val, ctx) => {
    if (!val.templateId && !val.manualEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "templateId OU manualEntry requerido",
      });
    }
    if (val.templateId && val.manualEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Apenas um — templateId XOR manualEntry",
      });
    }
  });

export type RegisterTournamentInGradeInput = z.infer<
  typeof registerTournamentInGradeInputSchema
>;

async function fetchPayloadBefore(
  _input: RegisterTournamentInGradeInput,
  _ctx: { userId: string },
  _tx: any,
): Promise<any> {
  return null;
}

async function executeConfirmed(
  input: RegisterTournamentInGradeInput,
  ctx: { userId: string },
  _tx: any,
): Promise<{
  payloadAfter: any;
  affectedEntityType: string;
  affectedEntityId: string;
  output: any;
}> {
  let payload: any = {
    userId: ctx.userId,
    dayOfWeek: input.dayOfWeek,
    profile: input.profile ?? "A",
    prioridade: input.prioridade ?? 2,
  };

  if (input.templateId) {
    const template = await (storage as any).getLibraryTemplate(input.templateId);
    if (!template) {
      throw new Error("template_not_accessible");
    }
    if (template.userId && template.userId !== ctx.userId) {
      throw new Error("template_not_accessible");
    }
    payload = {
      ...payload,
      libraryTemplateId: template.id,
      name: template.name,
      site: template.site,
      buyIn: template.buyIn,
      guaranteed: template.guaranteed ?? null,
      lateRegMinutes: template.lateRegMinutes ?? null,
      startingStack: template.startingStack ?? null,
      gameType: template.gameType ?? null,
      type: template.type ?? null,
      speed: template.speed ?? null,
      allowsAddOn: template.allowsAddOn ?? false,
      allowsReentry: template.allowsReentry ?? false,
    };
  } else if (input.manualEntry) {
    payload = {
      ...payload,
      site: input.manualEntry.site,
      name: input.manualEntry.name,
      time: input.manualEntry.time,
      type: input.manualEntry.type,
      speed: input.manualEntry.speed,
      buyIn: input.manualEntry.buyIn,
      guaranteed: input.manualEntry.guaranteed ?? null,
    };
  }

  const created = await (storage as any).createPlannedTournament(payload);
  return {
    payloadAfter: created,
    affectedEntityType: "planned_tournament",
    affectedEntityId: created.id,
    output: {
      plannedTournamentId: created.id,
      name: created.name,
      site: created.site,
      dayOfWeek: created.dayOfWeek,
      time: created.time,
      message: `Adicionado ao grade dia ${created.dayOfWeek} as ${created.time} — ${created.name}`,
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
  await (storage as any).deletePlannedTournament(payloadAfter.id);
  return { reversedEntityType: "planned_tournament", reversedEntityId: payloadAfter.id };
}

export const registerTournamentInGradeTool = {
  name: "register_tournament_in_grade",
  description:
    "Adiciona um torneio ao grade do user. Use APOS sugerir + ouvir interesse. Confirme antes.",
  inputSchema: registerTournamentInGradeInputSchema,
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
