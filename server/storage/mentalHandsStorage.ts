// =============================================================================
// mentalHandsStorage — Sprint AI-2B / RF-06 (ADR-171)
//
// CRUD para mental_hand_history (migration 0071). Lessons #34 (injectedDb),
// #36 (schema lazy), #3 (shape real).
// =============================================================================

import { nanoid } from "nanoid";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

type AnyTable = any;
let _table: AnyTable | null = null;

async function getTable(): Promise<AnyTable> {
  if (_table) return _table;
  try {
    const mod: any = await import("@shared/schema");
    _table = mod.mentalHandHistory ?? mod.mental_hand_history ?? null;
  } catch {
    _table = null;
  }
  if (!_table) {
    _table = {
      id: "mental_hand_history.id",
      userId: "mental_hand_history.user_id",
      occurredAt: "mental_hand_history.occurred_at",
      emotion: "mental_hand_history.emotion",
      createdAt: "mental_hand_history.created_at",
    };
  }
  return _table;
}

async function resolveDb(injected?: any): Promise<any> {
  if (injected) return injected;
  const mod: any = await import("../db");
  return mod.db;
}

// ---------------------------------------------------------------------------
// createMentalHand
// ---------------------------------------------------------------------------
export interface CreateMentalHandInput {
  situation: string;
  emotion?: string | null;
  realResponse: string;
  idealResponse: string;
  tags?: string[] | null;
  linkedGrindSessionId?: string | null;
  occurredAt?: Date | string;
}

export async function createMentalHand(
  userIdOrPayload: string | (CreateMentalHandInput & { userId: string }),
  inputArg?: CreateMentalHandInput,
  injectedDb?: any,
): Promise<any> {
  // Aceita 2-arg (userId, input) OU 1-arg (payload com userId) — para uniformidade
  // com chamada do tool handler logMentalHand (1-arg) e o test direto do storage (2-arg).
  let userId: string;
  let input: CreateMentalHandInput;
  if (typeof userIdOrPayload === "string") {
    userId = userIdOrPayload;
    input = inputArg!;
  } else {
    userId = (userIdOrPayload as any).userId;
    input = userIdOrPayload as any;
  }
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  const occurredAt = input.occurredAt
    ? (input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt))
    : new Date();
  const row = {
    id: nanoid(),
    userId,
    occurredAt,
    situation: input.situation,
    emotion: input.emotion ?? null,
    realResponse: input.realResponse,
    idealResponse: input.idealResponse,
    tags: input.tags ?? null,
    linkedGrindSessionId: input.linkedGrindSessionId ?? null,
  };
  const inserted = await db.insert(tbl).values(row).returning();
  const out = Array.isArray(inserted) ? inserted[0] : inserted;
  return out ?? row;
}

// ---------------------------------------------------------------------------
// listMentalHandsForRange — user + occurredAt in [start, end], DESC
// ---------------------------------------------------------------------------
export async function listMentalHandsForRange(
  userId: string,
  start: Date | string,
  end: Date | string,
  injectedDb?: any,
): Promise<any[]> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(
        and(
          eq((tbl as any).userId, userId),
          gte((tbl as any).occurredAt, s),
          lte((tbl as any).occurredAt, e),
        ),
      )
      .orderBy(desc((tbl as any).occurredAt));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("mentalHands.listRange.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// listMentalHandsPaginated — limit/offset + filter emotion
// ---------------------------------------------------------------------------
export async function listMentalHandsPaginated(
  userId: string,
  opts: { limit?: number; offset?: number; emotion?: string | null },
  injectedDb?: any,
): Promise<any[]> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  try {
    const wheres: any[] = [eq((tbl as any).userId, userId)];
    if (opts.emotion) wheres.push(eq((tbl as any).emotion, opts.emotion));
    const rows = await db
      .select()
      .from(tbl)
      .where(and(...wheres))
      .orderBy(desc((tbl as any).occurredAt))
      .limit(limit)
      .offset(offset);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("mentalHands.listPaginated.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// getMentalHand — ownership filter ou null
// ---------------------------------------------------------------------------
export async function getMentalHand(
  userId: string,
  handId: string,
  injectedDb?: any,
): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).id, handId)))
      .limit(1);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } catch (err) {
    console.error("mentalHands.get.error", { userId, handId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// deleteMentalHand — ownership filter
// ---------------------------------------------------------------------------
export async function deleteMentalHand(
  userId: string,
  handId: string,
  injectedDb?: any,
): Promise<void> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    await db
      .delete(tbl)
      .where(and(eq((tbl as any).userId, userId), eq((tbl as any).id, handId)));
  } catch (err) {
    console.error("mentalHands.delete.error", { userId, handId, err: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// countMentalHandsCreatedToday — rate limit 20/dia/user
// ---------------------------------------------------------------------------
export async function countMentalHandsCreatedToday(
  userId: string,
  injectedDb?: any,
): Promise<number> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(tbl)
      .where(and(eq((tbl as any).userId, userId), gte((tbl as any).createdAt, startOfDay)));
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const n = (rows[0] as any)?.count;
    if (typeof n === "number") return n;
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    console.error("mentalHands.countToday.error", { userId, err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}
