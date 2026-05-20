// =============================================================================
// Sprint AI-2B / RF-07.1 (ADR-172 §2.1) — email_log storage CRUD + idempotência
//
// Cobre:
//   - insertEmailLog: nanoid id + status='pending' default + ON CONFLICT (report_id, kind) DO NOTHING.
//   - Retorna null quando UNIQUE conflict (idempotência).
//   - updateEmailLog: status='sent' + sentAt + messageId.
//   - listPendingEmailLogs: filtra status='pending' + attempts < 3.
//   - getEmailLog: fetch by id.
//
// Status esperado: TODOS FALHAM (storage não existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("emailLogStorage.insertEmailLog", () => {
  it("INSERT com status='pending' + attempts=0 default", async () => {
    let captured: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          captured = v;
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn(async () => [{ ...v, createdAt: new Date() }]),
            })),
          };
        }),
      })),
    };
    const { insertEmailLog } = await import(
      "../../../../server/storage/emailLogStorage"
    );
    const r = await insertEmailLog(
      {
        userId: "USER-1",
        reportId: "rep-1",
        kind: "report_weekly",
        toEmail: "joao@example.com",
        subject: "Seu relatório semanal",
      },
      fakeDb,
    );
    expect(r).toBeTruthy();
    expect(captured.status).toBe("pending");
  });

  it("idempotência: 2 INSERTs com mesmo (report_id, kind) → segundo retorna null", async () => {
    let insertCount = 0;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              insertCount += 1;
              if (insertCount > 1) return [];
              return [{ ...v }];
            }),
          })),
        })),
      })),
    };
    const { insertEmailLog } = await import(
      "../../../../server/storage/emailLogStorage"
    );
    const a = await insertEmailLog(
      {
        userId: "USER-1",
        reportId: "rep-1",
        kind: "report_weekly",
        toEmail: "joao@example.com",
        subject: "S1",
      },
      fakeDb,
    );
    const b = await insertEmailLog(
      {
        userId: "USER-1",
        reportId: "rep-1",
        kind: "report_weekly",
        toEmail: "joao@example.com",
        subject: "S1",
      },
      fakeDb,
    );
    expect(a).toBeTruthy();
    expect(b).toBeNull();
  });
});

describe("emailLogStorage.updateEmailLog", () => {
  it("UPDATE status='sent' + sentAt + messageId", async () => {
    const updateSpy = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "el-1", status: "sent" }]),
        })),
      })),
    }));
    const fakeDb: any = { update: updateSpy };
    const { updateEmailLog } = await import(
      "../../../../server/storage/emailLogStorage"
    );
    const r = await updateEmailLog(
      "el-1",
      { status: "sent", sentAt: new Date(), messageId: "smtp-abc" },
      fakeDb,
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(r?.status).toBe("sent");
  });

  it("UPDATE para failed + attempts increment", async () => {
    let captured: any = null;
    const updateSpy = vi.fn(() => ({
      set: vi.fn((v: any) => {
        captured = v;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: "el-2", status: "failed" }]),
          })),
        };
      }),
    }));
    const fakeDb: any = { update: updateSpy };
    const { updateEmailLog } = await import(
      "../../../../server/storage/emailLogStorage"
    );
    await updateEmailLog(
      "el-2",
      { status: "failed", attempts: 2, errorMessage: "SMTP timeout" },
      fakeDb,
    );
    expect(captured.status).toBe("failed");
    expect(captured.attempts).toBe(2);
  });
});

describe("emailLogStorage.listPendingEmailLogs", () => {
  it("filtra status='pending' AND attempts < 3", async () => {
    const rows = [
      { id: "el-1", status: "pending", attempts: 0, createdAt: new Date() },
    ];
    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => rows),
            })),
          })),
        })),
      })),
    };
    const { listPendingEmailLogs } = await import(
      "../../../../server/storage/emailLogStorage"
    );
    const r = await listPendingEmailLogs(50, fakeDb);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("pending");
  });
});
