/**
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Coach tool coachSessionInsights.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4
 * ADR  : 134
 *
 * HIGH-1 fix (review): input_schema agora reflete OUTPUT (`{summary, topHands,
 * suggestedLessons, spotsToReview, focusStatsHighlight}`). Antes declarava
 * `{sessionContext}` (entrada conceitual) -> tool_use.input nao casava com
 * SessionInsightsSchema na validacao. Mock de teste ja retornava no shape
 * correto, mascarando o bug.
 */

import type { ZodTypeAny } from "zod";
import { SessionInsightsSchema } from "./coachSessionInsights.schema";
import {
  COACH_SESSION_INSIGHTS_SYSTEM_PROMPT,
  buildSessionInsightsUserBlock,
} from "./coachSessionInsights.prompts";

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

export const coachSessionInsightsTool = {
  name: "coachSessionInsights",
  description:
    "Analisa sessao /grind-live finalizada e retorna insights estruturados: top 3 maos para review, aulas sugeridas baseadas em decisoes, spots gravados com sugestao default e stats foco da sessao.",
  page_context: ["grind-live"] as const,
  audit_level: "persist" as const,
  cache_strategy: "ephemeral_system" as const,
  input_schema: zodToJsonSchemaDeep(SessionInsightsSchema),
  output_schema: SessionInsightsSchema,
  systemPromptBlock: COACH_SESSION_INSIGHTS_SYSTEM_PROMPT,
  buildUserBlock: buildSessionInsightsUserBlock,
};

export type CoachSessionInsightsTool = typeof coachSessionInsightsTool;
