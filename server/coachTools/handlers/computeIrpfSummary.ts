// =============================================================================
// computeIrpfSummaryTool — Sprint AI-2B / RF-04 (ADR-169 §RF-04)
//
// Read tool ad-hoc: USD→BRL via PTAX médio do período. BR-only (country='BR'
// ou timezone começa com 'America/'). Disclaimer canônico (REPORT_DISCLAIMER).
// =============================================================================

import { z } from "zod";
import { REPORT_DISCLAIMER } from "../../coach/disclaimers";

export const computeIrpfSummaryInputSchema = z
  .object({
    period: z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  })
  .refine((v) => v.period.end >= v.period.start, {
    message: "period.end must be >= period.start",
    path: ["period", "end"],
  });

export type ComputeIrpfSummaryInput = z.infer<typeof computeIrpfSummaryInputSchema>;

async function resolveBaseStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  try {
    const mod: any = await import("../../storage");
    return (mod as any).storage;
  } catch {
    return {};
  }
}

function isBrUser(u: any): boolean {
  if (!u) return false;
  const country = String(u.country ?? "").toUpperCase();
  if (country === "BR") return true;
  const tz = String(u.timezone ?? "");
  // Heurística: timezones brasileiros são "America/Sao_Paulo", "America/Bahia", etc.
  // "America/New_York" não é BR. A spec aceita 'America/*' como "br_or_americas"
  // — mas a regra Q-C exige BR estrito. Mantenho regra explícita: timezone BR.
  if (
    tz === "America/Sao_Paulo" ||
    tz === "America/Bahia" ||
    tz === "America/Belem" ||
    tz === "America/Fortaleza" ||
    tz === "America/Recife" ||
    tz === "America/Manaus" ||
    tz === "America/Cuiaba" ||
    tz === "America/Campo_Grande" ||
    tz === "America/Porto_Velho" ||
    tz === "America/Boa_Vista" ||
    tz === "America/Rio_Branco" ||
    tz === "America/Maceio" ||
    tz === "America/Araguaina" ||
    tz === "America/Eirunepe" ||
    tz === "America/Noronha" ||
    tz === "America/Santarem"
  ) {
    return true;
  }
  return false;
}

async function handler(
  input: ComputeIrpfSummaryInput,
  ctx: { userId: string; injectedStorage?: any },
): Promise<any> {
  const parsed = computeIrpfSummaryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", details: parsed.error.issues };
  }
  const storage = await resolveBaseStorage(ctx.injectedStorage);

  let userProfile: any = null;
  try {
    if (typeof storage.getUserProfile === "function") {
      userProfile = await storage.getUserProfile(ctx.userId);
    } else if (typeof storage.getUserById === "function") {
      userProfile = await storage.getUserById(ctx.userId);
    }
  } catch (err) {
    console.error("computeIrpfSummary.profile.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
  }
  if (!isBrUser(userProfile)) {
    return { ok: false, error: "br_only" };
  }

  let perf: any = null;
  try {
    const rangeArg = `${parsed.data.period.start} to ${parsed.data.period.end}`;
    perf = await storage.getPerformanceByPeriod?.(ctx.userId, rangeArg, {});
  } catch (err) {
    console.error("computeIrpfSummary.perf.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
  }
  const profitUsd = Number(perf?.profit ?? 0);

  let avgPtax: number | null = null;
  let degraded = false;
  try {
    const fx: any = await import("../../../shared/fxCascade");
    const fn = fx.getAveragePtaxForRange ?? fx.fxCascade?.getAveragePtaxForRange ?? fx.default?.getAveragePtaxForRange;
    if (typeof fn === "function") {
      avgPtax = Number(await fn(parsed.data.period.start, parsed.data.period.end));
    }
  } catch (err) {
    console.error("computeIrpfSummary.fx.error", { userId: ctx.userId, err: err instanceof Error ? err.message : String(err) });
    degraded = true;
  }
  if (avgPtax == null || !Number.isFinite(avgPtax) || avgPtax <= 0) {
    degraded = true;
  }

  const byCurrency: Array<{ currency: string; profit: number; convertedUsd: number; convertedBrl: number | null }> = [];
  if (!degraded && Array.isArray(perf?.byCurrency)) {
    for (const c of perf.byCurrency) {
      const cur = String(c?.currency ?? "USD").toUpperCase();
      const native = Number(c?.profit ?? 0);
      const ptax = avgPtax as number;
      const convertedUsd = cur === "BRL" ? native / ptax : native;
      byCurrency.push({ currency: cur, profit: native, convertedUsd, convertedBrl: convertedUsd * ptax });
    }
  }

  return {
    profitUsd,
    profitBrl: degraded ? null : profitUsd * (avgPtax as number),
    avgPtax,
    period: parsed.data.period,
    byCurrency,
    degraded: degraded || undefined,
    degradedReason: degraded ? "fx_unavailable" : undefined,
    disclaimer: REPORT_DISCLAIMER,
  };
}

export const computeIrpfSummaryTool = {
  name: "compute_irpf_summary",
  description:
    "Gera extrato fiscal INFORMATIVO P&L USD→BRL via PTAX medio do periodo. NAO substitui contador (ADR-173 disclaimer).",
  inputSchema: computeIrpfSummaryInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
