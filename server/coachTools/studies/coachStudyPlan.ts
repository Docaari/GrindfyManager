/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Coach tool coachStudyPlan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3
 * ADR  : 134 (tools modulares + servicos orquestradores)
 *
 * Tool definition: contrato + Anthropic tool descriptor. Handler real vive
 * em server/services/studyWeeklyPlanService.ts (orquestrador).
 *
 * Lessons:
 *   #10 DRY de prompts (importa de .prompts.ts)
 *
 * HIGH-1 fix (Sprint Estudos-Coach-Biblio-2 review): com tool_choice forcado
 * `{type: 'tool', name: 'coachStudyPlan'}`, o `tool_use.input` que Claude
 * gera DEVE casar com input_schema. Antes declarava `{userContext,
 * weekStartDate}` (entrada conceitual) mas validavamos a saida via
 * StudyWeeklyPlanSchema -> falha sempre em prod. Correto: input_schema
 * espelha o OUTPUT que Claude vai gerar (`{days: [...]}`). Conversao via
 * helper local zodToJsonSchemaShallow (paridade com server/coachTools/registry.ts).
 */

import type { ZodTypeAny } from "zod";
import { StudyWeeklyPlanSchema } from "./coachStudyPlan.schema";
import {
  COACH_STUDY_PLAN_SYSTEM_PROMPT,
  buildStudyPlanUserBlock,
} from "./coachStudyPlan.prompts";

// Helper: conversao Zod -> JSON Schema (recursivo o suficiente para schemas
// usados aqui). Estrutura mais profunda que registry.ts pois Anthropic precisa
// das propriedades nested para gerar tool_use.input com shape correto.
function zodToJsonSchemaDeep(schema: ZodTypeAny): any {
  const def: any = (schema as any)?._def;
  if (!def) return { type: "object" };
  switch (def.typeName) {
    case "ZodObject": {
      const shape =
        typeof def.shape === "function" ? def.shape() : def.shape ?? {};
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries(shape)) {
        properties[key] = zodToJsonSchemaDeep(val as ZodTypeAny);
        const innerDef: any = (val as any)?._def;
        if (
          innerDef?.typeName !== "ZodOptional" &&
          innerDef?.typeName !== "ZodDefault" &&
          innerDef?.typeName !== "ZodNullable"
        ) {
          required.push(key);
        }
      }
      const out: any = { type: "object", properties };
      if (required.length > 0) out.required = required;
      return out;
    }
    case "ZodArray":
      return {
        type: "array",
        items: zodToJsonSchemaDeep(def.type ?? def.element),
      };
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable":
      return zodToJsonSchemaDeep(def.innerType);
    default:
      return {};
  }
}

export const coachStudyPlanTool = {
  name: "coachStudyPlan",
  description:
    "Gera plano de estudo semanal personalizado baseado em focus stats, leaks recentes, aulas relevantes e starred hands criticos. Output: 5 dias (Seg-Sex) x 3-4 atividades estruturadas em formato JSON.",
  page_context: ["estudos"] as const,
  audit_level: "persist" as const,
  cache_strategy: "ephemeral_system" as const,
  // HIGH-1: input_schema = OUTPUT shape (validado depois via StudyWeeklyPlanSchema).
  input_schema: zodToJsonSchemaDeep(StudyWeeklyPlanSchema),
  output_schema: StudyWeeklyPlanSchema,
  systemPromptBlock: COACH_STUDY_PLAN_SYSTEM_PROMPT,
  buildUserBlock: buildStudyPlanUserBlock,
};

export type CoachStudyPlanTool = typeof coachStudyPlanTool;
