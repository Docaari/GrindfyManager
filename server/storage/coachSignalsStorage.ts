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
import { nanoid } from "nanoid";
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

// =============================================================================
// Sprint AI-2A (RF-08) — getDrawdownInWindow
//
// Drawdown na janela `windowDays` (default 7): refBankroll = saldo consolidado
// no inicio da janela via walletService.getConsolidatedBalanceAt;
// currentBankroll = getConsolidatedBalance. drawdownPct = (ref-current)/ref*100.
//
// Lessons: #3 (helpers reais), #9 (safe-deny null + log).
// =============================================================================

export interface DrawdownInfo {
  refBankrollUsd: number;
  currentBankrollUsd: number;
  drawdownPct: number;
  windowDays: number;
  sampleConfidence: "high" | "low";
}

export async function getDrawdownInWindow(
  userId: string,
  windowDays: number = 7,
): Promise<DrawdownInfo | null> {
  try {
    const ws = await import("../services/walletService");
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [refRaw, currentRaw] = await Promise.all([
      Promise.resolve()
        .then(() => (ws as any).getConsolidatedBalanceAt(userId, since))
        .catch((err: any) => {
          console.error("coach_signals.drawdown.refAt.error", { userId, err });
          return null;
        }),
      Promise.resolve()
        .then(() => (ws as any).getConsolidatedBalance(userId))
        .catch((err: any) => {
          console.error("coach_signals.drawdown.current.error", { userId, err });
          return null;
        }),
    ]);

    // Extrair USD: getConsolidatedBalance pode retornar number ou ConsolidatedBalance
    function toUsd(val: any): number | null {
      if (val == null) return null;
      if (typeof val === "number") return Number.isFinite(val) ? val : null;
      if (typeof val === "object" && val.totalUSD != null) {
        const n = Number(val.totalUSD);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }

    const ref = toUsd(refRaw);
    const current = toUsd(currentRaw);

    if (current == null) return null;
    if (ref == null) {
      return {
        refBankrollUsd: current,
        currentBankrollUsd: current,
        drawdownPct: 0,
        windowDays,
        sampleConfidence: "low",
      };
    }
    if (ref <= 0) {
      return {
        refBankrollUsd: ref,
        currentBankrollUsd: current,
        drawdownPct: 0,
        windowDays,
        sampleConfidence: "low",
      };
    }
    const drawdownPct = ((ref - current) / ref) * 100;
    // sample confidence: 'high' quando ref razoavel; 'low' quando ref muito pequeno.
    const sampleConfidence: "high" | "low" = ref >= 100 ? "high" : "low";
    return {
      refBankrollUsd: ref,
      currentBankrollUsd: current,
      drawdownPct,
      windowDays,
      sampleConfidence,
    };
  } catch (err) {
    console.error("coach_signals.drawdown.error", { userId, err });
    return null;
  }
}

// =============================================================================
// Sprint AI-2A (RF-07) — getRecentStatsUpload
//
// Retorna info sobre upload de HUD stats recente do user. Usado para:
//   - bloco "## Upload Recente" no coachContext
//   - chip "Analisar print recente" no quickSuggestions
//
// withinHours default = 24h (24*60*60*1000ms). Retorna { uploadedAt, statsExtracted }
// quando achar upload dentro da janela; senao null.
// =============================================================================

export async function getRecentStatsUpload(
  userId: string,
  withinHours: number = 24,
): Promise<{ uploadedAt: Date; statsExtracted: Array<{ statId: string; value: number }> } | null> {
  try {
    const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const rows: any[] = await db
      .select({
        id: hudStatSnapshots.id,
        capturedAt: hudStatSnapshots.capturedAt,
        stats: (hudStatSnapshots as any).stats,
      })
      .from(hudStatSnapshots)
      .where(and(eq(hudStatSnapshots.userId, userId), gte(hudStatSnapshots.capturedAt, cutoff)))
      .orderBy(sql`${hudStatSnapshots.capturedAt} DESC`)
      .limit(1);
    const r = rows?.[0];
    if (!r) return null;
    const statsBlob: any = (r as any).stats;
    const statsExtracted: Array<{ statId: string; value: number }> = [];
    if (statsBlob && typeof statsBlob === "object") {
      for (const [k, v] of Object.entries(statsBlob)) {
        const numV = Number(v);
        if (Number.isFinite(numV)) statsExtracted.push({ statId: k, value: numV });
        if (statsExtracted.length >= 10) break;
      }
    }
    return {
      uploadedAt: new Date(r.capturedAt as any),
      statsExtracted,
    };
  } catch (err) {
    console.error("coach_signals.getRecentStatsUpload.error", { userId, err });
    return null;
  }
}

// =============================================================================
// Sprint AI-2A — Helpers diagnostico + nudges
// =============================================================================

export async function countTournamentsThisWeek(userId: string): Promise<number> {
  try {
    const { tournaments } = (await import("@shared/schema")) as any;
    const monday = utcMondayOfWeek();
    const rows: any[] = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(and(eq(tournaments.userId, userId), gte(tournaments.date, monday), isNull(tournaments.grindSessionId)));
    return rows?.length ?? 0;
  } catch (err) {
    console.error("coach_signals.countTournamentsThisWeek.error", { userId, err });
    return 0;
  }
}

export async function avgWeeklyTournaments(
  userId: string,
  windowWeeks: number = 4,
): Promise<{ avg: number; sampleSize: number }> {
  try {
    const { tournaments } = (await import("@shared/schema")) as any;
    const now = new Date();
    const start = utcMondayOfWeek(now);
    start.setUTCDate(start.getUTCDate() - 7 * windowWeeks);
    const rows: any[] = await db
      .select({
        date: tournaments.date,
      })
      .from(tournaments)
      .where(and(eq(tournaments.userId, userId), gte(tournaments.date, start), isNull(tournaments.grindSessionId)));
    if ((rows?.length ?? 0) === 0) return { avg: 0, sampleSize: 0 };
    // Bucketize por semana ISO
    const buckets = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.date as any);
      const mon = utcMondayOfWeek(d);
      const key = mon.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const counts = Array.from(buckets.values());
    const sampleSize = counts.length;
    const avg = counts.reduce((a, b) => a + b, 0) / Math.max(sampleSize, 1);
    return { avg, sampleSize };
  } catch (err) {
    console.error("coach_signals.avgWeeklyTournaments.error", { userId, err });
    return { avg: 0, sampleSize: 0 };
  }
}

export async function countPlannedTournamentsForWeek(
  userId: string,
  weekStart: Date,
): Promise<number> {
  try {
    const { plannedTournaments } = (await import("@shared/schema")) as any;
    const weekEnd = new Date(weekStart.getTime());
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const rows: any[] = await db
      .select({ id: plannedTournaments.id })
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          gte(plannedTournaments.weekStartDate ?? plannedTournaments.createdAt, weekStart as any),
          lte(plannedTournaments.weekStartDate ?? plannedTournaments.createdAt, weekEnd as any),
        ),
      );
    return rows?.length ?? 0;
  } catch (err) {
    console.error("coach_signals.countPlannedTournamentsForWeek.error", { userId, err });
    return 0;
  }
}

export async function getGradeAdherenceForWeek(
  userId: string,
  weekStart: Date,
): Promise<{ planned: number; played: number; adherencePct: number } | null> {
  try {
    void userId;
    void weekStart;
    // Heuristica simples para nudges — preferimos retornar null se nao houver
    // helper especifico. O nudge body continua valido sem aderencia.
    return null;
  } catch (err) {
    console.error("coach_signals.getGradeAdherenceForWeek.error", { userId, err });
    return null;
  }
}

export async function listOffDaysForUser(
  userId: string,
  range?: { from?: Date; to?: Date },
): Promise<Date[]> {
  try {
    const rows: any = await db.execute(
      sql`SELECT off_date FROM user_off_days WHERE user_id = ${userId}` as any,
    );
    const list = (rows as any).rows ?? rows ?? [];
    const out: Date[] = [];
    for (const r of list) {
      const d = new Date(r.off_date ?? r.offDate);
      if (!Number.isFinite(d.getTime())) continue;
      if (range?.from && d < range.from) continue;
      if (range?.to && d > range.to) continue;
      out.push(d);
    }
    return out;
  } catch (err) {
    console.error("coach_signals.listOffDaysForUser.error", { userId, err });
    return [];
  }
}

export async function createUserOffDay(input: {
  userId: string;
  offDate: string;
  reason?: string | null;
  source?: string;
}): Promise<{ id: string; offDate: string; created: boolean }> {
  const id = `od_${nanoid()}`;
  try {
    const result: any = await db.execute(
      sql`
        INSERT INTO user_off_days (id, user_id, off_date, reason, source)
        VALUES (${id}, ${input.userId}, ${input.offDate}, ${input.reason ?? null}, ${input.source ?? "coach_tool"})
        ON CONFLICT (user_id, off_date) DO NOTHING
        RETURNING id
      ` as any,
    );
    const rows = (result as any).rows ?? result ?? [];
    if (rows.length > 0) {
      return { id: rows[0].id, offDate: input.offDate, created: true };
    }
    // already existed — pega id existente
    const exist: any = await db.execute(
      sql`SELECT id FROM user_off_days WHERE user_id = ${input.userId} AND off_date = ${input.offDate} LIMIT 1` as any,
    );
    const existRows = (exist as any).rows ?? exist ?? [];
    return {
      id: existRows[0]?.id ?? id,
      offDate: input.offDate,
      created: false,
    };
  } catch (err) {
    console.error("coach_signals.createUserOffDay.error", { userId: input.userId, err });
    throw err;
  }
}

export async function deleteUserOffDay(id: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM user_off_days WHERE id = ${id}` as any);
  } catch (err) {
    console.error("coach_signals.deleteUserOffDay.error", { id, err });
  }
}

export async function countPlannedTournamentsForDate(
  userId: string,
  isoDate: string,
): Promise<number> {
  try {
    const { plannedTournaments } = (await import("@shared/schema")) as any;
    const date = new Date(isoDate);
    const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const rows: any[] = await db
      .select({ id: plannedTournaments.id })
      .from(plannedTournaments)
      .where(
        and(
          eq(plannedTournaments.userId, userId),
          gte(plannedTournaments.createdAt, date as any),
          lte(plannedTournaments.createdAt, next as any),
        ),
      );
    return rows?.length ?? 0;
  } catch (err) {
    console.error("coach_signals.countPlannedTournamentsForDate.error", { userId, err });
    return 0;
  }
}

export async function deletePlannedTournamentsByIds(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    const { plannedTournaments } = (await import("@shared/schema")) as any;
    const { inArray } = await import("drizzle-orm");
    await db.delete(plannedTournaments).where(inArray(plannedTournaments.id, ids));
  } catch (err) {
    console.error("coach_signals.deletePlannedTournamentsByIds.error", { ids, err });
  }
}

// =============================================================================
// Sprint AI-2A — pool intelligence
// =============================================================================

export async function queryTournamentPoolIntelligence(filters: {
  site?: string;
  namePattern?: string;
} = {}): Promise<{
  rows: Array<{
    site: string;
    tournamentPattern: string;
    buyInMin: number | null;
    buyInMax: number | null;
    fieldAvg: number | null;
    fieldVolatility: number | null;
    poolQuality: string | null;
    notes: string | null;
  }>;
  totalRows: number;
}> {
  try {
    const conds: any[] = [];
    if (filters.site) conds.push(sql`site = ${filters.site}`);
    if (filters.namePattern) {
      conds.push(sql`LOWER(tournament_pattern) LIKE LOWER(${"%" + filters.namePattern + "%"})`);
    }
    const whereSql = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;
    const result: any = await db.execute(
      sql`
        SELECT site, tournament_pattern, buy_in_min, buy_in_max,
               field_avg, field_volatility, pool_quality, notes
        FROM tournament_pool_intelligence
        ${whereSql}
        ORDER BY site, tournament_pattern
        LIMIT 50
      ` as any,
    );
    const list = (result as any).rows ?? result ?? [];
    const rows = list.map((r: any) => ({
      site: r.site,
      tournamentPattern: r.tournament_pattern ?? r.tournamentPattern,
      buyInMin: r.buy_in_min != null ? Number(r.buy_in_min) : null,
      buyInMax: r.buy_in_max != null ? Number(r.buy_in_max) : null,
      fieldAvg: r.field_avg != null ? Number(r.field_avg) : null,
      fieldVolatility: r.field_volatility != null ? Number(r.field_volatility) : null,
      poolQuality: r.pool_quality ?? null,
      notes: r.notes ?? null,
    }));
    return { rows, totalRows: rows.length };
  } catch (err) {
    console.error("coach_signals.queryTournamentPoolIntelligence.error", { filters, err });
    return { rows: [], totalRows: 0 };
  }
}

// =============================================================================
// Sprint AI-2A — rakeback transactions
// =============================================================================

export async function getRakebackTransactions(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ totalUsd: number; transactions: Array<{ id: string; amountUsd: number; occurredAt: Date }> }> {
  try {
    const rows: any[] = await db
      .select({
        id: walletTransactions.id,
        usdAmount: (walletTransactions as any).usdAmount,
        nativeAmount: walletTransactions.nativeAmount,
        occurredAt: walletTransactions.occurredAt,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.userId, userId),
          eq(walletTransactions.reason, "rakeback"),
          gte(walletTransactions.occurredAt, periodStart),
          lte(walletTransactions.occurredAt, periodEnd),
        ),
      );
    let totalUsd = 0;
    const transactions: Array<{ id: string; amountUsd: number; occurredAt: Date }> = [];
    for (const r of rows) {
      const amt = Number(r.usdAmount ?? r.nativeAmount ?? 0);
      if (Number.isFinite(amt)) {
        totalUsd += Math.abs(amt);
        transactions.push({
          id: r.id,
          amountUsd: Math.abs(amt),
          occurredAt: new Date(r.occurredAt as any),
        });
      }
    }
    return { totalUsd, transactions };
  } catch (err) {
    console.error("coach_signals.getRakebackTransactions.error", { userId, err });
    return { totalUsd: 0, transactions: [] };
  }
}

// =============================================================================
// Sprint AI-2A — Monthly trends (diagnose_plateau / analyze_variance)
// =============================================================================

function periodToDays(period: "30d" | "90d"): number {
  return period === "90d" ? 90 : 30;
}

export async function getMonthlyRoiTrend(
  userId: string,
  months: number = 3,
): Promise<Array<{ month: string; roi: number }>> {
  try {
    const { tournaments } = (await import("@shared/schema")) as any;
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    const rows: any[] = await db
      .select({
        month: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`,
        profit: sql<string>`COALESCE(SUM(CAST(${tournaments.prize} AS DECIMAL)), 0)`,
        buyins: sql<string>`COALESCE(SUM(CAST(${tournaments.buyIn} AS DECIMAL)), 0)`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          isNull(tournaments.grindSessionId),
          gte(tournaments.datePlayed, since as any),
        ),
      )
      .groupBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`);
    return rows.map((r) => {
      const profit = Number(r.profit);
      const buyins = Number(r.buyins);
      const roi = buyins > 0 ? ((profit - buyins) / buyins) * 100 : 0;
      return { month: r.month, roi };
    });
  } catch (err) {
    console.error("coach_signals.getMonthlyRoiTrend.error", { userId, err });
    return [];
  }
}

export async function getMonthlyVolumeTrend(
  userId: string,
  months: number = 3,
): Promise<Array<{ month: string; volume: number }>> {
  try {
    const { tournaments } = (await import("@shared/schema")) as any;
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    const rows: any[] = await db
      .select({
        month: sql<string>`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`,
        volume: sql<string>`COUNT(*)`,
      })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.userId, userId),
          isNull(tournaments.grindSessionId),
          gte(tournaments.datePlayed, since as any),
        ),
      )
      .groupBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tournaments.datePlayed}, 'YYYY-MM')`);
    return rows.map((r) => ({ month: r.month, volume: Number(r.volume) }));
  } catch (err) {
    console.error("coach_signals.getMonthlyVolumeTrend.error", { userId, err });
    return [];
  }
}

export async function getMonthlyStudyMinutesTrend(
  userId: string,
  months: number = 3,
): Promise<Array<{ month: string; minutes: number }>> {
  try {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    const rows: any[] = await db
      .select({
        month: sql<string>`TO_CHAR(${studySessionsV2.registeredAt}, 'YYYY-MM')`,
        minutes: sql<string>`COALESCE(SUM(${studySessionsV2.durationMinutes}), 0)`,
      })
      .from(studySessionsV2)
      .where(
        and(
          eq(studySessionsV2.userId, userId),
          gte(studySessionsV2.registeredAt, since as any),
        ),
      )
      .groupBy(sql`TO_CHAR(${studySessionsV2.registeredAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${studySessionsV2.registeredAt}, 'YYYY-MM')`);
    return rows.map((r) => ({ month: r.month, minutes: Number(r.minutes) }));
  } catch (err) {
    console.error("coach_signals.getMonthlyStudyMinutesTrend.error", { userId, err });
    return [];
  }
}

export async function getProfileAdherenceTrend(
  _userId: string,
  _months: number = 3,
): Promise<number[]> {
  // ADR-166: sem fonte canonica para aderencia mensal ao perfil. Handler
  // diagnose_plateau trata array vazio como sinal "unknown".
  return [];
}

export async function getGrindHoursForPeriod(
  userId: string,
  period: "30d" | "90d",
): Promise<number> {
  try {
    const since = new Date(Date.now() - periodToDays(period) * 24 * 60 * 60 * 1000);
    const rows: any[] = await db
      .select({
        totalMinutes: sql<string>`COALESCE(SUM(${grindSessions.duration}), 0)`,
      })
      .from(grindSessions)
      .where(
        and(
          eq(grindSessions.userId, userId),
          gte(grindSessions.date, since as any),
        ),
      );
    return Number(rows[0]?.totalMinutes ?? 0) / 60;
  } catch (err) {
    console.error("coach_signals.getGrindHoursForPeriod.error", { userId, err });
    return 0;
  }
}

export async function getStudyMinutesForPeriod(
  userId: string,
  period: "30d" | "90d",
): Promise<number> {
  try {
    const since = new Date(Date.now() - periodToDays(period) * 24 * 60 * 60 * 1000);
    const v2: any[] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${studySessionsV2.durationMinutes}), 0)`,
      })
      .from(studySessionsV2)
      .where(
        and(
          eq(studySessionsV2.userId, userId),
          gte(studySessionsV2.registeredAt, since as any),
        ),
      );
    const v1: any[] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${studySessions.duration}), 0)`,
      })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          gte(studySessions.date, since as any),
        ),
      );
    return Number(v2[0]?.total ?? 0) + Number(v1[0]?.total ?? 0);
  } catch (err) {
    console.error("coach_signals.getStudyMinutesForPeriod.error", { userId, err });
    return 0;
  }
}

// =============================================================================
// Sprint AI-2A — study themes JSONB sync (lesson #33)
// =============================================================================

export async function findStudyThemeByName(
  userId: string,
  nameLower: string,
): Promise<{ id: string; userId: string; name: string } | null> {
  try {
    const result: any = await db.execute(
      sql`SELECT id, user_id, name FROM study_themes WHERE user_id = ${userId} AND LOWER(TRIM(name)) = ${nameLower} LIMIT 1` as any,
    );
    const rows = (result as any).rows ?? result ?? [];
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, userId: r.user_id ?? r.userId, name: r.name };
  } catch (err) {
    console.error("coach_signals.findStudyThemeByName.error", { userId, err });
    return null;
  }
}

export async function createStudyTheme(input: {
  userId: string;
  name: string;
  category?: string;
  linkedStats?: string[];
}): Promise<{ id: string; userId: string; name: string; category?: string; linkedStats?: string[] }> {
  const id = `th_${nanoid()}`;
  try {
    await db.execute(
      sql`
        INSERT INTO study_themes (id, user_id, name, category, linked_stats, created_at, updated_at)
        VALUES (${id}, ${input.userId}, ${input.name}, ${input.category ?? null},
                ${JSON.stringify(input.linkedStats ?? [])}::jsonb, NOW(), NOW())
      ` as any,
    );
    return { id, userId: input.userId, name: input.name, category: input.category, linkedStats: input.linkedStats ?? [] };
  } catch (err) {
    console.error("coach_signals.createStudyTheme.error", { userId: input.userId, err });
    throw err;
  }
}

export async function deleteStudyTheme(themeId: string, userId?: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM study_themes WHERE id = ${themeId}` as any);
    // MDA-1 (ADR-230 / D-4): cleanup de tags orfas na junction (sem FK). So quando
    // userId presente (back-compat com callers legados que passam so themeId).
    if (userId) {
      await db.execute(
        sql`DELETE FROM mda_read_themes WHERE theme_id = ${themeId} AND user_id = ${userId}` as any,
      );
    }
  } catch (err) {
    console.error("coach_signals.deleteStudyTheme.error", { themeId, err });
  }
}

export async function getStudyTheme(themeId: string): Promise<any | null> {
  try {
    const result: any = await db.execute(
      sql`SELECT id, user_id, name, category FROM study_themes WHERE id = ${themeId} LIMIT 1` as any,
    );
    const rows = (result as any).rows ?? result ?? [];
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, userId: r.user_id ?? r.userId, name: r.name, category: r.category };
  } catch (err) {
    console.error("coach_signals.getStudyTheme.error", { themeId, err });
    return null;
  }
}

/**
 * Append idempotente (lesson #33): adiciona themeId em
 * user_focus_stats.linked_themes para o stat informado.
 */
export async function appendStatToThemes(
  userId: string,
  statCode: string,
  themeId: string,
): Promise<void> {
  try {
    await db.execute(
      sql`
        UPDATE user_focus_stats
        SET linked_themes = CASE
          WHEN linked_themes @> ${JSON.stringify([themeId])}::jsonb THEN linked_themes
          ELSE linked_themes || ${JSON.stringify([themeId])}::jsonb
        END
        WHERE user_id = ${userId} AND stat_code = ${statCode}
      ` as any,
    );
  } catch (err) {
    console.error("coach_signals.appendStatToThemes.error", { userId, statCode, themeId, err });
  }
}

/**
 * Remove via jsonb_agg + WHERE elem<>$ (lesson #33 — `jsonb_array - text` NAO
 * funciona).
 */
export async function removeStatFromThemes(
  userId: string,
  statCode: string,
  themeId: string,
): Promise<void> {
  try {
    await db.execute(
      sql`
        UPDATE user_focus_stats
        SET linked_themes = COALESCE(
          (SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(linked_themes) elem WHERE elem <> ${themeId}),
          '[]'::jsonb
        )
        WHERE user_id = ${userId} AND stat_code = ${statCode}
      ` as any,
    );
  } catch (err) {
    console.error("coach_signals.removeStatFromThemes.error", { userId, statCode, themeId, err });
  }
}

// =============================================================================
// Sprint AI-2A — study_sessions_v2 helpers
// =============================================================================

export async function createStudySessionV2(input: {
  userId: string;
  topic?: string | null;
  themeId?: string | null;
  lessonId?: string | null;
  scheduledFor?: string | null;
  startAt?: string | null;
  durationMinutes?: number;
  status?: string;
}): Promise<{ id: string; status: string }> {
  const id = `ss_${nanoid()}`;
  try {
    const scheduled = input.startAt ?? input.scheduledFor ?? null;
    await db.execute(
      sql`
        INSERT INTO study_sessions_v2 (
          id, user_id, topic, theme_id, lesson_id,
          scheduled_for, duration_minutes, status, registered_at
        )
        VALUES (
          ${id}, ${input.userId}, ${input.topic ?? null}, ${input.themeId ?? null}, ${input.lessonId ?? null},
          ${scheduled}, ${input.durationMinutes ?? null}, ${input.status ?? "planned"}, NOW()
        )
      ` as any,
    );
    return { id, status: input.status ?? "planned" };
  } catch (err) {
    console.error("coach_signals.createStudySessionV2.error", { userId: input.userId, err });
    throw err;
  }
}

export async function deleteStudySessionV2(id: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM study_sessions_v2 WHERE id = ${id}` as any);
  } catch (err) {
    console.error("coach_signals.deleteStudySessionV2.error", { id, err });
  }
}

export async function listStudySessionsV2InRange(input: {
  userId: string;
  from: Date;
  to: Date;
}): Promise<Array<{ id: string; scheduledFor: string | null }>> {
  try {
    const result: any = await db.execute(
      sql`
        SELECT id, scheduled_for
        FROM study_sessions_v2
        WHERE user_id = ${input.userId}
          AND scheduled_for IS NOT NULL
          AND scheduled_for >= ${input.from.toISOString()}
          AND scheduled_for <= ${input.to.toISOString()}
      ` as any,
    );
    const rows = (result as any).rows ?? result ?? [];
    return rows.map((r: any) => ({ id: r.id, scheduledFor: r.scheduled_for ?? null }));
  } catch (err) {
    console.error("coach_signals.listStudySessionsV2InRange.error", { userId: input.userId, err });
    return [];
  }
}

// =============================================================================
// attach helper
// =============================================================================

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
  // Sprint AI-2A helpers
  if (typeof storage.getDrawdownInWindow !== "function") storage.getDrawdownInWindow = getDrawdownInWindow;
  if (typeof storage.getRecentStatsUpload !== "function") storage.getRecentStatsUpload = getRecentStatsUpload;
  if (typeof storage.countTournamentsThisWeek !== "function") storage.countTournamentsThisWeek = countTournamentsThisWeek;
  if (typeof storage.avgWeeklyTournaments !== "function") storage.avgWeeklyTournaments = avgWeeklyTournaments;
  if (typeof storage.countPlannedTournamentsForWeek !== "function") storage.countPlannedTournamentsForWeek = countPlannedTournamentsForWeek;
  if (typeof storage.getGradeAdherenceForWeek !== "function") storage.getGradeAdherenceForWeek = getGradeAdherenceForWeek;
  if (typeof storage.listOffDaysForUser !== "function") storage.listOffDaysForUser = listOffDaysForUser;
  if (typeof storage.createUserOffDay !== "function") storage.createUserOffDay = createUserOffDay;
  if (typeof storage.deleteUserOffDay !== "function") storage.deleteUserOffDay = deleteUserOffDay;
  if (typeof storage.countPlannedTournamentsForDate !== "function") storage.countPlannedTournamentsForDate = countPlannedTournamentsForDate;
  if (typeof storage.deletePlannedTournamentsByIds !== "function") storage.deletePlannedTournamentsByIds = deletePlannedTournamentsByIds;
  if (typeof storage.queryTournamentPoolIntelligence !== "function") storage.queryTournamentPoolIntelligence = queryTournamentPoolIntelligence;
  if (typeof storage.getRakebackTransactions !== "function") storage.getRakebackTransactions = getRakebackTransactions;
  if (typeof storage.getMonthlyRoiTrend !== "function") storage.getMonthlyRoiTrend = getMonthlyRoiTrend;
  if (typeof storage.getMonthlyVolumeTrend !== "function") storage.getMonthlyVolumeTrend = getMonthlyVolumeTrend;
  if (typeof storage.getMonthlyStudyMinutesTrend !== "function") storage.getMonthlyStudyMinutesTrend = getMonthlyStudyMinutesTrend;
  if (typeof storage.getProfileAdherenceTrend !== "function") storage.getProfileAdherenceTrend = getProfileAdherenceTrend;
  if (typeof storage.getGrindHoursForPeriod !== "function") storage.getGrindHoursForPeriod = getGrindHoursForPeriod;
  if (typeof storage.getStudyMinutesForPeriod !== "function") storage.getStudyMinutesForPeriod = getStudyMinutesForPeriod;
  if (typeof storage.findStudyThemeByName !== "function") storage.findStudyThemeByName = findStudyThemeByName;
  if (typeof storage.createStudyTheme !== "function") storage.createStudyTheme = createStudyTheme;
  if (typeof storage.deleteStudyTheme !== "function") storage.deleteStudyTheme = deleteStudyTheme;
  if (typeof storage.getStudyTheme !== "function") storage.getStudyTheme = getStudyTheme;
  if (typeof storage.appendStatToThemes !== "function") storage.appendStatToThemes = appendStatToThemes;
  if (typeof storage.removeStatFromThemes !== "function") storage.removeStatFromThemes = removeStatFromThemes;
  if (typeof storage.createStudySessionV2 !== "function") storage.createStudySessionV2 = createStudySessionV2;
  if (typeof storage.deleteStudySessionV2 !== "function") storage.deleteStudySessionV2 = deleteStudySessionV2;
  if (typeof storage.listStudySessionsV2InRange !== "function") storage.listStudySessionsV2InRange = listStudySessionsV2InRange;
}
