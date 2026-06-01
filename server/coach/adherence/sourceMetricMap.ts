// =============================================================================
// server/coach/adherence/sourceMetricMap.ts — Motor de Aderência (ADR-227 / RF-02)
//
// Fonte única de verdade do que o motor sabe comparar. Guard test obrigatório:
// toda CHAVE do MAP resolve plannedSource + actualSource + dimensionKey + unit
// (sem entrada órfã). O union SourceMetric pode ter membro SEM entrada aqui
// (warmup_compliance — DEC-MA8 deferido).
// =============================================================================

import type { DimensionKey, SourceMetric } from "./types";

export interface SourceMetricSpec {
  dimensionKey: DimensionKey;
  unit: "sessões" | "dias" | "torneios" | "minutos" | "aulas" | "temas" | "%";
  /** identificadores das fontes (validados pelo guard test contra o storage). */
  plannedSource: string;
  actualSource: string;
}

// TODO(motor-aderencia): warmup_compliance — RF-09 stretch.
// Requer cooldown_logs/warm-up rituals 1:1 grind_sessions; degrade gracioso (RF-07).
// warmup_compliance OMITIDO de propósito (DEC-MA8 deferido). O union SourceMetric
// o contém; o MAP não — chamar → unknown_source_metric. Guard test valida que
// toda CHAVE do MAP resolve fontes (não o inverso).
export const SOURCE_METRIC_MAP: Record<
  Exclude<SourceMetric, "warmup_compliance">,
  SourceMetricSpec
> = {
  grind_sessions_count: {
    dimensionKey: "grind",
    unit: "sessões",
    plannedSource: "weekly_planning_sessions.steps.grind -> planned_tournaments",
    actualSource: "getGrindSessions",
  },
  grind_days: {
    dimensionKey: "grind",
    unit: "dias",
    plannedSource: "weekly_planning_sessions.steps.grind -> planned_tournaments",
    actualSource: "getGrindSessions",
  },
  planned_tournaments_count: {
    dimensionKey: "grind",
    unit: "torneios",
    plannedSource: "weekly_planning_sessions.steps.grind -> planned_tournaments",
    actualSource: "getSessionTournaments",
  },
  study_minutes: {
    dimensionKey: "study",
    unit: "minutos",
    plannedSource: "weekly_planning_sessions.steps.study | getStudyWeeklyPlan",
    actualSource: "getStudySessionsV2",
  },
  study_sessions_count: {
    dimensionKey: "study",
    unit: "sessões",
    plannedSource: "weekly_planning_sessions.steps.study",
    actualSource: "getStudySessionsV2",
  },
  lessons_recommended_done: {
    dimensionKey: "lessons",
    unit: "aulas",
    plannedSource: "weekly_planning_sessions.steps.lessons | getCoachRecommendationByUserAndWeek",
    actualSource: "getCoachRecommendationByUserAndWeek",
  },
  themes_focus_studied: {
    dimensionKey: "themes",
    unit: "temas",
    plannedSource: "weekly_planning_sessions.steps.themes.focus",
    actualSource: "getStudySessionsV2",
  },
};

/** RF-06 — dimensão EST-6 por métrica (skip detection). Exportado p/ guard test. */
export const DIMENSION_KEY_BY_METRIC: Record<
  Exclude<SourceMetric, "warmup_compliance">,
  DimensionKey
> = {
  grind_sessions_count: "grind",
  grind_days: "grind",
  planned_tournaments_count: "grind",
  study_minutes: "study",
  study_sessions_count: "study",
  lessons_recommended_done: "lessons",
  themes_focus_studied: "themes",
};
