// =============================================================================
// expireTickets — Sprint D / RF-03.1 + RF-03.2 (ADR-184)
//
// Housekeeping diario (03:00 UTC) — fora do gate COACH_NUDGES_ENABLED.
// Pipeline (ADR-184 §2.2):
//   1) SELECT expiringSoon (status='available', expires_at IN (now, now+48h])
//   2) SELECT justExpired (status='available', expires_at <= now)
//   3) UPDATE tickets SET status='expired' WHERE id IN justExpired AND status='available'
//   4) INSERT notif `ticket_expiring` (com dedupe 7d)
//   5) INSERT notif `ticket_expired` + telemetria `ticket_expired` em user_activity
//      (race protection §2.7: reconfirmExpiredTicketIds pre-INSERT)
//
// Lessons:
//   - #9 try/catch granular por INSERT (logue antes do fallback).
//   - #34 storage abstraction injected/lazy.
//   - #36 nada de import top-level de @shared/schema (storage cobre).
// =============================================================================

export interface ExpireTicketsTickResult {
  expired: number;
  notif_expiring: number;
  notif_expired: number;
  errors: number;
}

export interface ExpireTicketsTickOpts {
  now?: Date;
  /** Storage injetado para testes (lesson #34). Producao usa lazy import. */
  injectedStorage?: any;
}

const DEDUPE_WINDOW_DAYS = 7;
const MS_PER_HOUR = 1000 * 60 * 60;

function buildDeepLink(ticketId: string): string {
  return `/grade-planner#tickets&ticket_id=${ticketId}`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toValueUsd(t: any): number {
  return typeof t.valueUsd === "number" ? t.valueUsd : parseFloat(String(t.valueUsd)) || 0;
}

function hoursUntil(now: Date, expiresAt: Date | string): number {
  return Math.max(0, Math.round((toDate(expiresAt).getTime() - now.getTime()) / MS_PER_HOUR));
}

function formatExpiringBody(t: any, now: Date): string {
  const hrs = hoursUntil(now, t.expiresAt);
  return `Seu ticket para ${t.sourceName ?? "torneio"} (~$${toValueUsd(t).toFixed(2)}) expira em ${hrs}h. Use ou cancele antes.`;
}

function formatExpiredBody(t: any): string {
  const date = t.expiresAt ? toDate(t.expiresAt).toISOString().slice(0, 10) : "data desconhecida";
  return `Seu ticket para ${t.sourceName ?? "torneio"} (~$${toValueUsd(t).toFixed(2)}) expirou em ${date}.`;
}

export async function expireTicketsTick(
  opts: ExpireTicketsTickOpts = {}
): Promise<ExpireTicketsTickResult> {
  const now = opts.now ?? new Date();
  const result: ExpireTicketsTickResult = {
    expired: 0,
    notif_expiring: 0,
    notif_expired: 0,
    errors: 0,
  };

  let storage: any = opts.injectedStorage;
  if (!storage) {
    try {
      storage = (await import("../storage")).storage;
    } catch (err) {
      console.error("expireTicketsTick.storage_import.error", { err });
      result.errors++;
      return result;
    }
  }

  // FASE 1 — SELECTs
  let expiringSoon: any[] = [];
  let justExpired: any[] = [];
  try {
    expiringSoon = (await storage.getTicketsExpiringSoon?.(now)) ?? [];
  } catch (err) {
    console.error("expireTicketsTick.getTicketsExpiringSoon.error", { err });
    result.errors++;
  }
  try {
    justExpired = (await storage.getTicketsJustExpired?.(now)) ?? [];
  } catch (err) {
    console.error("expireTicketsTick.getTicketsJustExpired.error", { err });
    result.errors++;
  }

  // FASE 2 — UPDATE batch (idempotente — guard AND status='available' no storage)
  if (justExpired.length > 0) {
    try {
      const ids = justExpired.map((t) => t.id);
      const updated = await storage.markTicketsExpired?.(ids);
      result.expired = typeof updated === "number" ? updated : ids.length;
    } catch (err) {
      console.error("expireTicketsTick.markTicketsExpired.error", { err });
      result.errors++;
    }
  }

  // FASE 3 — INSERT notifs `ticket_expiring` (dedupe 7d)
  for (const t of expiringSoon) {
    try {
      const recent = await storage.hasRecentTicketNotif?.(
        t.userId,
        t.id,
        "ticket_expiring",
        DEDUPE_WINDOW_DAYS
      );
      if (recent === true) continue;
      await storage.createNotification?.({
        userId: t.userId,
        type: "ticket_expiring",
        priority: "medium",
        title: "Ticket expirando em breve",
        message: formatExpiringBody(t, now),
        deepLink: buildDeepLink(t.id),
      });
      result.notif_expiring++;
    } catch (err) {
      result.errors++;
      console.error("expireTicketsTick.notif_expiring.error", {
        ticket_id: t.id,
        err,
      });
    }
  }

  // FASE 4 — INSERT notifs `ticket_expired` (race protection + dedupe + telemetria)
  if (justExpired.length > 0) {
    let confirmedIds: string[] = justExpired.map((t) => t.id);
    try {
      const reconfirmed = await storage.reconfirmExpiredTicketIds?.(confirmedIds);
      if (Array.isArray(reconfirmed)) confirmedIds = reconfirmed;
    } catch (err) {
      console.error("expireTicketsTick.reconfirmExpiredTicketIds.error", { err });
      result.errors++;
    }
    const confirmedSet = new Set(confirmedIds);
    for (const t of justExpired) {
      if (!confirmedSet.has(t.id)) continue;
      try {
        const recent = await storage.hasRecentTicketNotif?.(
          t.userId,
          t.id,
          "ticket_expired",
          DEDUPE_WINDOW_DAYS
        );
        if (recent === true) continue;
        await storage.createNotification?.({
          userId: t.userId,
          type: "ticket_expired",
          priority: "medium",
          title: "Ticket expirou",
          message: formatExpiredBody(t),
          deepLink: buildDeepLink(t.id),
        });
        result.notif_expired++;
        // Telemetria RF-03.5 (ADR-184 §2.5)
        try {
          await storage.recordUserActivity?.({
            userId: t.userId,
            eventType: "ticket_expired",
            payload: {
              ticket_id: t.id,
              value_usd: toValueUsd(t),
              source_name: t.sourceName ?? null,
            },
          });
        } catch (telErr) {
          console.error("expireTicketsTick.recordUserActivity.error", {
            ticket_id: t.id,
            err: telErr,
          });
          // telemetria nao afeta result.errors do INSERT principal
        }
      } catch (err) {
        result.errors++;
        console.error("expireTicketsTick.notif_expired.error", {
          ticket_id: t.id,
          err,
        });
      }
    }
  }

  console.info("coach.cron.expire_tickets.done", result);
  return result;
}
