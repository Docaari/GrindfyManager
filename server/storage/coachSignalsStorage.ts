// =============================================================================
// coachSignalsStorage — Sprint AI-1B (ADR-157) — sinais de estado real usados
// pelo gap-check (B-GAPCHECK) e pelo B-IMPORT. Compostos de queries das tabelas
// reais (lesson #3 — sem inventar metodo). Attach-pattern: importado por
// server/storage.ts (no fim) que chama attachCoachSignalsStorage(storage).
//
// Helpers:
//   - getLastUploadAt(userId)               -> Date | null   (MAX upload_history)
//   - hasImportThisWeek(userId)             -> boolean        (upload "success" na semana corrente)
//   - countGrindSessionsThisWeek(userId)    -> number         (grind_sessions na semana corrente)
//   - countGrindSessionsSince(userId, since)-> number         (grind_sessions desde uma data)
//   - hasUnreconciledSessionsThisWeek(userId)-> boolean       (sessao completada sem wallet_tx session_result)
//   - hasPendingBankrollSnapshot(userId)    -> boolean        (sem snapshot ha > 7d)
//   - getStudyMinutesThisWeek(userId)       -> number         (soma minutos study_sessions_v2 + v1 da semana)
//   - hasStatsUpdateForActiveFocus(userId)  -> boolean        (snapshot HUD recente — proxy de "atualizou stats")
// =============================================================================

import { db } from "../db";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  uploadHistory,
  grindSessions,
  bankrollSnapshots,
  studySessions,
  studySessionsV2,
  hudStatSnapshots,
  walletTransactions,
} from "@shared/schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Segunda 00:00 UTC da semana de `ref` (default agora). */
function utcMondayOfWeek(ref?: Date): Date {
  const r = ref ?? new Date();
  const d = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()));
  const dow = d.getUTCDay();
  const delta = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

function num(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function getLastUploadAt(userId: string): Promise<Date | null> {
  try {
    const rows: any[] = await db
      .select({ uploadDate: uploadHistory.uploadDate, createdAt: uploadHistory.createdAt })
      .from(uploadHistory)
      .where(and(eq(uploadHistory.userId, userId), eq(uploadHistory.status, "success")))
      .orderBy(sql`COALESCE(${uploadHistory.uploadDate}, ${uploadHistory.createdAt}) DESC`)
      .limit(1);
    const r = rows?.[0];
    if (!r) return null;
    const d = new Date(r.uploadDate ?? r.createdAt ?? 0);
    return Number.isFinite(d.getTime()) && d.getTime() > 0 ? d : null;
  } catch (err) {
    console.error("storage.getLastUploadAt.error", { userId, err });
    return null;
  }
}

async function hasImportThisWeek(userId: string): Promise<boolean> {
  try {
    const monday = utcMondayOfWeek();
    const rows: any[] = await db
      .select({ id: uploadHistory.id })
      .from(uploadHistory)
      .where(
        and(
          eq(uploadHistory.userId, userId),
          eq(uploadHistory.status, "success"),
          gte(sql`COALESCE(${uploadHistory.uploadDate}, ${uploadHistory.createdAt})`, monday as any),
        ),
      )
      .limit(1);
    return (rows?.length ?? 0) > 0;
  } catch (err) {
    console.error("storage.hasImportThisWeek.error", { userId, err });
    return true; // safe: nao cobra se nao sabe.
  }
}

async function countGrindSessionsSince(userId: string, since: Date): Promise<number> {
  try {
    const sinceDate = since instanceof Date ? since : new Date(since);
    const rows: any[] = await db
      .select({ id: grindSessions.id })
      .from(grindSessions)
      .where(and(eq(grindSessions.userId, userId), gte(grindSessions.date, sinceDate)));
    return rows?.length ?? 0;
  } catch (err) {
    console.error("storage.countGrindSessionsSince.error", { userId, err });
    return 0;
  }
}

async function countGrindSessionsThisWeek(userId: string): Promise<number> {
  return countGrindSessionsSince(userId, utcMondayOfWeek());
}

async function hasPendingBankrollSnapshot(userId: string): Promise<boolean> {
  try {
    const rows: any[] = await db
      .select({ occurredAt: bankrollSnapshots.occurredAt })
      .from(bankrollSnapshots)
      .where(eq(bankrollSnapshots.userId, userId))
      .orderBy(sql`${bankrollSnapshots.occurredAt} DESC`)
      .limit(1);
    const last = rows?.[0]?.occurredAt ? new Date(rows[0].occurredAt).getTime() : null;
    if (last == null) return false; // user que nunca usou bankroll — nao cobra.
    return Date.now() - last > WEEK_MS;
  } catch (err) {
    console.error("storage.hasPendingBankrollSnapshot.error", { userId, err });
    return false;
  }
}

async function getStudyMinutesThisWeek(userId: string): Promise<number> {
  try {
    const monday = utcMondayOfWeek();
    const [v2Rows, v1Rows] = await Promise.all([
      db
        .select({ durationMinutes: studySessionsV2.durationMinutes })
        .from(studySessionsV2)
        .where(
          and(
            eq(studySessionsV2.userId, userId),
            isNull(studySessionsV2.deletedAt),
            gte(studySessionsV2.registeredAt, monday),
          ),
        ),
      db
        .select({ duration: studySessions.duration })
        .from(studySessions)
        .where(and(eq(studySessions.userId, userId), gte(studySessions.date, monday))),
    ]);
    const v2 = (v2Rows as any[]).reduce((acc, r) => acc + num(r.durationMinutes), 0);
    const v1 = (v1Rows as any[]).reduce((acc, r) => acc + num(r.duration), 0);
    return v2 + v1;
  } catch (err) {
    console.error("storage.getStudyMinutesThisWeek.error", { userId, err });
    return 0;
  }
}

async function hasStatsUpdateForActiveFocus(userId: string): Promise<boolean> {
  // Proxy: existe um snapshot HUD capturado nos ultimos 7 dias? (atualizar stats
  // depois de escolher um foco eh o sinal que queremos). Conservador: se nao ha
  // NENHUM snapshot, considera "true" pra nao cobrar quem nao usa HUD.
  try {
    const cutoff = new Date(Date.now() - WEEK_MS);
    const rows: any[] = await db
      .select({ id: hudStatSnapshots.id })
      .from(hudStatSnapshots)
      .where(and(eq(hudStatSnapshots.userId, userId), gte(hudStatSnapshots.capturedAt, cutoff)))
      .limit(1);
    if ((rows?.length ?? 0) > 0) return true;
    // sem snapshot recente — checa se o user tem ALGUM snapshot historico (usa HUD?).
    const anyRows: any[] = await db
      .select({ id: hudStatSnapshots.id })
      .from(hudStatSnapshots)
      .where(eq(hudStatSnapshots.userId, userId))
      .limit(1);
    // se nunca capturou nada -> true (nao cobra). se ja capturou mas nao essa semana -> false (cobra).
    return (anyRows?.length ?? 0) === 0;
  } catch (err) {
    console.error("storage.hasStatsUpdateForActiveFocus.error", { userId, err });
    return true;
  }
}

async function hasUnreconciledSessionsThisWeek(userId: string, storage?: any): Promise<boolean> {
  // So faz sentido se o user usa o fluxo multi-wallet (bankrollManagementEnabled).
  try {
    if (storage && typeof storage.getUserSettings === "function") {
      const settings = await storage.getUserSettings(userId).catch(() => null);
      if (settings && (settings as any).bankrollManagementEnabled === false) return false;
    }
    const monday = utcMondayOfWeek();
    const completed: any[] = await db
      .select({ id: grindSessions.id })
      .from(grindSessions)
      .where(
        and(
          eq(grindSessions.userId, userId),
          eq(grindSessions.status, "completed"),
          gte(grindSessions.date, monday),
        ),
      );
    if ((completed?.length ?? 0) === 0) return false;
    for (const s of completed) {
      const recRows: any[] = await db
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.userId, userId),
            eq(walletTransactions.sessionId, s.id),
            eq(walletTransactions.reason, "session_result"),
          ),
        )
        .limit(1);
      if ((recRows?.length ?? 0) === 0) return true; // achou uma nao reconciliada.
    }
    return false;
  } catch (err) {
    console.error("storage.hasUnreconciledSessionsThisWeek.error", { userId, err });
    return false;
  }
}

export function attachCoachSignalsStorage(storage: any): void {
  if (typeof storage.getLastUploadAt !== "function") storage.getLastUploadAt = getLastUploadAt;
  if (typeof storage.hasImportThisWeek !== "function") storage.hasImportThisWeek = hasImportThisWeek;
  if (typeof storage.countGrindSessionsThisWeek !== "function") storage.countGrindSessionsThisWeek = countGrindSessionsThisWeek;
  if (typeof storage.countGrindSessionsSince !== "function") storage.countGrindSessionsSince = countGrindSessionsSince;
  if (typeof storage.hasPendingBankrollSnapshot !== "function") storage.hasPendingBankrollSnapshot = hasPendingBankrollSnapshot;
  if (typeof storage.getStudyMinutesThisWeek !== "function") storage.getStudyMinutesThisWeek = getStudyMinutesThisWeek;
  if (typeof storage.hasStatsUpdateForActiveFocus !== "function") storage.hasStatsUpdateForActiveFocus = hasStatsUpdateForActiveFocus;
  if (typeof storage.hasUnreconciledSessionsThisWeek !== "function") {
    storage.hasUnreconciledSessionsThisWeek = (userId: string) => hasUnreconciledSessionsThisWeek(userId, storage);
  }
}
