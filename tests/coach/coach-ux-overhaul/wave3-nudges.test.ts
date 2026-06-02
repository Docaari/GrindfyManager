// =============================================================================
// Wave 3 (#7) — ticks B-MENTAL + B-LIFE (opt-in, default off).
// B-MENTAL: C-game recorrente (getAbGameDistribution.cGameEntryCount >= min).
// B-LIFE: volume sem folga (dias distintos jogados nos ultimos 7 >= min).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
});

function commonMocks(storage: any) {
  vi.doMock("../../../server/storage", () => ({ storage }));
  vi.doMock("../../../server/coach/nudgeEngine", () => ({
    shouldSendNudge: vi.fn(async () => ({ allow: true })),
  }));
  vi.doMock("../../../server/coach/planEligibility", () => ({
    isProPlusEligible: vi.fn(async () => true),
    LIST_USERS_FOR_CRON_PRO_PLUS: "plan",
  }));
}

describe("bMentalTick — C-game recorrente", () => {
  it("cGameEntryCount >= min -> nudge B-MENTAL emitido", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-1", timezone: "America/Sao_Paulo", subscriptionPlan: "admin" }]),
      getAbGameDistribution: vi.fn(async () => ({ cGameEntryCount: 3, cGameThemes: [{ token: "icm", count: 2 }] })),
      createChatSession: vi.fn(async () => ({ id: "cs" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm" })),
      createNudgeLog: vi.fn(async () => "nl"),
    };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 20 }));
    const { bMentalTick } = await import("../../../server/coach/jobs/bMental");
    await bMentalTick({ now: new Date("2026-05-20T23:00:00Z") });
    expect(storage.createNudgeLog).toHaveBeenCalledTimes(1);
    expect(storage.createNudgeLog.mock.calls[0][0].category).toBe("B-MENTAL");
  });

  it("cGameEntryCount < min -> no-op", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-1", subscriptionPlan: "admin" }]),
      getAbGameDistribution: vi.fn(async () => ({ cGameEntryCount: 1, cGameThemes: [] })),
      createNudgeLog: vi.fn(async () => "nl"),
    };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 20 }));
    const { bMentalTick } = await import("../../../server/coach/jobs/bMental");
    await bMentalTick({ now: new Date("2026-05-20T23:00:00Z") });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("COACH_NUDGES_ENABLED=false -> early return", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const storage: any = { listUsersForCron: vi.fn(async () => []), createNudgeLog: vi.fn() };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 20 }));
    const { bMentalTick } = await import("../../../server/coach/jobs/bMental");
    await bMentalTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
    expect(storage.listUsersForCron).not.toHaveBeenCalled();
  });

  it("hora local != 20 -> nao cobra esse user", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-1", subscriptionPlan: "admin" }]),
      getAbGameDistribution: vi.fn(async () => ({ cGameEntryCount: 9 })),
      createNudgeLog: vi.fn(async () => "nl"),
    };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 13 }));
    const { bMentalTick } = await import("../../../server/coach/jobs/bMental");
    await bMentalTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});

describe("bLifeTick — volume sem folga", () => {
  function sessionsForDays(days: string[]) {
    return days.map((d, i) => ({ id: `s${i}`, date: d, status: "completed" }));
  }

  it(">= min dias distintos nos ultimos 7 -> nudge B-LIFE", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const days = ["2026-05-20", "2026-05-19", "2026-05-18", "2026-05-17", "2026-05-16", "2026-05-15"];
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-1", subscriptionPlan: "admin" }]),
      getGrindSessions: vi.fn(async () => sessionsForDays(days)),
      createChatSession: vi.fn(async () => ({ id: "cs" })),
      insertChatMessage: vi.fn(async () => ({ id: "cm" })),
      createNudgeLog: vi.fn(async () => "nl"),
    };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 11 }));
    const { bLifeTick } = await import("../../../server/coach/jobs/bLife");
    await bLifeTick({ now: new Date("2026-05-20T14:00:00Z") });
    expect(storage.createNudgeLog).toHaveBeenCalledTimes(1);
    expect(storage.createNudgeLog.mock.calls[0][0].category).toBe("B-LIFE");
  });

  it("< min dias -> no-op", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const days = ["2026-05-20", "2026-05-19", "2026-05-18"];
    const storage: any = {
      listUsersForCron: vi.fn(async () => [{ userPlatformId: "USER-1", subscriptionPlan: "admin" }]),
      getGrindSessions: vi.fn(async () => sessionsForDays(days)),
      createNudgeLog: vi.fn(async () => "nl"),
    };
    commonMocks(storage);
    vi.doMock("../../../server/coach/timezone", () => ({ getLocalHour: () => 11 }));
    const { bLifeTick } = await import("../../../server/coach/jobs/bLife");
    await bLifeTick({ now: new Date("2026-05-20T14:00:00Z") });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});
