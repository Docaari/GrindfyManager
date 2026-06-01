// =============================================================================
// shared/coach-planning.ts — EST-6 / ADR-224
//
// Tipos + Zod compartilhados do Next-Week Planning Flow (orquestrador, handlers
// HTTP, schema Drizzle/Zod, UI wizard). Fonte unica de verdade do shape de
// `steps` jsonb + dos request schemas dos endpoints.
// =============================================================================

import { z } from "zod";

export const PLANNING_STEP_KEYS = ["grind", "study", "lessons", "themes"] as const;
export type PlanningStepKey = (typeof PLANNING_STEP_KEYS)[number];

export const PLANNING_STEP_STATUSES = [
  "pending",
  "proposed",
  "confirmed",
  "skipped",
] as const;
export type PlanningStepStatus = (typeof PLANNING_STEP_STATUSES)[number];

export const PLANNING_SESSION_STATUSES = [
  "in_progress",
  "completed",
  "abandoned",
] as const;
export type PlanningSessionStatus = (typeof PLANNING_SESSION_STATUSES)[number];

export const PLANNING_SOURCES = ["coach_manual", "est5_ritual"] as const;
export type PlanningSource = (typeof PLANNING_SOURCES)[number];

// --- Estado por passo --------------------------------------------------------
const baseStep = z.object({
  status: z.enum(PLANNING_STEP_STATUSES),
  proposedAt: z.string().nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
});

export const grindStepSchema = baseStep.extend({
  createdIds: z.array(z.string()).optional(), // planned_tournaments ids (executeConfirmed)
  offDays: z.array(z.string()).optional(), // YYYY-MM-DD marcados via mark_off_day
});

export const studyStepSchema = baseStep.extend({
  sessionIds: z.array(z.string()).optional(), // study_sessions_v2 ids (status=planned)
  weeklyPlanSynced: z.boolean().optional(), // UPSERT study_weekly_plans feito
});

export const lessonsStepSchema = baseStep.extend({
  lessonIds: z.array(z.string()).optional(), // lessonId confirmados (whitelist curated)
  recIds: z.array(z.string()).optional(), // coach_lesson_recommendations ids gravados
  // hidratado pela UI/handler GET com os dados de aula (courseSlug/lessonSlug)
  lessons: z
    .array(
      z.object({
        id: z.string(),
        courseSlug: z.string().optional(),
        lessonSlug: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .optional(),
});

export const themesStepSchema = baseStep.extend({
  focus: z
    .array(
      z.object({
        statId: z.string(),
        statName: z.string(),
        severity: z.string().optional(),
        source: z.enum(["leaks", "focus_stats", "fallback"]).optional(),
      }),
    )
    .optional(),
});

export const planningStepsSchema = z.object({
  grind: grindStepSchema,
  study: studyStepSchema,
  lessons: lessonsStepSchema,
  themes: themesStepSchema,
});
export type PlanningSteps = z.infer<typeof planningStepsSchema>;

// Estado inicial: 4 passos pending. Objetos independentes a cada chamada (sem
// alias compartilhado — orchestrator test cobre isolamento).
export function initialPlanningSteps(): PlanningSteps {
  return {
    grind: { status: "pending" },
    study: { status: "pending" },
    lessons: { status: "pending" },
    themes: { status: "pending" },
  };
}

// --- Request schemas (endpoints) ---------------------------------------------
export const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const startPlanningBodySchema = z.object({
  weekStartDate: z.string().regex(YMD_REGEX).optional(), // default = nextMondayUtc()
  source: z.enum(PLANNING_SOURCES).optional().default("coach_manual"),
});

export const stepParamSchema = z.enum(PLANNING_STEP_KEYS);

// propose/confirm aceitam payload livre por passo (validado pelo tool no confirm).
export const proposeStepBodySchema = z.object({}).passthrough();
export const confirmStepBodySchema = z.object({}).passthrough();

export interface WeeklyPlanningSession {
  id: string;
  userId: string;
  weekStartDate: string; // YYYY-MM-DD UTC
  status: PlanningSessionStatus;
  source: PlanningSource;
  steps: PlanningSteps;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
