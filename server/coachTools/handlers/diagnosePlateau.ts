// =============================================================================
// diagnosePlateau — Sprint AI-2A / RF-06.2 (ADR-166)
//
// Sinais (ordem de prioridade): roi_flat > volume_flat > no_study >
// selection_drift > unknown.
// env: COACH_PLATEAU_ROI_FLAT_THRESHOLD (default 0.15), COACH_PLATEAU_STUDY_FLOOR_MIN (default 120).
// =============================================================================

import { z } from "zod";

export const diagnosePlateauInputSchema = z.object({
  months: z.number().int().min(2).max(12).optional().default(3),
});

export type DiagnosePlateauInput = z.infer<typeof diagnosePlateauInputSchema>;

async function resolveStorage(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod = await import("../../storage");
  return (mod as any).storage;
}

function getFloat(envKey: string, def: number): number {
  const raw = Number(process.env[envKey]);
  return Number.isFinite(raw) && raw > 0 ? raw : def;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1));
}

async function handler(input: DiagnosePlateauInput, ctx: any): Promise<any> {
  const parsed = diagnosePlateauInputSchema.parse(input);
  const store = await resolveStorage(ctx?.injectedStorage);

  const perf = await store.getPerformanceByPeriod?.(ctx.userId, `${parsed.months}m`);
  const sampleSize = Number(perf?.sampleSize ?? 0);
  const minSample = 30 * parsed.months;

  const roiTrend: Array<{ month: string; roi: number }> = (await store.getMonthlyRoiTrend?.(ctx.userId, parsed.months)) ?? [];
  const volumeTrend: Array<{ month: string; volume: number }> = (await store.getMonthlyVolumeTrend?.(ctx.userId, parsed.months)) ?? [];
  const studyTrend: Array<{ month: string; minutes: number }> = (await store.getMonthlyStudyMinutesTrend?.(ctx.userId, parsed.months)) ?? [];
  const adherenceTrend: number[] = (await store.getProfileAdherenceTrend?.(ctx.userId, parsed.months)) ?? [];
  const leaksActive: any[] = (await store.findActiveLeakFocusList?.(ctx.userId)) ?? [];

  if (sampleSize < minSample) {
    return {
      isPlateau: false,
      signal: "unknown",
      sampleSize,
      roiTrend,
      studyMinutesTrend: studyTrend,
      volumeTrend,
      leaksActive,
      narrative: `Amostra insuficiente (${sampleSize} < ${minSample}). Nao consigo classificar plateau confiavelmente.`,
      recommendation: null,
    };
  }

  const roiFlatThreshold = getFloat("COACH_PLATEAU_ROI_FLAT_THRESHOLD", 0.15);
  const studyFloor = getFloat("COACH_PLATEAU_STUDY_FLOOR_MIN", 120);

  // ROI flat: stddev/|mean| < threshold
  const rois = roiTrend.map((m) => Number(m.roi));
  const roiMean = rois.length > 0 ? rois.reduce((a, b) => a + b, 0) / rois.length : 0;
  const roiStd = stddev(rois);
  const roiFlatRatio = Math.abs(roiMean) > 0 ? roiStd / Math.abs(roiMean) : Number.POSITIVE_INFINITY;
  const isRoiFlat = rois.length >= 2 && roiFlatRatio < roiFlatThreshold;

  // Study floor + leaks ativos
  const totalStudy = studyTrend.reduce((a, b) => a + Number(b.minutes), 0);
  const isNoStudy = totalStudy <= studyFloor && leaksActive.length > 0;

  // Volume flat
  const volumes = volumeTrend.map((m) => Number(m.volume));
  const volMean = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const volStd = stddev(volumes);
  const volFlatRatio = Math.abs(volMean) > 0 ? volStd / Math.abs(volMean) : Number.POSITIVE_INFINITY;
  const isVolFlat = volumes.length >= 2 && volFlatRatio < roiFlatThreshold;

  // Selection drift via adherence
  const isSelectionDrift =
    adherenceTrend.length >= 2 && adherenceTrend[adherenceTrend.length - 1] < 0.6;

  let signal: "roi_flat" | "volume_flat" | "no_study" | "selection_drift" | "unknown" = "unknown";
  if (isRoiFlat) signal = "roi_flat";
  else if (isVolFlat) signal = "volume_flat";
  else if (isNoStudy) signal = "no_study";
  else if (isSelectionDrift) signal = "selection_drift";

  const isPlateau = signal !== "unknown";

  let recommendation: any = null;
  if (signal === "roi_flat") {
    recommendation = { kind: "tool", target: "analyze_variance", text: "Rode analyze_variance para diferenciar variancia x leak." };
  } else if (signal === "no_study") {
    recommendation = { kind: "link", target: "/estudos", text: "Sem estudo registrado e com leaks ativos. Bora abrir /estudos." };
  } else if (signal === "volume_flat") {
    recommendation = { kind: "tool", target: "find_top_leaks", text: "Volume estavel + ROI parado — talvez seja hora de subir limite." };
  } else if (signal === "selection_drift") {
    recommendation = { kind: "link", target: "/coach", text: "Aderencia ao perfil caiu — revise sua grade." };
  }

  return {
    isPlateau,
    signal,
    sampleSize,
    roiTrend,
    studyMinutesTrend: studyTrend,
    volumeTrend,
    leaksActive,
    narrative: isPlateau
      ? `Sinal de plateau detectado: ${signal} (${parsed.months}m).`
      : `Sem sinal claro de plateau nos ultimos ${parsed.months} meses.`,
    recommendation,
  };
}

export const diagnosePlateauTool = {
  name: "diagnose_plateau" as const,
  description: "Diagnostica plateau: roi_flat, volume_flat, no_study, selection_drift.",
  inputSchema: diagnosePlateauInputSchema,
  requiresConfirmation: false as const,
  auditLevel: "log" as const,
  gateByTier: ["pro", "premium", "admin"] as const,
  handler,
};
