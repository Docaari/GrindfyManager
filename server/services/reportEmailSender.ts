// =============================================================================
// reportEmailSender — Sprint AI-2B / RF-07.2 (ADR-172)
//
// Best-effort email delivery for weekly/monthly/quarterly reports. Reuses
// EmailService.getTransporter() (Gmail SMTP). Idempotency via email_log
// UNIQUE (report_id, kind).
//
// Lessons aplicadas: #9 (log antes do fallback), #34 (injectedStorage 3o arg).
// =============================================================================

import crypto from "node:crypto";
import { REPORT_DISCLAIMER } from "../coach/disclaimers";

export type EmailReportKind = "report_weekly" | "report_monthly" | "report_quarterly";

const PREF_BY_KIND: Record<EmailReportKind, string> = {
  report_weekly: "emailWeeklyEnabled",
  report_monthly: "emailMonthlyEnabled",
  report_quarterly: "emailQuarterlyEnabled",
};

const REPORT_TYPE_BY_KIND: Record<EmailReportKind, "weekly" | "monthly" | "quarterly"> = {
  report_weekly: "weekly",
  report_monthly: "monthly",
  report_quarterly: "quarterly",
};

export interface SendReportEmailArgs {
  reportId: string;
  userId: string;
  kind: EmailReportKind;
}

export interface SendReportEmailResult {
  status: "sent" | "skipped" | "failed";
  messageId?: string;
  error?: string;
}

const UNSUBSCRIBE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function buildUnsubscribeUrl(userId: string, kind: EmailReportKind, baseUrl: string): string {
  const expiresAt = Date.now() + UNSUBSCRIBE_TTL_MS;
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET_MISSING");
  }
  const hmac = crypto.createHmac("sha256", secret).update(`${userId}|${kind}|${expiresAt}`).digest("hex");
  const token = `${userId}.${kind}.${expiresAt}.${hmac}`;
  return `${baseUrl}/api/coach/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function isEligiblePlan(plan?: string | null): boolean {
  const p = String(plan ?? "").toLowerCase();
  return p === "trial" || p === "pro" || p === "premium" || p === "admin";
}

async function loadTemplate(kind: EmailReportKind): Promise<any> {
  if (kind === "report_weekly") return (await import("../emails/templates/weeklyReportEmail")).renderWeeklyReportEmail;
  if (kind === "report_monthly") return (await import("../emails/templates/monthlyReportEmail")).renderMonthlyReportEmail;
  return (await import("../emails/templates/quarterlyReportEmail")).renderQuarterlyReportEmail;
}

export async function sendReportEmail(
  args: SendReportEmailArgs,
  injectedStorage?: any,
): Promise<SendReportEmailResult> {
  const { reportId, userId, kind } = args;
  const storage = injectedStorage ?? (await import("../storage")).storage;

  // 1. Pref opt-in.
  let prefs: any = null;
  try {
    if (typeof storage.getUserCoachPreferences === "function") {
      prefs = await storage.getUserCoachPreferences(userId);
    } else {
      const { getCoachPreferences } = await import("../storage/coachPreferences");
      prefs = await getCoachPreferences(userId);
    }
  } catch (err) {
    console.error("sendReportEmail.prefs.error", { userId, kind, err: err instanceof Error ? err.message : String(err) });
    return { status: "failed", error: "prefs_read_failed" };
  }
  const prefField = PREF_BY_KIND[kind];
  if (!prefs?.[prefField]) {
    return { status: "skipped" };
  }

  // 2. User + tier elegibility.
  let user: any = null;
  try {
    user = typeof storage.getUserById === "function"
      ? await storage.getUserById(userId)
      : null;
  } catch (err) {
    console.error("sendReportEmail.user.error", { userId, err: err instanceof Error ? err.message : String(err) });
  }
  if (!user || !user.email) {
    return { status: "skipped" };
  }
  if (!isEligiblePlan(user.subscriptionPlan)) {
    return { status: "skipped" };
  }

  // 3. Report.
  let report: any = null;
  try {
    report = typeof storage.getReportById === "function"
      ? await storage.getReportById(reportId)
      : null;
  } catch (err) {
    console.error("sendReportEmail.report.error", { reportId, err: err instanceof Error ? err.message : String(err) });
  }
  if (!report) {
    return { status: "failed", error: "report_not_found" };
  }

  // 4. INSERT email_log pending (idempotência via UNIQUE).
  const insertEmailLog = storage.insertEmailLog
    ?? (await import("../storage/emailLogStorage")).insertEmailLog;
  const subject = `Seu relatorio ${REPORT_TYPE_BY_KIND[kind]} — Grindfy`;
  const logRow = await insertEmailLog({
    userId,
    reportId,
    kind,
    toEmail: user.email,
    subject,
  });
  if (!logRow) {
    return { status: "skipped", error: "already_sent_or_pending" };
  }

  // 5. Render template.
  const baseUrl = process.env.BASE_URL ?? "https://app.grindfy.com";
  const unsubscribeUrl = buildUnsubscribeUrl(userId, kind, baseUrl);
  const userName = user.firstName ?? user.email ?? "jogador";
  const content = report.content ?? {};
  if (!content.disclaimer) content.disclaimer = REPORT_DISCLAIMER;
  const renderer = await loadTemplate(kind);
  const rendered = renderer({ content, userName, unsubscribeUrl, baseUrl, reportId });

  // 6. Send.
  const updateEmailLog = storage.updateEmailLog
    ?? (await import("../storage/emailLogStorage")).updateEmailLog;
  try {
    const emailMod: any = await import("../emailService");
    const EmailServiceLocal = emailMod.EmailService ?? emailMod.default ?? null;
    if (!EmailServiceLocal || typeof EmailServiceLocal.getTransporter !== "function") {
      throw new Error("email_service_unavailable");
    }
    const transporter = EmailServiceLocal.getTransporter();
    const result = await transporter.sendMail({
      to: user.email,
      from: process.env.SMTP_FROM_ADDRESS ?? process.env.SMTP_USER ?? "no-reply@grindfy.com",
      subject: rendered.subject ?? subject,
      html: rendered.html,
      text: rendered.text,
    });
    await updateEmailLog(logRow.id, {
      status: "sent",
      sentAt: new Date(),
      messageId: result?.messageId ?? null,
    });
    return { status: "sent", messageId: result?.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sendReportEmail.send.error", { userId, kind, err: msg });
    try {
      await updateEmailLog(logRow.id, {
        status: "failed",
        errorMessage: msg.slice(0, 1000),
        attempts: (logRow.attempts ?? 0) + 1,
      });
    } catch (err2) {
      console.error("sendReportEmail.log.update.error", { err: err2 instanceof Error ? err2.message : String(err2) });
    }
    return { status: "failed", error: msg };
  }
}
