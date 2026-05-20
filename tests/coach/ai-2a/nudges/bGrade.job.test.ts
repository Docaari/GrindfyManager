// =============================================================================
// Sprint AI-2A / RF-10 (ADR-167) — bGradeTick job.
//
// Cobre:
//   - Domingo 18h local (Q-I locked, founder aceitou over "sábado" canônico).
//   - planned próxima semana < 3 -> nudge B-GRADE emitido.
//   - planned >= 3 -> no-op.
//   - Aderencia da semana passada incluída no body quando getGradeAdherenceForWeek retorna dado.
//   - Kill switch off.
//
// Status esperado: TODOS FALHAM (jobs/bGrade.ts nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
});

function makeStorageBGrade(opts: {
  users?: Array<{ userPlatformId: string; timezone?: string; subscriptionPlan?: string }>;
  plannedByUser?: Record<string, number>;
  adherenceByUser?: Record<string, { planned: number; played: number; adherencePct: number }>;
  prefsByUser?: Record<string, { nudgeBGrade?: boolean }>;
}) {
  return {
    listUsersForCron: vi.fn(async () => opts.users ?? []),
    getUserTimezone: vi.fn(
      async (uid: string) => opts.users?.find((u) => u.userPlatformId === uid)?.timezone ?? "America/Sao_Paulo",
    ),
    getCoachPreferences: vi.fn(async (uid: string) => ({
      nudgeBGrade: opts.prefsByUser?.[uid]?.nudgeBGrade ?? true,
      nudgeBSnapshot: true,
      nudgeBStudy: true,
      quietHoursStart: 21,
      quietHoursEnd: 9,
    })),
    countPlannedTournamentsForWeek: vi.fn(async (uid: string) => opts.plannedByUser?.[uid] ?? 0),
    getGradeAdherenceForWeek: vi.fn(async (uid: string) => opts.adherenceByUser?.[uid] ?? null),
    createChatSession: vi.fn(async () => ({ id: "cs" })),
    insertChatMessage: vi.fn(async () => ({ id: "cm" })),
    createNudgeLog: vi.fn(async () => "nl"),
  };
}

describe("bGradeTick — domingo 18h local + planned threshold", () => {
  it("planned proxima semana = 0 -> nudge emitido", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage = makeStorageBGrade({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      plannedByUser: { "USER-SP": 0 },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bGradeTick } = await import("../../../../server/coach/jobs/bGrade");
    // Domingo 2026-05-24 21:00 UTC -> 18h BRT (UTC-3)
    await bGradeTick({ now: new Date(Date.UTC(2026, 4, 24, 21, 0, 0)) });
    expect(storage.createNudgeLog).toHaveBeenCalled();
    const logCall = storage.createNudgeLog.mock.calls[0][0];
    expect(logCall.category).toBe("B-GRADE");
  });

  it("planned >= 3 -> no-op (grade nao vazia)", async () => {
    const storage = makeStorageBGrade({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      plannedByUser: { "USER-SP": 5 },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bGradeTick } = await import("../../../../server/coach/jobs/bGrade");
    await bGradeTick({ now: new Date(Date.UTC(2026, 4, 24, 21, 0, 0)) });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("dia/hora diferente de domingo 18h -> skip user", async () => {
    const storage = makeStorageBGrade({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      plannedByUser: { "USER-SP": 0 },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bGradeTick } = await import("../../../../server/coach/jobs/bGrade");
    // Sabado, nao domingo
    await bGradeTick({ now: new Date(Date.UTC(2026, 4, 23, 21, 0, 0)) });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("aderencia da semana passada incluída no body quando disponivel", async () => {
    const storage = makeStorageBGrade({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      plannedByUser: { "USER-SP": 1 },
      adherenceByUser: { "USER-SP": { planned: 10, played: 4, adherencePct: 40 } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bGradeTick } = await import("../../../../server/coach/jobs/bGrade");
    await bGradeTick({ now: new Date(Date.UTC(2026, 4, 24, 21, 0, 0)) });
    expect(storage.createNudgeLog).toHaveBeenCalled();
    const logCall = storage.createNudgeLog.mock.calls[0][0];
    // body deve mencionar aderencia 40%
    const body = String(logCall.bodyPreview ?? logCall.body ?? "");
    expect(body).toMatch(/40/);
  });

  it("kill switch off -> early return", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const storage = makeStorageBGrade({});
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bGradeTick } = await import("../../../../server/coach/jobs/bGrade");
    await bGradeTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});
