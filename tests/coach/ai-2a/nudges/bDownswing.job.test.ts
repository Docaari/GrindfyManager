// =============================================================================
// Sprint AI-2A / RF-08 (ADR-167) — bDownswingTick job.
//
// Cobre:
//   - bDownswingTick({ now, injectedStorage? }) hourly.
//   - Kill switch COACH_NUDGES_ENABLED=false -> early return.
//   - drawdownPct >= 15% (default) -> nudge emitido via shouldSendNudge.
//   - drawdownPct 14.9% -> no-op.
//   - sampleConfidence='low' -> skip user.
//   - Cooldown semanal cycleKey='YYYY-WW' (1/semana).
//   - Erro em 1 user nao trava os outros (lesson #9 try/catch).
//   - Gated por LIST_USERS_FOR_CRON_PRO_PLUS.
//   - Toggle nudgeBDownswing=false -> skip user.
//
// Status esperado: TODOS FALHAM (jobs/bDownswing.ts nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_THRESHOLD = process.env.COACH_DOWNSWING_DRAWDOWN_PCT;
const ORIGINAL_WINDOW = process.env.COACH_DOWNSWING_WINDOW_DAYS;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_THRESHOLD === undefined) delete process.env.COACH_DOWNSWING_DRAWDOWN_PCT;
  else process.env.COACH_DOWNSWING_DRAWDOWN_PCT = ORIGINAL_THRESHOLD;
  if (ORIGINAL_WINDOW === undefined) delete process.env.COACH_DOWNSWING_WINDOW_DAYS;
  else process.env.COACH_DOWNSWING_WINDOW_DAYS = ORIGINAL_WINDOW;
});

function makeStorageDownswing(opts: {
  users?: Array<{ userPlatformId: string; timezone?: string; subscriptionPlan?: string }>;
  drawdownByUser?: Record<string, { drawdownPct: number; refBankrollUsd: number; currentBankrollUsd: number; sampleConfidence?: "high" | "low" } | null>;
  prefsByUser?: Record<string, { nudgeBDownswing?: boolean }>;
}) {
  return {
    listUsersForCron: vi.fn(async () => opts.users ?? []),
    getUserTimezone: vi.fn(async () => "America/Sao_Paulo"),
    getUserSubscriptionPlan: vi.fn(async (uid: string) =>
      (opts.users ?? []).find((u) => u.userPlatformId === uid)?.subscriptionPlan ?? "pro",
    ),
    getCoachPreferences: vi.fn(async (uid: string) => ({
      nudgeBDownswing: opts.prefsByUser?.[uid]?.nudgeBDownswing ?? true,
      nudgeBSnapshot: true,
      nudgeBStudy: true,
      quietHoursStart: 21,
      quietHoursEnd: 9,
    })),
    getDrawdownInWindow: vi.fn(async (uid: string) => opts.drawdownByUser?.[uid] ?? null),
    createChatSession: vi.fn(async () => ({ id: "cs-1" })),
    insertChatMessage: vi.fn(async () => ({ id: "cm-1" })),
    createNudgeLog: vi.fn(async () => "nl-1"),
  };
}

describe("bDownswingTick — kill switch", () => {
  it("COACH_NUDGES_ENABLED=false -> early return + nada criado", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const storage = makeStorageDownswing({});
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});

describe("bDownswingTick — trigger threshold", () => {
  it("drawdownPct >= 15% -> nudge emitido com category=B-DOWNSWING", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage = makeStorageDownswing({
      users: [{ userPlatformId: "USER-1", subscriptionPlan: "pro" }],
      drawdownByUser: {
        "USER-1": { drawdownPct: 20, refBankrollUsd: 1000, currentBankrollUsd: 800, sampleConfidence: "high" },
      },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    const shouldSendNudge = vi.fn(async () => ({ allow: true }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({ shouldSendNudge }));

    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date(Date.UTC(2026, 4, 20, 12, 0, 0)) });

    expect(storage.createNudgeLog).toHaveBeenCalled();
    const logCall = storage.createNudgeLog.mock.calls[0][0];
    expect(logCall.category).toBe("B-DOWNSWING");
    expect(logCall.userId).toBe("USER-1");
  });

  it("drawdownPct 14.9 -> no-op", async () => {
    const storage = makeStorageDownswing({
      users: [{ userPlatformId: "USER-1", subscriptionPlan: "pro" }],
      drawdownByUser: {
        "USER-1": { drawdownPct: 14.9, refBankrollUsd: 1000, currentBankrollUsd: 851, sampleConfidence: "high" },
      },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("sampleConfidence='low' -> skip user", async () => {
    const storage = makeStorageDownswing({
      users: [{ userPlatformId: "USER-1", subscriptionPlan: "pro" }],
      drawdownByUser: {
        "USER-1": { drawdownPct: 50, refBankrollUsd: 100, currentBankrollUsd: 50, sampleConfidence: "low" },
      },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("toggle nudgeBDownswing=false -> skip", async () => {
    const storage = makeStorageDownswing({
      users: [{ userPlatformId: "USER-1", subscriptionPlan: "pro" }],
      drawdownByUser: {
        "USER-1": { drawdownPct: 30, refBankrollUsd: 1000, currentBankrollUsd: 700, sampleConfidence: "high" },
      },
      prefsByUser: { "USER-1": { nudgeBDownswing: false } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("erro em 1 user nao trava os outros (lesson #9)", async () => {
    let calls = 0;
    const storage = makeStorageDownswing({
      users: [
        { userPlatformId: "USER-FAIL", subscriptionPlan: "pro" },
        { userPlatformId: "USER-OK", subscriptionPlan: "pro" },
      ],
      drawdownByUser: {
        "USER-OK": { drawdownPct: 25, refBankrollUsd: 1000, currentBankrollUsd: 750, sampleConfidence: "high" },
      },
    });
    storage.getDrawdownInWindow = vi.fn(async (uid: string) => {
      calls++;
      if (uid === "USER-FAIL") throw new Error("boom");
      return { drawdownPct: 25, refBankrollUsd: 1000, currentBankrollUsd: 750, sampleConfidence: "high" };
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(calls).toBeGreaterThanOrEqual(2);
    // USER-OK ainda foi processado
    const logCalls = (storage.createNudgeLog.mock.calls as any[]).map((c) => c[0]);
    expect(logCalls.some((c) => c.userId === "USER-OK")).toBe(true);
    errSpy.mockRestore();
  });

  it("shouldSendNudge bloqueia (cooldown) -> nao persiste", async () => {
    const storage = makeStorageDownswing({
      users: [{ userPlatformId: "USER-1", subscriptionPlan: "pro" }],
      drawdownByUser: {
        "USER-1": { drawdownPct: 22, refBankrollUsd: 1000, currentBankrollUsd: 780, sampleConfidence: "high" },
      },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: false, reason: "already_sent_this_cycle" })),
    }));
    const { bDownswingTick } = await import("../../../../server/coach/jobs/bDownswing");
    await bDownswingTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});
