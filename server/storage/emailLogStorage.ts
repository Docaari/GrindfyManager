// =============================================================================
// emailLogStorage — Sprint AI-2B / RF-07.1 (ADR-172)
//
// CRUD + idempotência via UNIQUE (report_id, kind) ON CONFLICT DO NOTHING.
// Lessons #34 (injectedDb), #36 (schema lazy).
// =============================================================================

import { nanoid } from "nanoid";
import { eq, and, lt, desc, sql } from "drizzle-orm";

type AnyTable = any;
let _table: AnyTable | null = null;

async function getTable(): Promise<AnyTable> {
  if (_table) return _table;
  try {
    const mod: any = await import("@shared/schema");
    _table = mod.emailLog ?? mod.email_log ?? null;
  } catch {
    _table = null;
  }
  if (!_table) {
    _table = {
      id: "email_log.id",
      userId: "email_log.user_id",
      reportId: "email_log.report_id",
      kind: "email_log.kind",
      status: "email_log.status",
      attempts: "email_log.attempts",
      createdAt: "email_log.created_at",
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
// insertEmailLog — ON CONFLICT (report_id, kind) DO NOTHING (UNIQUE)
// ---------------------------------------------------------------------------
export interface InsertEmailLogInput {
  userId: string;
  reportId?: string | null;
  kind: "report_weekly" | "report_monthly" | "report_quarterly";
  toEmail: string;
  subject: string;
}

export async function insertEmailLog(
  input: InsertEmailLogInput,
  injectedDb?: any,
): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  const row = {
    id: nanoid(),
    userId: input.userId,
    reportId: input.reportId ?? null,
    kind: input.kind,
    toEmail: input.toEmail,
    subject: input.subject,
    status: "pending" as const,
    attempts: 0,
  };
  try {
    const chain: any = db.insert(tbl).values(row);
    // onConflictDoNothing → returning chain (compatível com Drizzle real + mocks)
    const next = chain.onConflictDoNothing ? chain.onConflictDoNothing() : chain;
    const inserted = next.returning ? await next.returning() : await next;
    if (!inserted || (Array.isArray(inserted) && inserted.length === 0)) return null;
    const out = Array.isArray(inserted) ? inserted[0] : inserted;
    return out ?? null;
  } catch (err) {
    console.error("emailLog.insert.error", { userId: input.userId, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// updateEmailLog — status/sentAt/messageId/errorMessage/attempts
// ---------------------------------------------------------------------------
export interface UpdateEmailLogInput {
  status?: "pending" | "sent" | "failed" | "bounced" | "unsubscribed";
  sentAt?: Date | null;
  messageId?: string | null;
  errorMessage?: string | null;
  attempts?: number;
}

export async function updateEmailLog(
  id: string,
  patch: UpdateEmailLogInput,
  injectedDb?: any,
): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const updated = await db
      .update(tbl)
      .set(patch as any)
      .where(eq((tbl as any).id, id))
      .returning();
    const out = Array.isArray(updated) ? updated[0] : updated;
    return out ?? null;
  } catch (err) {
    console.error("emailLog.update.error", { id, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// listPendingEmailLogs — status='pending' AND attempts<3
// ---------------------------------------------------------------------------
export async function listPendingEmailLogs(
  limit = 50,
  injectedDb?: any,
): Promise<any[]> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(and(eq((tbl as any).status, "pending"), lt((tbl as any).attempts, 3)))
      .orderBy(desc((tbl as any).createdAt))
      .limit(limit);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("emailLog.listPending.error", { err: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// getEmailLog — fetch by id
// ---------------------------------------------------------------------------
export async function getEmailLog(id: string, injectedDb?: any): Promise<any | null> {
  const db = await resolveDb(injectedDb);
  const tbl = await getTable();
  try {
    const rows = await db
      .select()
      .from(tbl)
      .where(eq((tbl as any).id, id))
      .limit(1);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
  } catch (err) {
    console.error("emailLog.get.error", { id, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
