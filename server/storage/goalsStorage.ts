// =============================================================================
// goalsStorage — Ferramenta de Metas 4DX fatia-1 (ADR-229)
//
// Attach-pattern: importado por server/storage.ts (no fim) que chama
// attachGoalsStorage(storage). Tabelas goals/goal_wig_meta/goal_links/
// goal_progress_snapshots lidas via drizzle real (lazy + fallback placeholder
// #36). career_goals NAO esta no drizzle -> lida/escrita via lazy import +
// placeholder (R2/R3); a Metas escreve nela com a tabela real quando disponivel.
//
// Lessons:
//   #34 — todos os helpers aceitam injectedDb? como ultimo arg.
//   #36 — @shared/schema lazy + fallback placeholder.
//   #32 — db.transaction usado quando disponivel; fallback gentil quando nao.
//   #3  — shape REAL do drizzle (insert/values/returning; select/from/where/limit).
// =============================================================================

import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { num } from "../coach/goals/num";

type AnyTable = any;

// ---------------------------------------------------------------------------
// Lazy table resolvers (#36) — placeholder leve quando @shared/schema mockado.
// ---------------------------------------------------------------------------
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
    goals: mod.goals ?? { id: "goals.id", userId: "goals.user_id", status: "goals.status", goalKind: "goals.goal_kind" },
    goalWigMeta:
      mod.goalWigMeta ?? { careerGoalId: "goal_wig_meta.career_goal_id", userId: "goal_wig_meta.user_id" },
    goalLinks: mod.goalLinks ?? { id: "goal_links.id", wigCareerGoalId: "goal_links.wig_career_goal_id", measureId: "goal_links.measure_id" },
    goalProgressSnapshots:
      mod.goalProgressSnapshots ??
      { id: "goal_progress_snapshots.id", goalRefId: "goal_progress_snapshots.goal_ref_id", weekStartDate: "goal_progress_snapshots.week_start_date", userId: "goal_progress_snapshots.user_id" },
    careerGoals: mod.careerGoals ?? mod.career_goals ?? { id: "career_goals.id", userId: "career_goals.user_id", status: "career_goals.status" },
    users: mod.users ?? { userPlatformId: "users.user_platform_id" },
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

class BaselineImmutableError extends Error {
  code = "baseline_immutable";
  constructor(message = "baseline_immutable") {
    super(message);
    this.name = "BaselineImmutableError";
  }
}

// horizon 4DX -> career_goals enum (DEC-A6-impl). quarter->trimestre, season->ano.
function horizon4dxToCareerEnum(horizon: string): string {
  if (horizon === "quarter") return "trimestre";
  if (horizon === "season") return "ano";
  return "trimestre"; // default conservador
}

// sourceMetric 4DX -> career_goals.target_metric enum (ou 'custom').
const CAREER_TARGET_METRIC_ENUM = new Set([
  "profit_usd",
  "tournaments_count",
  "roi_pct",
  "bankroll_usd",
  "custom",
]);
function sourceMetricToCareerEnum(sourceMetric?: string): string {
  if (sourceMetric && CAREER_TARGET_METRIC_ENUM.has(sourceMetric)) return sourceMetric;
  return "custom";
}

function firstRow(rows: any): any {
  if (Array.isArray(rows)) return rows[0] ?? null;
  return rows ?? null;
}

// db.execute(sql`...`) -> array de rows. O driver pg entrega { rows: [...] };
// alguns mocks/drivers entregam o array direto. Cobre ambos.
function execRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// Normaliza a row crua (snake_case do pg, JOIN career_goals + goal_wig_meta)
// para um objeto PLANO com as chaves que o consumidor (scoreboard) espera
// direto no topo (HIGH-2). NUNCA aninha por tabela.
function normalizeWigRow(r: any): any | null {
  if (!r) return null;
  return {
    careerGoalId: r.career_goal_id ?? r.careerGoalId ?? r.id,
    userId: r.user_id ?? r.userId,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    baselineValue: r.baseline_value ?? r.baselineValue ?? null,
    targetValue: r.target_value_4dx ?? r.targetValue4dx ?? r.target_value ?? r.targetValue ?? null,
    sourceMetric: r.source_metric ?? r.sourceMetric ?? null,
    unit: r.unit ?? null,
    horizon: r.horizon_4dx ?? r.horizon4dx ?? r.horizon ?? null,
    targetDeadline: r.target_deadline ?? r.targetDeadline ?? null,
    createdAt: r.created_at ?? r.createdAt ?? null,
  };
}

function countFromRows(rows: any): number {
  const row = firstRow(rows);
  if (!row) return 0;
  return num((row as any).count);
}

export function attachGoalsStorage(storage: any): void {
  // -------------------------------------------------------------------------
  // goals (medidas de direcao)
  // -------------------------------------------------------------------------
  storage.createGoal = async (input: any, injectedDb?: any): Promise<any> => {
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const row: any = {
      id: nanoid(),
      userId: input.userId,
      goalKind: input.goalKind ?? "measure",
      goalType: input.goalType,
      category: input.category,
      title: input.title,
      sourceMetric: input.sourceMetric ?? null,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
      cadence: input.cadence ?? null,
      direction: input.direction ?? "up",
      horizon: input.horizon,
      status: input.status ?? "active",
      origin: input.origin ?? "manual",
    };
    const inserted = await db.insert(goals).values(row).returning();
    return firstRow(inserted) ?? row;
  };

  storage.getGoal = async (userId: string, goalId: string, injectedDb?: any): Promise<any | null> => {
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goals)
        .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
        .limit(1);
      return firstRow(rows);
    } catch (err) {
      console.error("goalsStorage.getGoal.error", { userId, goalId, err });
      return null;
    }
  };

  storage.listGoals = async (
    userId: string,
    opts?: { status?: string },
    injectedDb?: any,
  ): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const conds = [eq(goals.userId, userId)];
      if (opts?.status) conds.push(eq(goals.status, opts.status));
      const rows = await db
        .select()
        .from(goals)
        .where(and(...conds));
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error("goalsStorage.listGoals.error", { userId, err });
      return [];
    }
  };

  storage.updateGoal = async (
    userId: string,
    goalId: string,
    patch: any,
    injectedDb?: any,
  ): Promise<any | null> => {
    if (patch && (patch.baselineValue !== undefined || patch.baseline_value !== undefined)) {
      throw new BaselineImmutableError();
    }
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    const set: any = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.targetValue !== undefined) set.targetValue = patch.targetValue;
    if (patch.targetDeadline !== undefined) set.targetDeadline = patch.targetDeadline;
    if (patch.status !== undefined) set.status = patch.status;
    const rows = await db
      .update(goals)
      .set(set)
      .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
      .returning();
    return firstRow(rows);
  };

  storage.archiveGoal = async (userId: string, goalId: string, injectedDb?: any): Promise<void> => {
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    await db
      .update(goals)
      .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
      .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
      .returning();
  };

  storage.countActiveMeasures = async (userId: string, injectedDb?: any): Promise<number> => {
    const db = await resolveDb(injectedDb);
    const { goals } = await getTables();
    const { eq, and, sql } = await loadDrizzleOps();
    try {
      const rows = await db
        .select({ count: sql`count(*)` })
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            eq(goals.goalKind, "measure"),
            eq(goals.status, "active"),
          ),
        );
      return countFromRows(rows);
    } catch (err) {
      console.error("goalsStorage.countActiveMeasures.error", { userId, err });
      return 0;
    }
  };

  // -------------------------------------------------------------------------
  // WIG (career_goals + goal_wig_meta)
  // -------------------------------------------------------------------------
  storage.createWig = async (userId: string, input: any, injectedDb?: any): Promise<any> => {
    const db = await resolveDb(injectedDb);
    const { goalWigMeta } = await getTables();
    const careerGoalId = nanoid();

    // career_goals NAO esta no drizzle (R1) -> INSERT via RAW SQL parametrizado.
    const careerStatus = input.status ?? "active"; // fatia-1 nasce active (sem fluxo draft).
    const targetMetric = sourceMetricToCareerEnum(input.sourceMetric);
    const careerHorizon = horizon4dxToCareerEnum(input.horizon);
    const targetValue = input.targetValue ?? null;
    const targetDeadline = input.targetDeadline ?? null;
    const description = input.description ?? null;

    const wigMetaRow: any = {
      careerGoalId,
      userId,
      baselineValue: input.baselineValue,
      targetValue4dx: input.targetValue ?? null,
      sourceMetric: input.sourceMetric ?? null,
      unit: input.unit ?? null,
      horizon4dx: input.horizon,
      wigRole: input.wigRole ?? null,
      coachToneAtCreate: input.coachToneAtCreate ?? null,
      origin: input.origin ?? "manual",
    };

    const runner = async (tx: any) => {
      await tx.execute(sql`
        INSERT INTO career_goals
          (id, user_id, title, description, target_metric, target_value, target_deadline, horizon, status, created_at, updated_at)
        VALUES
          (${careerGoalId}, ${userId}, ${input.title}, ${description}, ${targetMetric}, ${targetValue}, ${targetDeadline}, ${careerHorizon}, ${careerStatus}, NOW(), NOW())
      ` as any);
      await tx.insert(goalWigMeta).values(wigMetaRow).returning();
    };

    if (db && typeof db.transaction === "function") {
      await db.transaction(runner);
    } else {
      await runner(db);
    }

    return {
      careerGoalId,
      userId,
      status: careerStatus,
      title: input.title,
      baselineValue: wigMetaRow.baselineValue,
      targetValue: input.targetValue ?? null,
      sourceMetric: input.sourceMetric ?? null,
      unit: input.unit ?? null,
      horizon: input.horizon,
    };
  };

  // career_goals NAO esta no drizzle (R1) -> LE via RAW SQL (JOIN goal_wig_meta)
  // e RETORNA OBJETO PLANO normalizado (HIGH-2).
  storage.getWig = async (
    userId: string,
    careerGoalId: string,
    injectedDb?: any,
  ): Promise<any | null> => {
    const db = await resolveDb(injectedDb);
    try {
      const result = await db.execute(sql`
        SELECT cg.*, m.baseline_value, m.target_value_4dx, m.source_metric, m.unit, m.horizon_4dx
        FROM career_goals cg
        JOIN goal_wig_meta m ON m.career_goal_id = cg.id
        WHERE cg.user_id = ${userId} AND cg.id = ${careerGoalId}
        LIMIT 1
      ` as any);
      return normalizeWigRow(firstRow(execRows(result)));
    } catch (err) {
      console.error("goalsStorage.getWig.error", { userId, careerGoalId, err });
      return null;
    }
  };

  storage.listActiveWigs = async (userId: string, injectedDb?: any): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    try {
      const result = await db.execute(sql`
        SELECT cg.*, m.baseline_value, m.target_value_4dx, m.source_metric, m.unit, m.horizon_4dx
        FROM career_goals cg
        JOIN goal_wig_meta m ON m.career_goal_id = cg.id
        WHERE cg.user_id = ${userId} AND cg.status = 'active'
      ` as any);
      return execRows(result).map(normalizeWigRow).filter(Boolean);
    } catch (err) {
      console.error("goalsStorage.listActiveWigs.error", { userId, err });
      return [];
    }
  };

  storage.countActiveWigs = async (userId: string, injectedDb?: any): Promise<number> => {
    const db = await resolveDb(injectedDb);
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) AS count
        FROM career_goals cg
        JOIN goal_wig_meta m ON m.career_goal_id = cg.id
        WHERE cg.user_id = ${userId} AND cg.status = 'active'
      ` as any);
      return countFromRows(execRows(result));
    } catch (err) {
      console.error("goalsStorage.countActiveWigs.error", { userId, err });
      return 0;
    }
  };

  storage.updateWig = async (
    userId: string,
    careerGoalId: string,
    patch: any,
    injectedDb?: any,
  ): Promise<any | null> => {
    if (patch && (patch.baselineValue !== undefined || patch.baseline_value !== undefined)) {
      throw new BaselineImmutableError();
    }
    const db = await resolveDb(injectedDb);
    // career_goals NAO esta no drizzle (R1) -> UPDATE via RAW SQL parametrizado.
    // SET dinamico via fragmentos sql; updated_at sempre tocado.
    const sets: any[] = [sql`updated_at = NOW()`];
    if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`);
    if (patch.targetValue !== undefined) sets.push(sql`target_value = ${patch.targetValue}`);
    if (patch.targetDeadline !== undefined) sets.push(sql`target_deadline = ${patch.targetDeadline}`);
    if (patch.status !== undefined) sets.push(sql`status = ${patch.status}`);
    const result = await db.execute(sql`
      UPDATE career_goals
      SET ${sql.join(sets, sql`, `)}
      WHERE user_id = ${userId} AND id = ${careerGoalId}
      RETURNING *
    ` as any);
    return normalizeWigRow(firstRow(execRows(result)));
  };

  // -------------------------------------------------------------------------
  // goal_links (N:N) — idempotente ON CONFLICT DO NOTHING (DEC-menor-2)
  // -------------------------------------------------------------------------
  storage.linkMeasure = async (
    userId: string,
    wigCareerGoalId: string,
    measureId: string,
    injectedDb?: any,
  ): Promise<any> => {
    const db = await resolveDb(injectedDb);
    const { goalLinks } = await getTables();

    const linkRow: any = { id: nanoid(), userId, wigCareerGoalId, measureId };

    const runner = async (tx: any) => {
      const inserted = await tx
        .insert(goalLinks)
        .values(linkRow)
        .onConflictDoNothing()
        .returning();
      // WIG -> active ao ganhar a 1a medida vinculada (HIGH-1) via RAW SQL
      // (career_goals nao esta no drizzle). Best-effort: nao bloqueia o link
      // idempotente, mas LOGA antes de engolir (lesson #9 — nao swallow silencioso).
      try {
        await tx.execute(sql`
          UPDATE career_goals
          SET status = 'active', updated_at = NOW()
          WHERE user_id = ${userId} AND id = ${wigCareerGoalId}
        ` as any);
      } catch (err) {
        console.error("goalsStorage.linkMeasure.activateWig.error", {
          userId,
          wigCareerGoalId,
          measureId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return firstRow(inserted) ?? linkRow;
    };

    if (db && typeof db.transaction === "function") {
      return await db.transaction(runner);
    }
    return await runner(db);
  };

  storage.getMeasuresForWig = async (
    userId: string,
    wigCareerGoalId: string,
    injectedDb?: any,
  ): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    const { goals, goalLinks } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goalLinks)
        .innerJoin(goals, eq(goalLinks.measureId, goals.id))
        .where(and(eq(goalLinks.userId, userId), eq(goalLinks.wigCareerGoalId, wigCareerGoalId)));
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error("goalsStorage.getMeasuresForWig.error", { userId, wigCareerGoalId, err });
      return [];
    }
  };

  // -------------------------------------------------------------------------
  // snapshots — UPSERT ON CONFLICT (goal_ref_id, week_start_date) DO UPDATE
  // -------------------------------------------------------------------------
  storage.upsertGoalSnapshot = async (input: any, injectedDb?: any): Promise<any> => {
    const db = await resolveDb(injectedDb);
    const { goalProgressSnapshots } = await getTables();
    const row: any = {
      id: nanoid(),
      userId: input.userId,
      goalRefId: input.goalRefId,
      goalKind: input.goalKind,
      weekStartDate: input.weekStartDate, // chave UTC tal qual recebida (NUNCA reescrever BRT)
      currentValue: input.currentValue ?? null,
      expectedValue: input.expectedValue ?? null,
      compliancePct: input.compliancePct ?? null,
      streakDays: input.streakDays ?? 0,
      status: input.status ?? null,
      dataSufficiency: input.dataSufficiency ?? "ok",
    };
    const set: any = {
      currentValue: row.currentValue,
      expectedValue: row.expectedValue,
      compliancePct: row.compliancePct,
      streakDays: row.streakDays,
      status: row.status,
      dataSufficiency: row.dataSufficiency,
    };
    const inserted = await db
      .insert(goalProgressSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [goalProgressSnapshots.goalRefId, goalProgressSnapshots.weekStartDate],
        set,
      })
      .returning();
    return firstRow(inserted) ?? row;
  };

  storage.getSnapshotsForGoal = async (
    userId: string,
    goalRefId: string,
    opts?: { limit?: number },
    injectedDb?: any,
  ): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    const { goalProgressSnapshots } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goalProgressSnapshots)
        .where(
          and(
            eq(goalProgressSnapshots.userId, userId),
            eq(goalProgressSnapshots.goalRefId, goalRefId),
          ),
        );
      const arr = Array.isArray(rows) ? rows : [];
      return opts?.limit ? arr.slice(0, opts.limit) : arr;
    } catch (err) {
      console.error("goalsStorage.getSnapshotsForGoal.error", { userId, goalRefId, err });
      return [];
    }
  };

  storage.getLatestSnapshotsForUser = async (
    userId: string,
    weekStartDate: string,
    injectedDb?: any,
  ): Promise<any[]> => {
    const db = await resolveDb(injectedDb);
    const { goalProgressSnapshots } = await getTables();
    const { eq, and } = await loadDrizzleOps();
    try {
      const rows = await db
        .select()
        .from(goalProgressSnapshots)
        .where(
          and(
            eq(goalProgressSnapshots.userId, userId),
            eq(goalProgressSnapshots.weekStartDate, weekStartDate),
          ),
        );
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error("goalsStorage.getLatestSnapshotsForUser.error", { userId, weekStartDate, err });
      return [];
    }
  };
}

export { BaselineImmutableError };
