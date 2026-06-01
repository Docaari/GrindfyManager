// =============================================================================
// weeklyReviewStorage — EST-5 (ADR-226) — weekly_reviews CRUD.
//
// Attach-pattern: importado por server/storage.ts (no fim) que chama
// attachWeeklyReviewStorage(storage). Espelha weeklyPlanningStorage.
//
// Idempotencia: createWeeklyReview faz INSERT ON CONFLICT DO NOTHING pela UNIQUE
// (user_id, week_start_date) e re-le a existente em conflito — reabrir a mesma
// semana retorna a review com o status preservado.
//
// Lessons: #34 (composicao) — os metodos sao chamados via injectedStorage nos
// testes; aqui ficam as queries reais para producao.
// =============================================================================

import { db } from "../db";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { weeklyReviews } from "@shared/schema";

function rowToReview(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    weekStartDate:
      typeof row.weekStartDate === "string" ? row.weekStartDate : row.weekStartDate,
    status: row.status,
    recapContent: row.recapContent ?? null,
    analysisContent: row.analysisContent ?? null,
    uploadSource: row.uploadSource ?? null,
    planningSessionId: row.planningSessionId ?? null,
    chatSessionId: row.chatSessionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function attachWeeklyReviewStorage(storage: any): void {
  storage.createWeeklyReview = async (input: {
    userId: string;
    weekStartDate: string;
    status?: string;
    recapContent?: any;
    analysisContent?: any;
    uploadSource?: string | null;
    planningSessionId?: string | null;
    chatSessionId?: string | null;
  }): Promise<any> => {
    const id = nanoid();
    try {
      const values: any = {
        id,
        userId: input.userId,
        weekStartDate: input.weekStartDate,
        status: input.status ?? "recap_sent",
        recapContent: input.recapContent ?? null,
        analysisContent: input.analysisContent ?? null,
        uploadSource: input.uploadSource ?? null,
        planningSessionId: input.planningSessionId ?? null,
        chatSessionId: input.chatSessionId ?? null,
      };
      const rows = await (db.insert(weeklyReviews).values(values) as any)
        .onConflictDoNothing({
          target: [weeklyReviews.userId, weeklyReviews.weekStartDate],
        })
        .returning();
      const inserted = (rows as any[])?.[0];
      if (inserted) return rowToReview(inserted);
      // Conflito UNIQUE -> retorna a existente (idempotencia).
      let existing = await storage.getWeeklyReview(input.userId, input.weekStartDate);
      // Sob race a re-leitura pode vir null mesmo a row existindo. 1 retry curto.
      if (!existing) {
        existing = await storage.getWeeklyReview(input.userId, input.weekStartDate);
      }
      return existing;
    } catch (err) {
      console.error("storage.createWeeklyReview.error", {
        userId: input.userId,
        weekStartDate: input.weekStartDate,
        err,
      });
      throw err;
    }
  };

  storage.getWeeklyReview = async (
    userId: string,
    weekStartDate: string,
  ): Promise<any | null> => {
    try {
      const [row] = await db
        .select()
        .from(weeklyReviews)
        .where(
          and(
            eq(weeklyReviews.userId, userId),
            eq(weeklyReviews.weekStartDate, weekStartDate),
          ),
        )
        .limit(1);
      return rowToReview(row);
    } catch (err) {
      console.error("storage.getWeeklyReview.error", { userId, weekStartDate, err });
      return null;
    }
  };

  storage.updateWeeklyReview = async (
    id: string,
    patch: {
      status?: string;
      recapContent?: any;
      analysisContent?: any;
      uploadSource?: string | null;
      planningSessionId?: string | null;
      chatSessionId?: string | null;
    },
  ): Promise<any | null> => {
    try {
      const set: any = { updatedAt: new Date() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.recapContent !== undefined) set.recapContent = patch.recapContent;
      if (patch.analysisContent !== undefined) set.analysisContent = patch.analysisContent;
      if (patch.uploadSource !== undefined) set.uploadSource = patch.uploadSource;
      if (patch.planningSessionId !== undefined)
        set.planningSessionId = patch.planningSessionId;
      if (patch.chatSessionId !== undefined) set.chatSessionId = patch.chatSessionId;
      const rows = await db
        .update(weeklyReviews)
        .set(set)
        .where(eq(weeklyReviews.id, id))
        .returning();
      return rowToReview((rows as any[])?.[0]);
    } catch (err) {
      console.error("storage.updateWeeklyReview.error", { id, err });
      throw err;
    }
  };
}
