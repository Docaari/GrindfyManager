// =============================================================================
// careerGoalsStorage — Sprint AI-2B / RF-02 (ADR-168)
//
// CRUD helpers para a tabela `career_goals` (migration 0071). Tabela dedicada
// substituindo Goal Setting cancelado; `ai_structured_profile.metas` legacy
// mantida — sync via 2 helpers (appendStructuredProfileMeta /
// removeStructuredProfileMetaByCareerGoal).
//
// Lessons aplicadas:
//   - #34 — todos os helpers aceitam `injectedDb?` como 3o (ou 4o) arg.
//   - #36 — `@shared/schema` lazy + fallback placeholder (testes que mockam
//           `drizzle-orm` parcialmente nao quebram).
//   - #3  — shape REAL: createCareerGoal usa nanoid id, status='active' default,
//           horizon='trimestre' default, retorna a row inserida.
// =============================================================================

import { nanoid } from "nanoid";
import { eq, and, desc, sql } from "drizzle-orm";

type AnyTable = any;

let _careerGoalsTable: AnyTable | null = null;
async function getTable(): Promise<AnyTable> {
  if (_careerGoalsTable) return _careerGoalsTable;
  try {
    const mod: any = await import("@shared/schema");
    _careerGoalsTable = mod.careerGoals ?? mod.career_goals ?? null;
  } catch {
    _careerGoalsTable = null;
  }
  // Placeholder leve para o caso de mock de @shared/schema; o `db` mockado
  // ignora os args de .from/.where, entao basta um objeto com props nominais.
  if (!_careerGoalsTable) {
    _careerGoalsTable = {
      id: "career_goals.id",
      userId: "career_goals.user_id",
      status: "career_goals.status",
      createdAt: "career_goals.created_at",
    };
  }
  return _careerGoalsTable;
}

async function resolveDb(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../db");
  return mod.db;
}

// ---------------------------------------------------------------------------
// createCareerGoal
// ---------------------------------------------------------------------------
export interface CreateCareerGoalInput {
  title: string;
  description?: string | null;
  targetMetric?: string | null;
  targetValue?: number | null;
  targetDeadline?: string | null;
  horizon?: "mes" | "trimestre" | "ano" | "multi_ano";
  status?: "active" | "achieved" | "abandoned" | "expired";
}

export async function createCareerGoal(
  userId: string,
  input: CreateCareerGoalInput,
  injectedDb?: any,
): Promise<any> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  const row = {
    id: nanoid(),
    userId,
    title: input.title,
    description: input.description ?? null,
    targetMetric: input.targetMetric ?? null,
    targetValue: input.targetValue ?? null,
    targetDeadline: input.targetDeadline ?? null,
    horizon: input.horizon ?? "trimestre",
    status: input.status ?? "active",
  };
  const inserted = await db.insert(tbl).values(row).returning();
  const out = Array.isArray(inserted) ? inserted[0] : inserted;
  return out ?? row;
}

// ---------------------------------------------------------------------------
// listActiveCareerGoals — status='active' + createdAt DESC
// ---------------------------------------------------------------------------
export async function listActiveCareerGoals(userId: string, injectedDb?: any): Promise<any[]> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).status, "active")))
      .orderBy(desc((tbl as any).createdAt));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("careerGoals.listActive.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// getCareerGoal — ownership (user_id + id) ou null
// ---------------------------------------------------------------------------
export async function getCareerGoal(
  userId: string,
  goalId: string,
  injectedDb?: any,
): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).id, goalId)))
      .limit(1);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } catch (err) {
    console.error("careerGoals.get.error", { userId, goalId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// updateCareerGoal — ownership filter + updatedAt
// ---------------------------------------------------------------------------
export interface UpdateCareerGoalInput {
  status?: "active" | "achieved" | "abandoned" | "expired";
  progressNote?: string | null;
  targetValue?: number | null;
  targetDeadline?: string | null;
  achievedAt?: Date | null;
}

export async function updateCareerGoal(
  userId: string,
  goalId: string,
  patch: UpdateCareerGoalInput,
  injectedDb?: any,
): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const updated = await db
      .update(tbl)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).id, goalId)))
      .returning();
    const out = Array.isArray(updated) ? updated[0] : updated;
    return out ?? null;
  } catch (err) {
    console.error("careerGoals.update.error", { userId, goalId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// deleteCareerGoal — ownership filter, hard delete
// ---------------------------------------------------------------------------
export async function deleteCareerGoal(
  userId: string,
  goalId: string,
  injectedDb?: any,
): Promise<void> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    await db
      .delete(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).id, goalId)));
  } catch (err) {
    console.error("careerGoals.delete.error", { userId, goalId, err: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// countActiveCareerGoals — cap enforcement (cap 5 default)
// ---------------------------------------------------------------------------
export async function countActiveCareerGoals(userId: string, injectedDb?: any): Promise<number> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).status, "active")));
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const n = (rows[0] as any)?.count;
    if (typeof n === "number") return n;
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    console.error("careerGoals.count.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// getAllUserGoals — agrega career_goals + ai_structured_profile.metas legacy
// (ADR-168 §2.2 — sem dedup).
// ---------------------------------------------------------------------------
export async function getAllUserGoals(
  userId: string,
  injectedStorage?: any,
): Promise<{ structured: any[]; legacy: any[] }> {
  const structured = injectedStorage?.listActiveCareerGoals
    ? await injectedStorage.listActiveCareerGoals(userId)
    : await listActiveCareerGoals(userId);
  let legacy: any[] = [];
  try {
    if (injectedStorage?.getStructuredProfileMetas) {
      legacy = (await injectedStorage.getStructuredProfileMetas(userId)) ?? [];
    } else {
      const { getAiStructuredProfile } = await import("./aiStructuredProfile");
      const profile = await getAiStructuredProfile(userId);
      const metas = Array.isArray((profile as any)?.metas) ? (profile as any).metas : [];
      legacy = metas;
    }
  } catch (err) {
    console.error("careerGoals.getAllUserGoals.legacy.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }
  return { structured: structured ?? [], legacy };
}
