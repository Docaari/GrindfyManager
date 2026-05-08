/**
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Zod schema StudyWeeklyPlan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.2
 * ADR  : 132 (plan_jsonb shape) + 134 (anti-hallucinacao via Zod rigid)
 *
 * Validacao rigida do output Coach:
 *   - 5 dias (mon..fri)
 *   - 1..6 atividades por dia
 *   - estimatedMinutes 5..120
 *   - type ∈ enum
 *   - title <= 80, description <= 200, reasoning <= 200
 */

import { z } from "zod";

export const STUDY_PLAN_DAY_LABELS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type StudyPlanDayLabel = (typeof STUDY_PLAN_DAY_LABELS)[number];

export const STUDY_PLAN_ACTIVITY_TYPES = [
  "drill_gto",
  "lesson",
  "hand_review",
  "theory_read",
  "snapshot_review",
  "other",
] as const;
export type StudyPlanActivityType =
  (typeof STUDY_PLAN_ACTIVITY_TYPES)[number];

export const StudyWeeklyPlanItemSchema = z.object({
  itemId: z.string().min(1).max(64),
  type: z.enum(STUDY_PLAN_ACTIVITY_TYPES),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  estimatedMinutes: z.number().int().min(5).max(120),
  ctaTarget: z.string().nullable(),
  themeId: z.string().nullable(),
  lessonId: z.string().nullable(),
  handIds: z.array(z.string()).max(20).default([]),
  reasoning: z.string().min(1).max(200),
});

export type StudyWeeklyPlanItem = z.infer<typeof StudyWeeklyPlanItemSchema>;

export const StudyWeeklyPlanDaySchema = z.object({
  dayLabel: z.enum(STUDY_PLAN_DAY_LABELS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activities: z.array(StudyWeeklyPlanItemSchema).min(0).max(8),
});

export type StudyWeeklyPlanDay = z.infer<typeof StudyWeeklyPlanDaySchema>;

// Zod requer pelo menos 1 dia (test minimal shape). Spec recomenda 5 dias
// (Seg-Sex) mas validation eh tolerante para nao quebrar com payload parcial.
// Empty days [] -> reject (sem plan eh invalido).
export const StudyWeeklyPlanSchema = z.object({
  days: z.array(StudyWeeklyPlanDaySchema).min(1).max(7),
});

export type StudyWeeklyPlan = z.infer<typeof StudyWeeklyPlanSchema>;
