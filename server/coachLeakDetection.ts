// =============================================================================
// Coach Leak Detection — Rule-based leak detector for Technical Coach
// =============================================================================

export type Leak = {
  type: string;
  severity: number;
  description: string;
  data?: any;
  recommendation?: string;
};

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

export function detectLeaks(input: LeakDetectionInput): Leak[] {
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
