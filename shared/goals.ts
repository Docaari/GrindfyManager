// =============================================================================
// shared/goals.ts — Ferramenta de Metas 4DX fatia-1 (ADR-229)
//
// Enums fechados + schemas Zod de fronteira HTTP + allowlists de sourceMetric.
// Os CHECK constraints vivem na migration SQL; o Zod cobre a forma do payload.
// =============================================================================

import { z } from "zod";

export const GOAL_TYPES = ["process", "performance", "result"] as const;
export const GOAL_CATEGORIES = [
  "financial_brm",
  "volume_grind",
  "study",
  "mental_tilt",
  "process_routine",
  "longevity_burnout",
  "leak_focus",
] as const;
export const GOAL_UNITS = ["usd", "pct", "minutes", "sessions", "days", "boolean"] as const;
export const GOAL_CADENCES = ["weekly", "daily"] as const;
export const GOAL_HORIZONS = ["week", "month", "quarter", "season"] as const;
export const WIG_HORIZONS = ["quarter", "season"] as const;

// allowlist controlavel (RF-04b) — fonte para o guard "nao-controlaveis recusadas".
export const CONTROLLABLE_SOURCE_METRICS = [
  "sessions_per_week",
  "grind_days",
  "study_minutes_week",
  "study_sessions_count",
  "bankroll_usd",
  "roi_pct",
  "abi",
  "itm_pct",
  // METAS-2 fatia-2 (ADR-234 / RF-02): raiz da meta leak_focus. O statId alvo vem
  // como sufixo (leak_focus_progress:<statId>); a allowlist compara so a raiz.
  "leak_focus_progress",
] as const;
// recusadas explicitamente (RF-04) → lead_not_controllable
export const NON_CONTROLLABLE_SOURCE_METRICS = [
  "profit_short_term",
  "win_a_tournament",
  "beat_specific_player",
] as const;

export const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// medida de direcao (D2) — POST /api/goals (goalKind='measure')
// ADR-241: startDate (inicio) + deadline (prazo) EXPLICITOS e opcionais.
export const createMeasureSchema = z
  .object({
    goalType: z.enum(GOAL_TYPES),
    category: z.enum(GOAL_CATEGORIES),
    title: z.string().min(1).max(120),
    sourceMetric: z.string().min(1).max(48),
    targetValue: z.number(),
    unit: z.enum(GOAL_UNITS),
    cadence: z.enum(GOAL_CADENCES),
    horizon: z.enum(GOAL_HORIZONS),
    direction: z.enum(["up", "down"]).default("up"),
    startDate: YMD.optional(),
    deadline: YMD.optional(),
  })
  .strict();

// WIG (D1) — career_goals + goal_wig_meta
export const createWigSchema = z
  .object({
    goalType: z.enum(["performance", "result"]), // process recusado → wig_must_be_lag (handler)
    category: z.enum(GOAL_CATEGORIES),
    title: z.string().min(1).max(120),
    sourceMetric: z.string().min(1).max(48),
    baselineValue: z.number(),
    targetValue: z.number(),
    unit: z.enum(GOAL_UNITS),
    horizon: z.enum(WIG_HORIZONS),
    startDate: YMD.optional(), // inicio explicito (default createdAt no read)
    targetDeadline: YMD, // handler valida >= +90d → wig_deadline_too_short
  })
  .strict();

// PATCH — baselineValue PROIBIDO (DEC-menor-1). .strict() rejeita chave extra,
// mas o handler tambem checa explicitamente para 400 baseline_immutable nomeado.
export const patchGoalSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    targetValue: z.number().optional(),
    targetDeadline: YMD.optional(),
    startDate: YMD.optional(),
    deadline: YMD.optional(),
    status: z.enum(["active", "achieved", "abandoned", "archived"]).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Relatorio diario do "calendario de metas" (ADR-241).
// 1 row/user/dia. measures_exercised = quais medidas de direcao foram exercidas.
// ---------------------------------------------------------------------------
export const goalDailyLogMeasureSchema = z.object({
  measureId: z.string().min(1).max(48),
  sourceMetric: z.string().max(48).optional(),
  value: z.number().nullable().optional(),
});

// Body do PUT /api/goals/daily-logs/:date — a data vem na URL (param), nao no body.
export const upsertGoalDailyLogSchema = z
  .object({
    measuresExercised: z.array(goalDailyLogMeasureSchema).max(10).optional(),
    note: z.string().max(2000).nullable().optional(),
    tournamentsPlayed: z.number().int().min(0).max(1000).nullable().optional(),
    studyHours: z.number().min(0).max(24).nullable().optional(),
    studyContent: z.string().max(2000).nullable().optional(),
    learning: z.string().max(2000).nullable().optional(),
    didGood: z.string().max(2000).nullable().optional(),
    didBad: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type GoalDailyLogMeasure = z.infer<typeof goalDailyLogMeasureSchema>;
export type UpsertGoalDailyLog = z.infer<typeof upsertGoalDailyLogSchema>;

// SSoT do predicado "dia preenchido" (ADR-241) — usado pelo calendario (cor da
// celula), pelo streak de consistencia e por qualquer agregacao. Evita drift
// entre client e server (antes duplicado em GoalsCalendar.logIsFilled +
// goals.ts:dailyLogIsFilled). Opera na forma camelCase canonica do storage.
export function isDailyLogFilled(log: any): boolean {
  if (!log) return false;
  const me = log.measuresExercised;
  const tp = log.tournamentsPlayed;
  const sh = log.studyHours;
  const txt = (v: any) => typeof v === "string" && v.trim().length > 0;
  return Boolean(
    (Array.isArray(me) && me.length > 0) ||
      txt(log.note) ||
      (tp != null && Number(tp) > 0) ||
      (sh != null && Number(sh) > 0) ||
      txt(log.learning) ||
      txt(log.didGood) ||
      txt(log.didBad),
  );
}

export type GoalType = (typeof GOAL_TYPES)[number];
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type GoalUnit = (typeof GOAL_UNITS)[number];
export type GoalCadence = (typeof GOAL_CADENCES)[number];
export type GoalHorizon = (typeof GOAL_HORIZONS)[number];
export type WigHorizon = (typeof WIG_HORIZONS)[number];
export type GoalStatus = "ahead" | "on_track" | "behind" | "at_risk" | "achieved";
