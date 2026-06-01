// =============================================================================
// weeklyPlanningStorage — EST-6 (ADR-224) — weekly_planning_sessions CRUD +
// delete-then-insert helper de coach_lesson_recommendations por chave BRT.
//
// Attach-pattern: importado por server/storage.ts (no fim) que chama
// attachWeeklyPlanningStorage(storage). Mantido fora do storage.ts gigante.
//
// Idempotencia: createWeeklyPlanningSession faz INSERT ON CONFLICT DO NOTHING
// pela UNIQUE (user_id, week_start_date) e re-le a existente em conflito —
// reabrir a mesma semana retorna a sessao com os passos preservados.
//
// Lessons: #34 (composicao) — os metodos sao chamados via injectedStorage nos
// testes; aqui ficam as queries reais para producao.
// =============================================================================

import { db } from "../db";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import {
  weeklyPlanningSessions,
  coachLessonRecommendations,
  users,
} from "@shared/schema";

function rowToSession(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    weekStartDate:
      typeof row.weekStartDate === "string"
        ? row.weekStartDate
        : row.weekStartDate, // pg date -> string YYYY-MM-DD
    status: row.status,
    source: row.source,
    steps: row.steps ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function attachWeeklyPlanningStorage(storage: any): void {
  // Resolve um user por userPlatformId (USER-XXXX). Usado pelo orquestrador
  // para alimentar getReportTier. reportEligibility ja referenciava este metodo
  // via optional chaining — aqui ele passa a existir de fato.
  storage.getUserByPlatformId = async (
    userPlatformId: string,
  ): Promise<any | null> => {
    try {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.userPlatformId, userPlatformId))
        .limit(1);
      return row ?? null;
    } catch (err) {
      console.error("storage.getUserByPlatformId.error", { userPlatformId, err });
      return null;
    }
  };

  storage.createWeeklyPlanningSession = async (input: {
    userId: string;
    weekStartDate: string;
    status?: string;
    steps?: any;
    source?: string;
  }): Promise<any> => {
    const id = nanoid();
    try {
      const values: any = {
        id,
        userId: input.userId,
        weekStartDate: input.weekStartDate,
        status: input.status ?? "in_progress",
        steps: input.steps ?? {},
        source: input.source ?? "coach_manual",
      };
      const rows = await (db.insert(weeklyPlanningSessions).values(values) as any)
        .onConflictDoNothing({
          target: [
            weeklyPlanningSessions.userId,
            weeklyPlanningSessions.weekStartDate,
          ],
        })
        .returning();
      const inserted = (rows as any[])?.[0];
      if (inserted) return rowToSession(inserted);
      // Conflito UNIQUE -> retorna a existente (idempotencia).
      let existing = await storage.getWeeklyPlanningSession(
        input.userId,
        input.weekStartDate,
      );
      // Sob race a re-leitura pode vir null mesmo a row existindo (DO NOTHING
      // garante que a row existe por definicao). 1 retry curto da leitura.
      if (!existing) {
        existing = await storage.getWeeklyPlanningSession(
          input.userId,
          input.weekStartDate,
        );
      }
      return existing;
    } catch (err) {
      console.error("storage.createWeeklyPlanningSession.error", {
        userId: input.userId,
        weekStartDate: input.weekStartDate,
        err,
      });
      throw err;
    }
  };

  storage.getWeeklyPlanningSession = async (
    userId: string,
    weekStartDate: string,
  ): Promise<any | null> => {
    try {
      const [row] = await db
        .select()
        .from(weeklyPlanningSessions)
        .where(
          and(
            eq(weeklyPlanningSessions.userId, userId),
            eq(weeklyPlanningSessions.weekStartDate, weekStartDate),
          ),
        )
        .limit(1);
      return rowToSession(row);
    } catch (err) {
      console.error("storage.getWeeklyPlanningSession.error", {
        userId,
        weekStartDate,
        err,
      });
      return null;
    }
  };

  storage.updateWeeklyPlanningSession = async (
    id: string,
    patch: { status?: string; steps?: any },
  ): Promise<any | null> => {
    try {
      const set: any = { updatedAt: new Date() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.steps !== undefined) set.steps = patch.steps;
      const rows = await db
        .update(weeklyPlanningSessions)
        .set(set)
        .where(eq(weeklyPlanningSessions.id, id))
        .returning();
      return rowToSession((rows as any[])?.[0]);
    } catch (err) {
      console.error("storage.updateWeeklyPlanningSession.error", { id, err });
      throw err;
    }
  };

  // EST-6 RF-04 — delete-then-insert das recs da semana BRT antes de re-inserir
  // o conjunto confirmado (re-recomendar nao acumula). source opcional restringe
  // o delete ao conjunto gravado pelo planning (coach_manual).
  storage.deleteCoachRecommendationsForWeek = async (
    userId: string,
    weekStartDateBrt: string,
    source?: string,
  ): Promise<void> => {
    try {
      const where = and(
        eq(coachLessonRecommendations.userId, userId),
        eq(coachLessonRecommendations.weekStartDate, weekStartDateBrt),
        ...(source !== undefined
          ? [eq(coachLessonRecommendations.source, source)]
          : []),
      );
      await db.delete(coachLessonRecommendations).where(where);
    } catch (err) {
      console.error("storage.deleteCoachRecommendationsForWeek.error", {
        userId,
        weekStartDateBrt,
        err,
      });
      throw err;
    }
  };
}
