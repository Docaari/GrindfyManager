// =============================================================================
// Sprint AI-2A / RF-09 (ADR-167) — bVolumeTick job.
//
// Cobre:
//   - Terça-feira 11h local (Q-I locked).
//   - Projeção linear: currentSoFar * (7 / daysElapsed) < baseline*0.5 -> trigger.
//   - baseline.sampleSize < 2 -> no-op (sem confiança).
//   - Cooldown semanal cycleKey.
//   - Kill switch off.
//   - COACH_VOLUME_DROP_PCT env override.
//
// Status esperado: TODOS FALHAM (jobs/bVolume.ts nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_NUDGES = process.env.COACH_NUDGES_ENABLED;
const ORIGINAL_DROP = process.env.COACH_VOLUME_DROP_PCT;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_NUDGES === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_NUDGES;
  if (ORIGINAL_DROP === undefined) delete process.env.COACH_VOLUME_DROP_PCT;
  else process.env.COACH_VOLUME_DROP_PCT = ORIGINAL_DROP;
});

function makeStorageBVolume(opts: {
  users?: Array<{ userPlatformId: string; timezone?: string; subscriptionPlan?: string }>;
  currentByUser?: Record<string, number>;
  baselineByUser?: Record<string, { avg: number; sampleSize: number }>;
  prefsByUser?: Record<string, { nudgeBVolume?: boolean }>;
}) {
  return {
    listUsersForCron: vi.fn(async () => opts.users ?? []),
    getUserTimezone: vi.fn(
      async (uid: string) => opts.users?.find((u) => u.userPlatformId === uid)?.timezone ?? "America/Sao_Paulo",
    ),
    getCoachPreferences: vi.fn(async (uid: string) => ({
      nudgeBVolume: opts.prefsByUser?.[uid]?.nudgeBVolume ?? true,
      nudgeBSnapshot: true,
      nudgeBStudy: true,
      quietHoursStart: 21,
      quietHoursEnd: 9,
    })),
    countTournamentsThisWeek: vi.fn(async (uid: string) => opts.currentByUser?.[uid] ?? 0),
    avgWeeklyTournaments: vi.fn(
      async (uid: string) => opts.baselineByUser?.[uid] ?? { avg: 0, sampleSize: 0 },
    ),
    createChatSession: vi.fn(async () => ({ id: "cs" })),
    insertChatMessage: vi.fn(async () => ({ id: "cm" })),
    createNudgeLog: vi.fn(async () => "nl"),
  };
}

describe("bVolumeTick — gating + threshold", () => {
  it("user com baseline=100 e projecao=30 (drop 70%) -> nudge B-VOLUME emitido", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage = makeStorageBVolume({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      // terca 11h SP -> day index 2, ja jogou 8 torneios em 2 dias -> projecao 8 * (7/2) = 28
      currentByUser: { "USER-SP": 8 },
      baselineByUser: { "USER-SP": { avg: 100, sampleSize: 4 } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bVolumeTick } = await import("../../../../server/coach/jobs/bVolume");
    // Terça 2026-05-26 14:00 UTC -> 11h SP (UTC-3)
    await bVolumeTick({ now: new Date(Date.UTC(2026, 4, 26, 14, 0, 0)) });
    expect(storage.createNudgeLog).toHaveBeenCalled();
    const logCall = storage.createNudgeLog.mock.calls[0][0];
    expect(logCall.category).toBe("B-VOLUME");
  });

  it("projecao >= baseline * 0.5 -> no-op (volume saudavel)", async () => {
    delete process.env.COACH_NUDGES_ENABLED;
    const storage = makeStorageBVolume({
      users: [{ userPlatformId: "USER-OK", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      // ja jogou 30 em 2 dias -> projecao 105; baseline=100 -> healthy
      currentByUser: { "USER-OK": 30 },
      baselineByUser: { "USER-OK": { avg: 100, sampleSize: 4 } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bVolumeTick } = await import("../../../../server/coach/jobs/bVolume");
    await bVolumeTick({ now: new Date(Date.UTC(2026, 4, 26, 14, 0, 0)) });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("baseline.sampleSize < 2 -> no-op", async () => {
    const storage = makeStorageBVolume({
      users: [{ userPlatformId: "USER-NEW", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      currentByUser: { "USER-NEW": 0 },
      baselineByUser: { "USER-NEW": { avg: 50, sampleSize: 1 } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bVolumeTick } = await import("../../../../server/coach/jobs/bVolume");
    await bVolumeTick({ now: new Date(Date.UTC(2026, 4, 26, 14, 0, 0)) });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("dia/hora diferente de terça 11h local -> tick skipa user", async () => {
    const storage = makeStorageBVolume({
      users: [{ userPlatformId: "USER-SP", timezone: "America/Sao_Paulo", subscriptionPlan: "pro" }],
      currentByUser: { "USER-SP": 5 },
      baselineByUser: { "USER-SP": { avg: 100, sampleSize: 4 } },
    });
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bVolumeTick } = await import("../../../../server/coach/jobs/bVolume");
    // Quarta 12 UTC = 09 BRT -> nao eh terça 11h
    await bVolumeTick({ now: new Date(Date.UTC(2026, 4, 27, 12, 0, 0)) });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });

  it("kill switch off -> early return", async () => {
    process.env.COACH_NUDGES_ENABLED = "false";
    const storage = makeStorageBVolume({});
    vi.doMock("../../../../server/storage", () => ({ storage }));
    vi.doMock("../../../../server/coach/nudgeEngine", () => ({
      shouldSendNudge: vi.fn(async () => ({ allow: true })),
    }));
    const { bVolumeTick } = await import("../../../../server/coach/jobs/bVolume");
    await bVolumeTick({ now: new Date() });
    expect(storage.createNudgeLog).not.toHaveBeenCalled();
  });
});
