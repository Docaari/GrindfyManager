// =============================================================================
// goalDailyLogsStorage — relatorio diario do calendario de metas (ADR-241)
//
// Attach-pattern (mesmo de goalsStorage): server/storage.ts chama
// attachGoalDailyLogsStorage(storage). Tabela goal_daily_logs lida via drizzle
// real (lazy + fallback placeholder #36). Todos os helpers aceitam injectedDb?
// como ultimo arg (#34). UPSERT idempotente ON CONFLICT (user_id, log_date).
// =============================================================================

import { nanoid } from "nanoid";

type AnyTable = any;

let _tables: Record<string, AnyTable> | null = null;
async function getTables(): Promise<Record<string, AnyTable>> {
  if (_tables) return _tables;
  let mod: any = {};
  try {
    mod = await import("@shared/schema");
  } catch {
    mod = {};
  }
  _tables = {
    goalDailyLogs:
      mod.goalDailyLogs ?? {
        id: "goal_daily_logs.id",
        userId: "goal_daily_logs.user_id",
        logDate: "goal_daily_logs.log_date",
      },
  };
  return _tables;
}

async function resolveDb(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../db");
  return mod.db;
}

async function loadDrizzleOps(): Promise<any> {
  try {
    return await import("drizzle-orm");
  } catch {
    return {};
  }
}

function firstRow(rows: any): any {
  if (Array.isArray(rows)) return rows[0] ?? null;
  return rows ?? null;
}

// Campos editaveis pelo upsert (a data vem na URL, nunca no payload). Mantemos
// undefined fora do SET para nao sobrescrever com null o que o caller nao mandou.
const EDITABLE_FIELDS = [
  "measuresExercised",
  "note",
  "tournamentsPlayed",
  "studyHours",
  "studyContent",
  "learning",
  "didGood",
  "didBad",
] as const;

export function attachGoalDailyLogsStorage(storage: any): void {
  // UPSERT ON CONFLICT (user_id, log_date) DO UPDATE — idempotente.
  storage.upsertGoalDailyLog = async (
    userId: string,
    logDate: string,
    payload: any,
    injectedDb?: any,
  ): Promise<any> => {
    const db = await resolveDb(injectedDb);
    const { goalDailyLogs } = await getTables();

    const row: any = {
      id: nanoid(),
      userId,
      logDate,
      measuresExercised: payload?.measuresExercised ?? [],
      note: payload?.note ?? null,
      tournamentsPlayed: payload?.tournamentsPlayed ?? null,
      studyHours: payload?.studyHours ?? null,
      studyContent: payload?.studyContent ?? null,
      learning: payload?.learning ?? null,
      didGood: payload?.didGood ?? null,
      didBad: payload?.didBad ?? null,
    };

    // SET so com o que veio no payload (undefined preserva valor existente).
    const set: any = { updatedAt: new Date() };
    for (const f of EDITABLE_FIELDS) {
      if (payload?.[f] !== undefined) set[f] = payload[f];
    }

    const inserted = await db
      .insert(goalDailyLogs)
      .values(row)
      .onConflictDoUpdate({
        target: [goalDailyLogs.userId, goalDailyLogs.logDate],
        set,
      })
      .returning();
    return firstRow(inserted) ?? row;
  };

  storage.getGoalDailyLog = async (
    userId: string,
    logDate: string,
    injectedDb?: any,
  ): Promise<any | null> => {
    const db = await resolveDb(injectedDb);
    const { goalDailyLogs } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goalDailyLogs)
        .where(and(eq(goalDailyLogs.userId, userId), eq(goalDailyLogs.logDate, logDate)))
        .limit(1);
      return firstRow(rows);
    } catch (err) {
      console.error("goalDailyLogsStorage.getGoalDailyLog.error", { userId, logDate, err });
      return null;
    }
  };

  // Logs num range [from, to] (inclusive) — alimenta o mes do calendario.
  storage.listGoalDailyLogsInRange = async (
    userId: string,
    fromDate: string,
    toDate: string,
    injectedDb?: any,
  ): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    const { goalDailyLogs } = await getTables();
    const { eq, and, gte, lte } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goalDailyLogs)
        .where(
          and(
            eq(goalDailyLogs.userId, userId),
            gte(goalDailyLogs.logDate, fromDate),
            lte(goalDailyLogs.logDate, toDate),
          ),
        );
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error("goalDailyLogsStorage.listGoalDailyLogsInRange.error", {
        userId,
        fromDate,
        toDate,
        err,
      });
      return [];
    }
  };
}
