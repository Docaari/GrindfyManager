// =============================================================================
// server/coach/adherence/types.ts — Motor de Aderência (ADR-227 / DEC-A7)
// Contrato ESTÁVEL. A Ferramenta de Metas (fatia-2) importa estes tipos.
// Mudança de shape exige ADR + bump documentado. Server-only por ora (DEC-MA1);
// promover a shared/adherence.ts quando um consumidor client surgir.
// =============================================================================

/** Allowlist de métricas que o motor sabe comparar (RF-02). Estável. */
export type SourceMetric =
  | "grind_sessions_count"
  | "grind_days"
  | "planned_tournaments_count"
  | "study_minutes"
  | "study_sessions_count"
  | "lessons_recommended_done"
  | "themes_focus_studied"
  | "warmup_compliance"; // RF-09 — no union, mas SEM entrada no MAP (DEC-MA8 deferido)

/** Dimensão EST-6 (steps.<key>) à qual a métrica pertence — skip detection (RF-06). */
export type DimensionKey = "grind" | "study" | "lessons" | "themes";

/** Janela de comparação. weekStartDate sempre UTC (ymdUtc) — CLAUDE.md §10. */
export interface AdherencePeriod {
  kind: "week" | "month" | "quarter";
  /** "YYYY-MM-DD" UTC (segunda da semana, ou 1º dia do mês/trimestre). */
  weekStartDate: string;
}

export type DataSufficiency = "ok" | "low";

/**
 * Notas livres do breakdown. Vocabulário fechado (estável) para o consumidor
 * ramificar sem reinterpretar dado cru:
 *   'planned_zero'           — planejou explicitamente 0 (descanso) — dado válido.
 *   'no_plan'                — sem weekly_planning_sessions na janela.
 *   'window_open'            — janela ainda em curso (DEC-MA7) — parcial.
 *   'source_stub'            — fonte é stub/[] (ex: getStatsLeaks) — RF-07.
 *   'source_error'           — fonte lançou; capturado e degradado (RF-07).
 *   'plan_from_weekly_plan'  — study_minutes planejado veio do fallback (DEC-MA4).
 */
export type AdherenceNote =
  | "planned_zero"
  | "no_plan"
  | "window_open"
  | "source_stub"
  | "source_error"
  | "plan_from_weekly_plan"
  | null;

export interface AdherenceBreakdown {
  /** dimensão pulada conscientemente no EST-6 (steps.status='skipped') — A4 (DEC-MA5). */
  skipped: boolean;
  /** planned - actual quando não-feito (>0); null quando skipped/sem plano/overachieved. */
  shortfall: number | null;
  /** realizado > planejado (clampa compliance em 100, mas sinaliza superação). */
  overachieved: boolean;
  /** nota do vocabulário fechado acima; null quando nada a sinalizar. */
  note: AdherenceNote;
}

export interface PlannedVsActual {
  sourceMetric: SourceMetric;
  period: AdherencePeriod;
  /** valor planejado; null quando NÃO há plano na janela (≠ planned=0). */
  planned: number | null;
  /** valor realizado na janela (sempre numérico; 0 = nada feito). */
  actual: number;
  /** min(100, round(actual/planned*100)); null quando planned null/0 ou skipped. */
  compliancePct: number | null;
  /** 'ok' quando plano + janela fechada + dado; 'low' caso contrário (D9). */
  dataSufficiency: DataSufficiency;
  /** detalhamento p/ o consumidor montar a frase A4 sem reinterpretar dado cru. */
  breakdown: AdherenceBreakdown;
}

/** Resultado do helper de recap (RF-08) consumido pelo EST-5. */
export interface AdherenceRecap {
  grind: PlannedVsActual;
  study: PlannedVsActual;
  /** texto A4 pronto, sem culpa (lesson #10 — regras em adherenceRecapTone.ts). */
  summaryText: string;
}

/** Erro nomeado quando sourceMetric fora da allowlist (RF-01) — não 500 genérico. */
export class UnknownSourceMetricError extends Error {
  code = "unknown_source_metric" as const;
  constructor(public readonly sourceMetric: string) {
    super(`unknown_source_metric: ${sourceMetric}`);
    this.name = "UnknownSourceMetricError";
  }
}
