// =============================================================================
// bulk_query_dimensions — Sprint AI-1C / RF-06 (ADR-160)
//
// Wrapper de batching para `query_dimension`. Executa N specs numa unica
// chamada de tool, reduzindo round-trips do LLM (cada query_dimension
// individual gera tool_use/tool_result roundtrip).
//
// Cada item do array `queries` segue o mesmo schema de `query_dimension`,
// + um `label` opcional para o LLM correlacionar resposta com pergunta.
// Limite hard de N=10 por chamada para evitar abuso.
//
// Retorna `{ results: Array<{ label?, ...queryDimensionResult }>, errors? }`.
// Erro em uma query nao quebra as outras — cada result tem seu proprio
// `ok`/`error` (consistente com `query_dimension` solo).
//
// Lessons: #9 (try/catch granular por query).
// =============================================================================

import { z } from "zod";
import type { CoachTool } from "../registry";
import { queryDimensionInputSchema } from "./queryDimension";

export const bulkQueryDimensionsInputSchema = z.object({
  queries: z
    .array(
      z.object({
        label: z.string().max(50).optional(),
      }).merge(queryDimensionInputSchema),
    )
    .min(1)
    .max(10),
});

export type BulkQueryDimensionsInput = z.infer<typeof bulkQueryDimensionsInputSchema>;

async function handler(rawInput: unknown, ctx: any): Promise<any> {
  const parsed = bulkQueryDimensionsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const { queries } = parsed.data;

  // Import dinamico para evitar ciclo + permitir mock isolado em tests.
  const { queryDimensionTool } = await import("./queryDimension");

  const results: any[] = [];
  for (const q of queries) {
    const { label, ...rest } = q as any;
    try {
      const res = await queryDimensionTool.handler(rest, ctx);
      results.push(label ? { label, ...res } : res);
    } catch (err: any) {
      console.error("coach.tool.bulk_query_dimensions.item.error", {
        userId: ctx.userId,
        label,
        dimension: rest?.dimension,
        err: err?.message ?? String(err),
      });
      results.push({
        label,
        ok: false,
        error: "handler_error",
        message: err?.message ?? "bulk_query_dimensions item failed",
      });
    }
  }
  return { results };
}

export const bulkQueryDimensionsTool: CoachTool = {
  name: "bulk_query_dimensions",
  description:
    "Batch de N (1-10) chamadas de query_dimension numa unica tool call. " +
    "Use quando precisar de varias metricas/recortes em paralelo (ex: ROI por site + ROI por category + volume 90d). " +
    "Cada item aceita os mesmos campos de query_dimension + um `label` opcional para correlacao.",
  inputSchema: bulkQueryDimensionsInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
