// =============================================================================
// shared/coach-weekly-review.ts — EST-5 / ADR-226
//
// Fonte unica de verdade da maquina de estados "Weekly Review" (orquestrador,
// handlers HTTP, schema Drizzle/Zod, UI). Espelha shared/coach-planning.ts.
//
//   WEEKLY_REVIEW_STATUSES   — ordem linear da maquina de estados.
//   WeeklyReviewStatus       — type (erased em runtime).
//   VALID_TRANSITIONS        — mapa from -> Set<to> (somente avancar).
//   WeeklyReview             — interface (erased).
//   YMD_REGEX                — validacao de chave de semana.
//   startWeeklyReviewBodySchema — Zod do body { weekStartDate?: YMD }.
// =============================================================================

import { z } from "zod";

export const WEEKLY_REVIEW_STATUSES = [
  "recap_sent",
  "awaiting_upload",
  "upload_confirmed",
  "deep_analysis_done",
  "planning",
] as const;
export type WeeklyReviewStatus = (typeof WEEKLY_REVIEW_STATUSES)[number];

// Maquina de estados linear: somente avancar, nunca pular nem retroceder.
// planning e estado terminal (Set vazio).
export const VALID_TRANSITIONS: Map<WeeklyReviewStatus, Set<WeeklyReviewStatus>> =
  new Map([
    ["recap_sent", new Set<WeeklyReviewStatus>(["awaiting_upload"])],
    ["awaiting_upload", new Set<WeeklyReviewStatus>(["upload_confirmed"])],
    ["upload_confirmed", new Set<WeeklyReviewStatus>(["deep_analysis_done"])],
    ["deep_analysis_done", new Set<WeeklyReviewStatus>(["planning"])],
    ["planning", new Set<WeeklyReviewStatus>()],
  ]);

export const UPLOAD_SOURCES = ["explicit", "recent_import"] as const;
export type UploadSource = (typeof UPLOAD_SOURCES)[number];

export interface WeeklyReview {
  id: string;
  userId: string;
  weekStartDate: string; // YYYY-MM-DD UTC (semana corrente)
  status: WeeklyReviewStatus;
  recapContent: any | null;
  analysisContent: any | null;
  uploadSource: UploadSource | null;
  planningSessionId: string | null;
  chatSessionId: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const startWeeklyReviewBodySchema = z.object({
  weekStartDate: z.string().regex(YMD_REGEX).optional(), // default = nextMondayUtc()
});
