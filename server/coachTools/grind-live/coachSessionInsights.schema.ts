/**
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Zod schema SessionInsights.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.2
 * ADR  : 133 + 134 (anti-hallucinacao)
 *
 * Validacao rigida do output Coach pos-sessao /grind-live.
 */

import { z } from "zod";

export const HAND_BADGES = [
  "big_pot",
  "tilted",
  "gto_deviation",
  "icm_critical",
] as const;
export type HandBadge = (typeof HAND_BADGES)[number];

export const TopHandSchema = z.object({
  handId: z.string().min(1),
  title: z.string().min(1).max(80),
  rationale: z.string().min(1).max(200),
  action: z.enum(["review", "study"]),
  ctaUrl: z.string().min(1),
  handBadge: z.enum(HAND_BADGES).optional(),
});

export type TopHand = z.infer<typeof TopHandSchema>;

export const SuggestedLessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().min(1).max(80),
  courseSlug: z.string().min(1),
  lessonSlug: z.string().min(1),
  rationale: z.string().min(1).max(150),
  durationSeconds: z.number().int().min(0),
});

export const SpotToReviewSchema = z.object({
  spotId: z.string().min(1),
  label: z.string().min(1).max(120),
  suggestedAction: z.enum(["add_insight", "link_theme", "review_later"]),
});

export const FocusStatHighlightSchema = z.object({
  statId: z.string().min(1),
  statName: z.string().min(1).max(80),
  occurredCount: z.number().int().min(0),
  rationale: z.string().min(1).max(200),
});

export const SessionInsightsSchema = z.object({
  summary: z.string().min(1).max(200),
  topHands: z.array(TopHandSchema).max(3),
  suggestedLessons: z.array(SuggestedLessonSchema).max(2),
  spotsToReview: z.array(SpotToReviewSchema).max(20),
  focusStatsHighlight: z.array(FocusStatHighlightSchema).max(3),
});

export type SessionInsights = z.infer<typeof SessionInsightsSchema>;
