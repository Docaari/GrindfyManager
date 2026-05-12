// =============================================================================
// find_top_leaks — Sprint AI-0A / RF-02 (read tool — substitui o stub)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-02)
// Serv : server/coachLeakDetection.ts -> detectLeaks(userId, { period }) (overload async)
//
// Filtra/ordena por severidade, trunca por limit. total = total ANTES do truncamento.
// Sem leaks => note. detectLeaks que explode => loga + handler_error (lesson #9).
// =============================================================================

import { z } from "zod";
import { detectLeaks } from "../../coachLeakDetection";
import type { CoachTool } from "../registry";

export const findTopLeaksInputSchema = z.object({
  limit: z.number().int().min(1).max(20).default(5),
  minSeverity: z.enum(["low", "medium", "high"]).default("low"),
  period: z.enum(["30d", "90d", "180d"]).optional().default("90d"),
});

export type FindTopLeaksInput = z.infer<typeof findTopLeaksInputSchema>;

const SEVERITY_RANK: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };

function normalizeSeverity(raw: any): "low" | "medium" | "high" {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n >= 4) return "high";
    if (n >= 2) return "medium";
    return "low";
  }
  return "low";
}

// MEDIUM-4 reviewer: a fonte (CoachLeakSummary) NAO expoe `dimension` — em vez de
// placeholder "geral", derivamos honestamente do `code` do leak.
const DIMENSION_BY_CODE: Record<string, string> = {
  roi_by_format: "categoria",
  weak_site: "site",
  early_bust: "early_finish_rate",
  low_ft_conversion: "ft_conversion",
  declining_trend: "tendencia_mensal",
  insufficient_volume: "volume",
  no_study: "estudo",
};

function dimensionForCode(code: string): string {
  if (DIMENSION_BY_CODE[code]) return DIMENSION_BY_CODE[code];
  // Fallback: usa o proprio code como dimensao (legivel o suficiente).
  return code;
}

function mapLeak(leak: any): {
  severity: "low" | "medium" | "high";
  code: string;
  description: string;
  evidence: { dimension: string; value: number; n: number };
} {
  const severity = normalizeSeverity(leak.severity);
  const code = String(leak.code ?? leak.type ?? "unknown");
  const description = String(leak.description ?? leak.label ?? code);
  const ev = leak.evidence ?? {};
  const data = leak.data ?? {};
  const dimension = String(ev.dimension ?? leak.dimension ?? data.dimension ?? dimensionForCode(code));
  const valueRaw = ev.value ?? leak.value ?? data.roi ?? data.siteRoi ?? data.conversionRate ?? 0;
  const value = typeof valueRaw === "number" ? valueRaw : parseFloat(valueRaw ?? "0") || 0;
  const nRaw = ev.n ?? leak.sampleSize ?? leak.n ?? data.count ?? data.finalTables ?? 0;
  const n = typeof nRaw === "number" ? nRaw : parseInt(nRaw ?? "0", 10) || 0;
  return { severity, code, description, evidence: { dimension, value, n } };
}

async function handler(rawInput: unknown, ctx: { userId: string }): Promise<any> {
  // MEDIUM-2 reviewer: validar via Zod em runtime (aplica defaults).
  const parsed = findTopLeaksInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.issues };
  }
  const input = parsed.data;
  const period = input.period;
  try {
    // MEDIUM-4: a janela `period` agora e propagada a detectLeaksForUser
    // (que a repassa aos getAnalyticsBy*) — a citacao [fonte: find_top_leaks:<code>:<period>] eh fiel.
    const raw: any[] = (await (detectLeaks as any)(ctx.userId, { period, minSeverity: "low" })) ?? [];
    const list = Array.isArray(raw) ? raw : [];
    const mapped = list.map(mapLeak);
    const minRank = SEVERITY_RANK[input.minSeverity];
    const filtered = mapped.filter((l) => SEVERITY_RANK[l.severity] >= minRank);
    const total = filtered.length;
    const limited = filtered.slice(0, input.limit);
    const out: any = { leaks: limited, total };
    if (limited.length === 0) out.note = "dados insuficientes para detectar leaks";
    return out;
  } catch (err: any) {
    console.error("coach.tool.find_top_leaks.error", { userId: ctx.userId, period, err });
    return {
      ok: false,
      error: "handler_error",
      message: err?.message ?? "find_top_leaks failed",
    };
  }
}

export const findTopLeaksTool: CoachTool = {
  name: "find_top_leaks",
  description:
    "Detecta os principais leaks do jogador (ROI negativo por formato/site, early bust, " +
    "baixa conversao de FT, tendencia declinante). Retorna leaks com evidencia {dimension,value,n} " +
    "+ total. Use evidence.n como N na confidence tag.",
  inputSchema: findTopLeaksInputSchema,
  handler,
  requiresConfirmation: false,
  auditLevel: "log",
  gateByTier: ["pro", "premium", "admin"],
};
