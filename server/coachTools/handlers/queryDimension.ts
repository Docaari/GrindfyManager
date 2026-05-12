// =============================================================================
// query_dimension — Sprint AI-0A / RF-01 (read tool religada)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-01)
// ADR  : 145 (enums canonicos: speed Normal|Turbo|Hyper, category +Satellite,
//             groupBy +fieldSize -> getAnalyticsByField, period +180d)
//
// Roteia a dimensao pedida para os metodos de analytics existentes em
// storage.ts (que ja filtram WHERE grind_session_id IS NULL — regra §6.1).
// Sem dado => { rows:[], totalCount:0, note }. DB explode => loga + handler_error.
// =============================================================================

import { z } from "zod";
import { storage } from "../../storage";
import type { CoachTool } from "../registry";

const filtersSchema = z
  .object({
    site: z.string().optional(),
    category: z.enum(["Vanilla", "PKO", "Mystery", "Satellite"]).optional(),
    speed: z.enum(["Normal", "Turbo", "Hyper"]).optional(),
    dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  })
  .optional();

export const queryDimensionInputSchema = z.object({
  dimension: z.enum(["roi", "profit", "volume", "itm", "abi", "fts", "cravadas"]),
  groupBy: z
    .enum(["site", "category", "speed", "buyinRange", "dayOfWeek", "month", "fieldSize"])
    .optional(),
  filters: filtersSchema,
  period: z.enum(["all", "30d", "90d", "ytd", "180d"]).optional().default("all"),
});

export type QueryDimensionInput = z.infer<typeof queryDimensionInputSchema>;

// Mapeia a dimensao pedida para a chave provavel no row de analytics.
const DIMENSION_FIELDS: Record<QueryDimensionInput["dimension"], string[]> = {
  roi: ["roi"],
  profit: ["profit"],
  volume: ["volume", "count", "totalTournaments"],
  itm: ["itmPercent", "itm"],
  abi: ["abi", "avgBuyIn"],
  fts: ["fts", "finalTables"],
  cravadas: ["cravadas"],
};

const KEY_FIELDS = ["site", "category", "speed", "label", "range", "field", "month"];

function rowKey(row: any): string {
  for (const k of KEY_FIELDS) {
    if (row[k] != null && row[k] !== "") return String(row[k]);
  }
  if (row.dayOfWeek != null) return String(row.dayOfWeek);
  return "—";
}

function rowCount(row: any): number {
  const v = row.count ?? row.volume ?? row.totalTournaments ?? 0;
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function rowValue(row: any, dimension: QueryDimensionInput["dimension"]): number {
  for (const f of DIMENSION_FIELDS[dimension]) {
    const v = row[f];
    if (v != null) {
      const n = typeof v === "number" ? v : parseFloat(v ?? "");
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

const STORAGE_METHOD_BY_GROUP: Record<string, string> = {
  site: "getAnalyticsBySite",
  category: "getAnalyticsByCategory",
  speed: "getAnalyticsBySpeed",
  buyinRange: "getAnalyticsByBuyinRange",
  dayOfWeek: "getAnalyticsByDayOfWeek",
  month: "getAnalyticsByMonth",
  fieldSize: "getAnalyticsByField", // ADR-145 §4 — labels do dashboard, NAO os buckets V2.
};

type Row = { key: string; value: number; count: number };

function buildResult(
  input: QueryDimensionInput,
  period: string,
  groupBy: string | null,
  rows: Row[],
): any {
  const totalCount = rows.reduce((sum, r) => sum + (r.count || 0), 0);
  const out: any = { dimension: input.dimension, groupBy, rows, totalCount, period };
  if (rows.length === 0) out.note = "sem dados suficientes";
  return out;
}

async function handler(rawInput: unknown, ctx: { userId: string }): Promise<any> {
  // MEDIUM-2 reviewer: validar via Zod em runtime (aplica defaults; LLM pode mandar shape ruim).
  const parsed = queryDimensionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input = parsed.data;
  const period = input.period;
  const filters = input.filters ?? {};
  try {
    if (input.groupBy) {
      const method = STORAGE_METHOD_BY_GROUP[input.groupBy];
      const raw = (await (storage as any)[method](ctx.userId, period, filters)) ?? [];
      const list: any[] = Array.isArray(raw) ? raw : [];
      const rows: Row[] = list.map((row) => ({
        key: rowKey(row),
        value: rowValue(row, input.dimension),
        count: rowCount(row),
      }));
      return buildResult(input, period, input.groupBy, rows);
    }

    // Sem groupBy: extrai a dimensao do dashboard agregado.
    const stats: any = (await (storage as any).getDashboardStats(ctx.userId, period, filters)) ?? {};
    const totalCount = rowCount({ ...stats, count: stats.totalTournaments ?? stats.count });
    const rows: Row[] =
      totalCount > 0 ? [{ key: input.dimension, value: rowValue(stats, input.dimension), count: totalCount }] : [];
    return buildResult(input, period, null, rows);
  } catch (err: any) {
    // Lesson #9: loga ANTES do fallback; distingue "DB explodiu" de "sem rows".
    console.error("coach.tool.query_dimension.error", {
      userId: ctx.userId,
      dimension: input.dimension,
      groupBy: input.groupBy,
      err,
    });
    return {
      ok: false,
      error: "handler_error",
      message: err?.message ?? "query_dimension failed",
    };
  }
}

export const queryDimensionTool: CoachTool = {
  name: "query_dimension",
  description:
    "Analytics do jogador por dimensao (ROI, profit, volume, ITM, ABI, FTs, cravadas), " +
    "opcionalmente agrupado por site/category/speed/buyinRange/dayOfWeek/month/fieldSize. " +
    "Retorna rows {key,value,count} + totalCount (use como N na confidence tag).",
  inputSchema: queryDimensionInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
