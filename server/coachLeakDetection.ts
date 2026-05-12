// =============================================================================
// Coach Leak Detection — Rule-based leak detector for Technical Coach
//
// Sprint Coach-2B / RF-08: detectLeaksForUser(userId, opts) wrapper que
// gather analytics + transforma shape para Coach-2B (code/evidence.n).
// =============================================================================

export type Leak = {
  type: string;
  severity: number;
  description: string;
  data?: any;
  recommendation?: string;
};

/**
 * Sprint Coach-2B output shape (RF-08):
 *   { code, severity: 'low'|'medium'|'high', evidence: { n, value }, description }
 */
export interface CoachLeakSummary {
  code: string;
  severity: "low" | "medium" | "high";
  evidence: { n: number; value?: number };
  description: string;
}

type LeakDetectionInput = {
  analyticsByCategory: Array<{
    category: string;
    speed: string;
    roi: number;
    count: number;
  }>;
  analyticsBySite: Array<{
    site: string;
    roi: number;
    count: number;
  }>;
  overallRoi: number;
  earlyFinishRate: number;
  finalTables: number;
  cravadas: number;
  analyticsByMonth: Array<{
    month: string;
    roi: number;
    count: number;
  }>;
  totalTournaments: number;
  lastStudySessionDays?: number;
};

const MIN_SAMPLE = 30;

/**
 * Legacy ABI: recebe input pre-gathered. Mantem compat com 22 tests +
 * coachContext.ts + studies-v2.ts.
 *
 * Sprint Coach-2B / RF-08 ABI: detectLeaks(userId, opts) async wrapper
 * que gather + retorna shape Coach-2B. Implementado abaixo via overload.
 */
export function detectLeaks(input: LeakDetectionInput): Leak[];
export function detectLeaks(
  userId: string,
  opts?: { minSeverity?: "low" | "medium" | "high"; period?: string },
): Promise<CoachLeakSummary[]>;
export function detectLeaks(
  inputOrUserId: any,
  opts?: any,
): Leak[] | Promise<CoachLeakSummary[]> {
  if (typeof inputOrUserId === "string") {
    // ABI Coach-2B: (userId, opts) async
    return detectLeaksForUser(inputOrUserId as string, opts as any);
  }
  // ABI legacy: (input) sync
  return detectLeaksLegacy(inputOrUserId as LeakDetectionInput);
}

export function detectLeaksLegacy(input: LeakDetectionInput): Leak[] {
  // No data = no leaks
  if (input.totalTournaments === 0 && input.analyticsByCategory.length === 0 &&
      input.analyticsBySite.length === 0 && input.analyticsByMonth.length === 0) {
    return [];
  }

  const leaks: Leak[] = [];

  // 1. ROI negativo por formato (category + speed)
  for (const entry of input.analyticsByCategory) {
    if (entry.count >= MIN_SAMPLE && entry.roi < -5) {
      leaks.push({
        type: 'roi_by_format',
        severity: Math.min(5, Math.ceil(Math.abs(entry.roi) / 3)),
        description: `ROI negativo em ${entry.category} ${entry.speed}: ${entry.roi}% (${entry.count} torneios)`,
        data: { category: entry.category, speed: entry.speed, roi: entry.roi, count: entry.count },
        recommendation: `Considere reduzir volume ou eliminar ${entry.category} ${entry.speed} da grade.`,
      });
    }
  }

  // 2. Performance fraca em site especifico
  for (const entry of input.analyticsBySite) {
    if (entry.count >= MIN_SAMPLE && (input.overallRoi - entry.roi) > 10) {
      leaks.push({
        type: 'weak_site',
        severity: Math.min(5, Math.ceil((input.overallRoi - entry.roi) / 5)),
        description: `Performance fraca em ${entry.site}: ROI ${entry.roi}% vs geral ${input.overallRoi}% (${entry.count} torneios)`,
        data: { site: entry.site, siteRoi: entry.roi, overallRoi: input.overallRoi, count: entry.count },
        recommendation: `Avalie se vale continuar jogando em ${entry.site}.`,
      });
    }
  }

  // 3. Early bust excessivo (> 15%)
  if (input.earlyFinishRate > 15) {
    leaks.push({
      type: 'early_bust',
      severity: Math.min(5, Math.ceil((input.earlyFinishRate - 15) / 2) + 1),
      description: `Taxa de bust precoce: ${input.earlyFinishRate}% (acima do threshold 15%)`,
      data: { earlyFinishRate: input.earlyFinishRate },
      recommendation: 'Revise sua estrategia de early game. Pode estar tomando riscos desnecessarios.',
    });
  }

  // 4. Baixa conversao de final table (cravadas/FTs < 10%)
  if (input.finalTables >= 10) {
    const conversionRate = (input.cravadas / input.finalTables) * 100;
    if (conversionRate < 10) {
      leaks.push({
        type: 'low_ft_conversion',
        severity: 3,
        description: `Baixa conversao de FT: ${conversionRate.toFixed(1)}% (${input.cravadas}/${input.finalTables})`,
        data: { cravadas: input.cravadas, finalTables: input.finalTables, conversionRate },
        recommendation: 'Estude ICM e estrategia de final table para melhorar conversao.',
      });
    }
  }

  // 5. Tendencia declinante (3 meses recentes vs 3 anteriores)
  if (input.analyticsByMonth.length >= 6) {
    const sorted = [...input.analyticsByMonth].sort((a, b) => b.month.localeCompare(a.month));
    const recent3 = sorted.slice(0, 3);
    const previous3 = sorted.slice(3, 6);

    const recentAvg = recent3.reduce((sum, m) => sum + m.roi, 0) / recent3.length;
    const previousAvg = previous3.reduce((sum, m) => sum + m.roi, 0) / previous3.length;

    if ((previousAvg - recentAvg) > 5) {
      leaks.push({
        type: 'declining_trend',
        severity: 3,
        description: `Tendencia declinante: ROI medio recente ${recentAvg.toFixed(1)}% vs anterior ${previousAvg.toFixed(1)}% (queda de ${(previousAvg - recentAvg).toFixed(1)}pp)`,
        data: { recentAvg, previousAvg, diff: previousAvg - recentAvg },
        recommendation: 'Analise o que mudou nos ultimos meses. Considere revisar sua grade e estrategia.',
      });
    }
  }

  // 6. Volume insuficiente
  if (input.totalTournaments > 0 && input.totalTournaments < 500) {
    leaks.push({
      type: 'insufficient_volume',
      severity: 1,
      description: `Volume insuficiente: ${input.totalTournaments} torneios. Recomendado minimo 500 para analise confiavel.`,
      data: { totalTournaments: input.totalTournaments },
      recommendation: 'Aumente o volume para que as analises sejam estatisticamente significativas.',
    });
  }

  // 7. Falta de estudo
  if (input.lastStudySessionDays !== undefined && input.lastStudySessionDays > 30) {
    leaks.push({
      type: 'no_study',
      severity: 2,
      description: `Sem sessao de estudo nos ultimos ${input.lastStudySessionDays} dias.`,
      data: { lastStudySessionDays: input.lastStudySessionDays },
      recommendation: 'Mantenha uma rotina regular de estudo para continuar evoluindo.',
    });
  }

  // Sort by severity (highest first)
  leaks.sort((a, b) => b.severity - a.severity);

  return leaks;
}

// =============================================================================
// detectLeaksForUser — Sprint Coach-2B / RF-08 wrapper
//
// Gather analytics no storage, chama detectLeaks(input), transforma shape
// para CoachLeakSummary (code/evidence.n).
// =============================================================================

function severityLevel(num: number): "low" | "medium" | "high" {
  if (num >= 4) return "high";
  if (num >= 2) return "medium";
  return "low";
}

function severityRank(level: "low" | "medium" | "high"): number {
  return { low: 1, medium: 2, high: 3 }[level];
}

export interface DetectLeaksOpts {
  minSeverity?: "low" | "medium" | "high";
  /**
   * Sprint AI-0A (MEDIUM-4): janela de analise. Propagada aos getAnalyticsBy*
   * + getDashboardStats. Default "all" (mantem o comportamento historico).
   * NOTA: o leak "declining_trend" usa `analyticsByMonth` que e sempre por mes —
   * a janela `period` limita os meses considerados, nao o agrupamento.
   */
  period?: string;
}

/**
 * Sprint Coach-2B / RF-08 wrapper interno: gather + transforma shape.
 * Chamado via detectLeaks(userId, opts) overload acima.
 */
async function detectLeaksForUser(
  userId: string,
  opts: DetectLeaksOpts = {},
): Promise<CoachLeakSummary[]> {
  const minLevel = severityRank(opts.minSeverity ?? "low");
  const period = opts.period ?? "all";
  // Lazy import para evitar ciclos
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storageMod = require("./storage");
  const storage = storageMod.storage;

  let dashboardStats: any = {};
  let analyticsByCategory: any[] = [];
  let analyticsBySite: any[] = [];
  let analyticsByMonth: any[] = [];
  try {
    dashboardStats = (await storage.getDashboardStats?.(userId, period)) ?? {};
    [analyticsByCategory, analyticsBySite, analyticsByMonth] = await Promise.all([
      storage.getAnalyticsByCategory?.(userId, period) ?? [],
      storage.getAnalyticsBySite?.(userId, period) ?? [],
      storage.getAnalyticsByMonth?.(userId, period) ?? [],
    ]);
  } catch (err) {
    console.error("detectLeaksForUser.gather.error", { userId, err });
    return [];
  }

  const leaks = detectLeaksLegacy({
    analyticsByCategory: (analyticsByCategory || []) as any,
    analyticsBySite: (analyticsBySite || []) as any,
    overallRoi: dashboardStats.roi ?? 0,
    earlyFinishRate: dashboardStats.earlyFinishRate ?? 0,
    finalTables: dashboardStats.finalTables ?? 0,
    cravadas: dashboardStats.cravadas ?? 0,
    analyticsByMonth: (analyticsByMonth || []) as any,
    totalTournaments: dashboardStats.totalTournaments ?? 0,
  });

  return leaks
    .map((l): CoachLeakSummary => {
      const level = severityLevel(l.severity);
      const data = l.data ?? {};
      const n = Number(data.count ?? data.finalTables ?? 0);
      const value = data.roi ?? data.siteRoi ?? data.conversionRate;
      return {
        code: l.type,
        severity: level,
        evidence: { n, value: value !== undefined ? Number(value) : undefined },
        description: l.description,
      };
    })
    .filter((l) => severityRank(l.severity) >= minLevel);
}

