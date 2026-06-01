// =============================================================================
// reportStorage — Sprint AI-1B (ADR-155/157) — report_jobs / reports CRUD.
//
// Attach-pattern: importado por server/storage.ts (no fim do arquivo) que chama
// attachReportStorage(storage). Mantido fora do storage.ts gigante por clareza.
// =============================================================================

import { db } from "../db";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { reportJobs, reports, chatSessions } from "@shared/schema";

// Sprint EST-1 (ADR-223) — canais de entrega rastreados no ledger jsonb.
export type ReportDeliveryChannel = "inApp" | "chat" | "email";

// Sprint EST-1 / RF-05 — claim atomico de canal de entrega via jsonb ledger.
// UPDATE condicional: so marca se o canal AINDA NAO esta no delivered_channels.
// Retorna true sse ESTA chamada marcou agora (RETURNING traz a linha / rowCount>0).
// Lesson #33 (manipulacao jsonb atomica) + #34 (tx opcional injetado).
async function markReportDelivered(
  reportId: string,
  channel: ReportDeliveryChannel,
  tx?: any,
): Promise<boolean> {
  try {
    const runner = tx ?? db;
    const iso = new Date().toISOString();
    const result: any = await runner.execute(sql`
      UPDATE reports
      SET delivered_channels =
        delivered_channels || ${JSON.stringify({ [channel]: iso })}::jsonb
      WHERE id = ${reportId}
        AND NOT (delivered_channels ? ${channel})
      RETURNING id
    `);
    const rowCount =
      typeof result?.rowCount === "number"
        ? result.rowCount
        : Array.isArray(result?.rows)
          ? result.rows.length
          : 0;
    return rowCount > 0;
  } catch (err) {
    console.error("storage.markReportDelivered.error", { reportId, channel, err });
    return false;
  }
}

// Sprint EST-1 / RF-05 — compensacao: remove o canal do ledger (libera re-tentativa).
async function unmarkReportDelivered(
  reportId: string,
  channel: ReportDeliveryChannel,
  tx?: any,
): Promise<void> {
  try {
    const runner = tx ?? db;
    await runner.execute(sql`
      UPDATE reports
      SET delivered_channels = delivered_channels - ${channel}
      WHERE id = ${reportId}
    `);
  } catch (err) {
    console.error("storage.unmarkReportDelivered.error", { reportId, channel, err });
  }
}

async function insertReportJobOnConflictDoNothing(row: any): Promise<any> {
  try {
    const id = row?.id ?? nanoid();
    const inserted = await db
      .insert(reportJobs)
      .values({
        id,
        userId: row.userId,
        reportType: row.reportType ?? "weekly",
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        scheduledFor: row.scheduledFor instanceof Date ? row.scheduledFor : new Date(row.scheduledFor),
        status: row.status ?? "pending",
        attempts: 0,
        maxAttempts: row.maxAttempts ?? 3,
        timezone: row.timezone ?? null,
        subscriptionPlanAtEnqueue: row.subscriptionPlanAtEnqueue ?? null,
        enqueuedBy: row.enqueuedBy ?? "cron_enqueuer",
      } as any)
      .onConflictDoNothing({ target: [reportJobs.userId, reportJobs.reportType, reportJobs.periodStart] })
      .returning();
    return (inserted as any[])?.[0] ?? null;
  } catch (err) {
    console.error("storage.insertReportJobOnConflictDoNothing.error", { err });
    return null;
  }
}

async function listDueReportJobs(opts: { now: Date; limit?: number }): Promise<any[]> {
  try {
    const now = opts.now ?? new Date();
    const rows = await db
      .select()
      .from(reportJobs)
      .where(
        and(
          eq(reportJobs.status, "pending"),
          lte(reportJobs.scheduledFor, now),
          or(isNull(reportJobs.nextAttemptAt), lte(reportJobs.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(reportJobs.scheduledFor))
      .limit(opts.limit ?? 25);
    return rows as any[];
  } catch (err) {
    console.error("storage.listDueReportJobs.error", { err });
    return [];
  }
}

async function claimReportJob(opts: { jobId: string; now: Date }): Promise<any | null> {
  try {
    const rows = await db
      .update(reportJobs)
      .set({ status: "running", attempts: sql`${reportJobs.attempts} + 1`, updatedAt: new Date() } as any)
      .where(and(eq(reportJobs.id, opts.jobId), eq(reportJobs.status, "pending")))
      .returning();
    return (rows as any[])?.[0] ?? null;
  } catch (err) {
    console.error("storage.claimReportJob.error", { jobId: opts.jobId, err });
    return null;
  }
}

async function updateReportJob(jobId: string, patch: any): Promise<any | null> {
  try {
    const rows = await db
      .update(reportJobs)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(eq(reportJobs.id, jobId))
      .returning();
    return (rows as any[])?.[0] ?? null;
  } catch (err) {
    console.error("storage.updateReportJob.error", { jobId, err });
    return null;
  }
}

async function getReportForPeriod(userId: string, reportType: string, periodStart: string): Promise<any | null> {
  try {
    const rows = await db
      .select()
      .from(reports)
      .where(and(eq(reports.userId, userId), eq(reports.reportType, reportType), eq(reports.periodStart, periodStart as any)))
      .limit(1);
    return (rows as any[])?.[0] ?? null;
  } catch (err) {
    console.error("storage.getReportForPeriod.error", { userId, err });
    return null;
  }
}

async function getReportById(id: string): Promise<any | null> {
  try {
    const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return (rows as any[])?.[0] ?? null;
  } catch (err) {
    console.error("storage.getReportById.error", { id, err });
    return null;
  }
}

async function upsertReport(row: any): Promise<any> {
  try {
    const id = row?.id ?? nanoid();
    const values: any = {
      id,
      userId: row.userId,
      reportType: row.reportType ?? "weekly",
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status ?? "ready",
      content: row.content ?? {},
      markdown: row.markdown ?? null,
      modelUsed: row.modelUsed ?? null,
      summarizerModelUsed: row.summarizerModelUsed ?? null,
      costUsdEstimate: row.costUsdEstimate ?? 0,
      inputTokens: row.inputTokens ?? null,
      cacheCreationInputTokens: row.cacheCreationInputTokens ?? null,
      cacheReadInputTokens: row.cacheReadInputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      degradedReason: row.degradedReason ?? null,
      generatedAt: new Date(),
    };
    const setVals = { ...values };
    delete setVals.id;
    const rows = await db
      .insert(reports)
      .values(values)
      .onConflictDoUpdate({
        target: [reports.userId, reports.reportType, reports.periodStart],
        set: setVals as any,
      })
      .returning();
    return (rows as any[])?.[0] ?? { id };
  } catch (err) {
    console.error("storage.upsertReport.error", { err });
    return { id: row?.id ?? nanoid() };
  }
}

async function listReportsForUser(opts: { userId: string; limit?: number; before?: string }): Promise<any[]> {
  try {
    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.userId, opts.userId))
      .orderBy(desc(reports.generatedAt))
      .limit(Math.min(opts.limit ?? 30, 100));
    return (rows as any[]).map((r) => ({ ...r, summaryLine: (r.content as any)?.header?.summaryLine ?? "" }));
  } catch (err) {
    console.error("storage.listReportsForUser.error", { userId: opts.userId, err });
    return [];
  }
}

async function markReportRead(id: string, at?: Date): Promise<void> {
  try {
    await db.update(reports).set({ readAt: at ?? new Date() } as any).where(eq(reports.id, id));
  } catch (err) {
    console.error("storage.markReportRead.error", { id, err });
  }
}

async function markReportDismissed(id: string, at?: Date): Promise<void> {
  try {
    await db.update(reports).set({ dismissedAt: at ?? new Date() } as any).where(eq(reports.id, id));
  } catch (err) {
    console.error("storage.markReportDismissed.error", { id, err });
  }
}

export function attachReportStorage(storage: any): void {
  storage.insertReportJobOnConflictDoNothing = insertReportJobOnConflictDoNothing;
  storage.listDueReportJobs = listDueReportJobs;
  storage.listClaimableReportJobs = listDueReportJobs;
  storage.claimReportJob = claimReportJob;
  storage.updateReportJob = updateReportJob;
  storage.getReportForPeriod = getReportForPeriod;
  storage.getReportById = getReportById;
  storage.upsertReport = upsertReport;
  storage.listReportsForUser = listReportsForUser;
  storage.markReportRead = markReportRead;
  storage.markReportDismissed = markReportDismissed;
  storage.markReportDelivered = markReportDelivered;
  storage.unmarkReportDelivered = unmarkReportDelivered;

  // Sprint EST-1 / RF-04 — reusa a chatSession technical mais recente do user
  // (canal de chat dos relatorios) ou cria uma nova 'Relatorios'. tx opcional.
  storage.getOrCreateReportChatSession = async (
    userId: string,
    _tx?: any,
  ): Promise<{ id: string }> => {
    try {
      const rows = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.userId, userId),
            eq(chatSessions.coachType, "technical"),
            eq(chatSessions.status, "active"),
          ),
        )
        .orderBy(desc(chatSessions.updatedAt))
        .limit(1);
      const existing = (rows as any[])?.[0];
      if (existing?.id) {
        return { id: existing.id };
      }
      const created = await storage.createChatSession({
        userId,
        coachType: "technical",
        title: "Relatórios",
      });
      return { id: created.id };
    } catch (err) {
      console.error("storage.getOrCreateReportChatSession.error", { userId, err });
      throw err;
    }
  };

  // listNudgeLogForUser reusa listCoachAudit (AI-1A).
  storage.listNudgeLogForUser = async (opts: { userId: string; limit?: number }) => {
    try {
      const result = await storage.listCoachAudit?.(opts.userId, { limit: Math.min(opts.limit ?? 30, 100) });
      const items: any[] = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      return items.map((it) => ({
        id: it.id,
        category: it.category,
        status: it.status,
        title: it.title ?? it.titleI18n ?? null,
        bodyPreview: it.bodyPreview ?? it.body_preview ?? null,
        sentAt: it.sentAt ?? it.sent_at ?? it.createdAt ?? null,
        engagedAt: it.engagedAt ?? it.engaged_at ?? null,
        dismissedAt: it.dismissedAt ?? it.dismissed_at ?? null,
        snoozeUntil: it.snoozeUntil ?? it.snooze_until ?? null,
        chatSessionId: it.chatSessionId ?? it.chat_session_id ?? null,
        triggeredByEvent: it.triggeredByEvent ?? it.triggered_by_event ?? null,
      }));
    } catch (err) {
      console.error("storage.listNudgeLogForUser.error", { userId: opts.userId, err });
      return [];
    }
  };

  if (typeof storage.getUserSubscriptionPlan !== "function") {
    // Resolve por userPlatformId (USER-XXXX) — getUserById faz `WHERE users.user_platform_id = ?`
    // (storage.ts:7340). NUNCA getUser(userId) que faz `WHERE users.id = ?` (UUID) — nunca casa.
    storage.getUserSubscriptionPlan = async (userId: string): Promise<string> => {
      try {
        const u = typeof storage.getUserById === "function" ? await storage.getUserById(userId) : null;
        const plan = u?.subscriptionPlan ?? null;
        return typeof plan === "string" && plan.length > 0 ? plan : "free";
      } catch (err) {
        console.error("storage.getUserSubscriptionPlan.error", { userId, err });
        return "free";
      }
    };
  }
}
