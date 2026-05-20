// =============================================================================
// Sprint AI-2B / RF-07.2 (ADR-172 §2.2) — sendReportEmail helper
//
// Cobre:
//   - Happy path: opt-in ligado + tier elegível → INSERT email_log pending →
//     EmailService.getTransporter().sendMail → UPDATE status='sent' + messageId.
//   - Opt-in OFF → skip silencioso (sem email_log row).
//   - Tier ineligible (free) → skip silencioso.
//   - SMTP throw → email_log status='failed' + attempts+1 + log antes (lesson #9).
//   - Idempotência: UNIQUE conflict (insertEmailLog null) → skip 'already_sent_or_pending'.
//   - nodemailer mockado (não envia email real).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendReportEmail — happy path", () => {
  it("opt-in ON + Pro+ → email_log 'sent' + messageId retornado", async () => {
    const sendMailSpy = vi.fn(async () => ({ messageId: "<smtp-123@gmail>" }));
    const transporterMock = { sendMail: sendMailSpy };
    vi.doMock("../../../../server/emailService", () => ({
      EmailService: { getTransporter: vi.fn(() => transporterMock) },
      default: { getTransporter: vi.fn(() => transporterMock) },
    }));
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({
        emailWeeklyEnabled: true,
      })),
      getUserById: vi.fn(async () => ({
        userPlatformId: "USER-1",
        email: "joao@example.com",
        firstName: "João",
        subscriptionPlan: "trial",
      })),
      getReportById: vi.fn(async () => ({
        id: "rep-1",
        content: { reportType: "weekly", periodStart: "2026-05-13", periodEnd: "2026-05-19" },
        markdown: "## Resumo\n...",
      })),
      insertEmailLog: vi.fn(async (payload: any) => ({ ...payload, id: "el-1" })),
      updateEmailLog: vi.fn(async () => undefined),
    };
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    const r = await sendReportEmail(
      { reportId: "rep-1", userId: "USER-1", kind: "report_weekly" },
      injectedStorage,
    );
    expect(r.status).toBe("sent");
    expect(r.messageId).toMatch(/smtp-123/);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    expect(injectedStorage.updateEmailLog).toHaveBeenCalledWith(
      "el-1",
      expect.objectContaining({ status: "sent" }),
    );
  });
});

describe("sendReportEmail — opt-in OFF", () => {
  it("emailWeeklyEnabled=false → status='skipped' sem email_log row", async () => {
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({
        emailWeeklyEnabled: false,
      })),
      insertEmailLog: vi.fn(),
    };
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    const r = await sendReportEmail(
      { reportId: "rep-1", userId: "USER-1", kind: "report_weekly" },
      injectedStorage,
    );
    expect(r.status).toBe("skipped");
    expect(injectedStorage.insertEmailLog).not.toHaveBeenCalled();
  });
});

describe("sendReportEmail — tier ineligible", () => {
  it("Free com opt-in ON → revalida tier → skipped", async () => {
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({
        emailWeeklyEnabled: true,
      })),
      getUserById: vi.fn(async () => ({
        userPlatformId: "USER-FREE",
        email: "free@example.com",
        subscriptionPlan: "free",
      })),
      insertEmailLog: vi.fn(),
    };
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    const r = await sendReportEmail(
      { reportId: "rep-1", userId: "USER-FREE", kind: "report_weekly" },
      injectedStorage,
    );
    expect(r.status).toBe("skipped");
    expect(injectedStorage.insertEmailLog).not.toHaveBeenCalled();
  });
});

describe("sendReportEmail — SMTP throw", () => {
  it("transporter.sendMail throws → email_log status='failed' + log antes", async () => {
    const sendMailSpy = vi.fn(async () => {
      throw new Error("SMTP connection refused");
    });
    const transporterMock = { sendMail: sendMailSpy };
    vi.doMock("../../../../server/emailService", () => ({
      EmailService: { getTransporter: vi.fn(() => transporterMock) },
      default: { getTransporter: vi.fn(() => transporterMock) },
    }));
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({ emailWeeklyEnabled: true })),
      getUserById: vi.fn(async () => ({
        userPlatformId: "USER-1",
        email: "joao@example.com",
        subscriptionPlan: "trial",
      })),
      getReportById: vi.fn(async () => ({
        id: "rep-1",
        content: { reportType: "weekly", periodStart: "2026-05-13", periodEnd: "2026-05-19" },
        markdown: "x",
      })),
      insertEmailLog: vi.fn(async (p: any) => ({ ...p, id: "el-1" })),
      updateEmailLog: vi.fn(async () => undefined),
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    const r = await sendReportEmail(
      { reportId: "rep-1", userId: "USER-1", kind: "report_weekly" },
      injectedStorage,
    );
    expect(r.status).toBe("failed");
    expect(injectedStorage.updateEmailLog).toHaveBeenCalledWith(
      "el-1",
      expect.objectContaining({ status: "failed" }),
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("sendReportEmail — idempotência", () => {
  it("UNIQUE conflict (insertEmailLog null) → skipped 'already_sent_or_pending'", async () => {
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({ emailWeeklyEnabled: true })),
      getUserById: vi.fn(async () => ({
        userPlatformId: "USER-1",
        email: "joao@example.com",
        subscriptionPlan: "trial",
      })),
      getReportById: vi.fn(async () => ({
        id: "rep-1",
        content: { reportType: "weekly", periodStart: "2026-05-13", periodEnd: "2026-05-19" },
        markdown: "x",
      })),
      insertEmailLog: vi.fn(async () => null), // UNIQUE conflict
    };
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    const r = await sendReportEmail(
      { reportId: "rep-1", userId: "USER-1", kind: "report_weekly" },
      injectedStorage,
    );
    expect(r.status).toBe("skipped");
    expect(r.error).toMatch(/already/i);
  });
});

describe("sendReportEmail — unsubscribe URL incluída no body", () => {
  it("unsubscribeUrl é construída com HMAC e passada ao template", async () => {
    const sendMailSpy = vi.fn(async () => ({ messageId: "msg-1" }));
    const transporterMock = { sendMail: sendMailSpy };
    vi.doMock("../../../../server/emailService", () => ({
      EmailService: { getTransporter: vi.fn(() => transporterMock) },
      default: { getTransporter: vi.fn(() => transporterMock) },
    }));
    const injectedStorage: any = {
      getUserCoachPreferences: vi.fn(async () => ({ emailWeeklyEnabled: true })),
      getUserById: vi.fn(async () => ({
        userPlatformId: "USER-1",
        email: "joao@example.com",
        subscriptionPlan: "trial",
      })),
      getReportById: vi.fn(async () => ({
        id: "rep-1",
        content: { reportType: "weekly", periodStart: "2026-05-13", periodEnd: "2026-05-19" },
        markdown: "x",
      })),
      insertEmailLog: vi.fn(async (p: any) => ({ ...p, id: "el-1" })),
      updateEmailLog: vi.fn(async () => undefined),
    };
    const { sendReportEmail } = await import(
      "../../../../server/services/reportEmailSender"
    );
    await sendReportEmail(
      { reportId: "rep-1", userId: "USER-1", kind: "report_weekly" },
      injectedStorage,
    );
    const sentMail = sendMailSpy.mock.calls[0][0];
    expect(sentMail.html).toContain("unsubscribe");
  });
});
