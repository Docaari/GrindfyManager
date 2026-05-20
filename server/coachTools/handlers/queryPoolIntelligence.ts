// =============================================================================
// queryPoolIntelligence — Sprint AI-2A / RF-06.5 (ADR-166)
//
// Le tournament_pool_intelligence (seed BR). Tabela vazia ->
// pool_intelligence_not_seeded; sem match -> no_match.
// =============================================================================

import { z } from "zod";

export const queryPoolIntelligenceInputSchema = z.object({
  site: z.string().optional(),
  namePattern: z.string().optional(),
});

export type QueryPoolIntelligenceInput = z.infer<typeof queryPoolIntelligenceInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

async function handler(input: QueryPoolIntelligenceInput, ctx: any): Promise<any> {
  const parsed = queryPoolIntelligenceInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const result = await store.queryTournamentPoolIntelligence?.({
    site: parsed.site,
    namePattern: parsed.namePattern,
  });

  const rows = result?.rows ?? [];
  if (rows.length === 0) {
    // Distinguir: tabela vazia (nao seeded) vs sem match.
    // Heuristica simples: se nao tem filtros, assume "not seeded".
    const hasFilters = !!(parsed.site || parsed.namePattern);
    return {
      rows: [],
      totalRows: 0,
      note: hasFilters ? "no_match" : "pool_intelligence_not_seeded",
    };
  }
  return { rows, totalRows: rows.length };
}

export const queryPoolIntelligenceTool = {
  name: "query_pool_intelligence" as const,
  description: "Consulta knowledge base de torneios MTT BR (read-only).",
  inputSchema: queryPoolIntelligenceInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
