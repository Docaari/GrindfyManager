// =============================================================================
// Sprint AI-3 / RF-03 (ADR-174 §2.3) — Quarterly trigger updateCgameRecent
//
// Cobre:
//   - Após gather do cgameSnapshot no quarterly, o generator chama
//     updateCgameRecent(userId, snapshot) UMA vez (best-effort).
//   - Falha de updateCgameRecent NÃO faz quarterly falhar (log + segue).
//   - Snapshot persistido tem shape correto (aPct, bPct, cPct, sampleSize,
//     confidence, period.start, period.end, updatedAt).
//
// Status esperado: TODOS FALHAM (trigger ainda não wired no generator).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeStorage(overrides: any = {}): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 5000, tournaments: 80, buyInSum: 3000 })),
    listWarmupRitualsForRange: vi.fn(async () => [
      { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
      { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
      { emotionalCheckScore: 7, overrideUsed: false, decisionToPlay: true },
    ]),
    listMentalHandsForRange: vi.fn(async () => []),
    listActiveCareerGoals: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
    })),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-1" })),
    ...overrides,
  };
}

describe("generateQuarterlyReport — RF-03 trigger updateCgameRecent", () => {
  it("chama updateCgameRecent(userId, snapshot) UMA vez após gather do cgameSnapshot", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = makeStorage();
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(updateCgameRecentSpy).toHaveBeenCalledTimes(1);
    const call = updateCgameRecentSpy.mock.calls[0];
    expect(call[0]).toBe("USER-1");
    const snap = call[1];
    expect(typeof snap.aPct).toBe("number");
    expect(typeof snap.bPct).toBe("number");
    expect(typeof snap.cPct).toBe("number");
    expect(typeof snap.sampleSize).toBe("number");
    expect(["high", "medium", "low"]).toContain(snap.confidence);
    expect(typeof snap.period?.start).toBe("string");
    expect(typeof snap.period?.end).toBe("string");
    expect(typeof snap.updatedAt).toBe("string");

    errSpy.mockRestore();
  });

  it("snapshot persistido reflete period do trimestre (start = periodStart, end = periodEnd)", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = makeStorage();
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      injectedStorage: storage,
    });

    expect(updateCgameRecentSpy).toHaveBeenCalled();
    const snap = updateCgameRecentSpy.mock.calls[0][1];
    expect(snap.period.start).toBe("2026-04-01");
    expect(snap.period.end).toBe("2026-06-30");

    errSpy.mockRestore();
  });

  it("falha em updateCgameRecent NÃO derruba o quarterly (best-effort, log + segue)", async () => {
    const updateCgameRecentSpy = vi.fn(async () => {
      throw new Error("write failed");
    });
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = makeStorage();
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    // Falha do cgame persist NÃO sobe pro resultado.
    expect(r.content).toBeTruthy();
    expect(r.content.reportType).toBe("quarterly");
    // Mas o erro foi logado.
    expect(errSpy).toHaveBeenCalled();
    const matchedLog = errSpy.mock.calls.some((c) => String(c[0]).includes("cgame"));
    expect(matchedLog).toBe(true);
    errSpy.mockRestore();
  });
});
