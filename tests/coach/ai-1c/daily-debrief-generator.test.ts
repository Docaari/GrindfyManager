// =============================================================================
// Sprint AI-1C / RF-03 — smoke tests para generateDailyDebrief.
// Foco: deterministic skeleton (sem LLM) — content shape + sessionSummary +
// followUp. LLM coberto separadamente em testes de integracao.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  // Sem key -> generator vai pelo path deterministic + degraded.
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeMockStorage(sessions: any[] = [], tourneysBySession: Record<string, any[]> = {}): any {
  return {
    getGrindSessions: vi.fn(async () => sessions),
    getSessionTournaments: vi.fn(async (sessionId: string) => tourneysBySession[sessionId] ?? []),
    listSpotScreenshotsForSession: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
  };
}

describe("generateDailyDebrief — sem sessao no dia (#12 debrief inteligente)", () => {
  // Coach AI UX Overhaul #12: por padrao (threshold=1) uma sessao trivial / 0
  // torneios NAO vira relatorio (suppressed) — corta o spam pro grinder de alto
  // volume. O reportJobRunner marca o job 'skipped' sem persistir.
  it("0 torneios -> suppressed=true, status='skipped', sem content (default threshold=1)", async () => {
    const prev = process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS;
    delete process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS;
    const storage = makeMockStorage([]);
    const { generateDailyDebrief } = await import("../../../server/services/dailyDebriefGenerator");
    const r = await generateDailyDebrief({
      userId: "USER-1",
      periodStart: "2026-05-20",
      injectedStorage: storage,
    });
    expect(r.suppressed).toBe(true);
    expect(r.status).toBe("skipped");
    expect(r.content).toBeUndefined();
    expect(r.costUsdEstimate).toBe(0);
    if (prev === undefined) delete process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS;
    else process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS = prev;
  });

  it("COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS=0 restaura o debrief 'ready' (back-compat)", async () => {
    const prev = process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS;
    process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS = "0";
    const storage = makeMockStorage([]);
    const { generateDailyDebrief } = await import("../../../server/services/dailyDebriefGenerator");
    const r = await generateDailyDebrief({
      userId: "USER-1",
      periodStart: "2026-05-20",
      injectedStorage: storage,
    });
    expect(r.suppressed).toBeFalsy();
    expect(r.content?.reportType).toBe("daily");
    expect(r.content?.dataSufficiency).toBe("low");
    expect(r.content?.sessionSummary?.tournamentsCount).toBe(0);
    expect(r.status).toBe("ready");
    expect(r.costUsdEstimate).toBe(0);
    if (prev === undefined) delete process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS;
    else process.env.COACH_DAILY_DEBRIEF_MIN_TOURNAMENTS = prev;
  });
});

describe("generateDailyDebrief — sessao com torneios (sem ANTHROPIC_API_KEY)", () => {
  it("agrega sessionSummary; status='degraded' degradedReason='no_anthropic_key'", async () => {
    const sessions = [
      { id: "s1", date: "2026-05-20", status: "completed" },
    ];
    const tourneys = {
      s1: [
        { buyIn: 10, prizeUsd: 50, position: 1, fieldSize: 100, finalTable: true, currency: "USD", profit: 40 },
        { buyIn: 22, prizeUsd: 0, position: 50, fieldSize: 200, currency: "USD", profit: -22 },
      ],
    };
    const storage = makeMockStorage(sessions, tourneys);
    // Mock SDK pra clientUnavailable.
    vi.doMock("@anthropic-ai/sdk", () => ({ default: function FakeAnthropic() { return null; } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateDailyDebrief } = await import("../../../server/services/dailyDebriefGenerator");
    const r = await generateDailyDebrief({
      userId: "USER-1",
      periodStart: "2026-05-20",
      injectedStorage: storage,
    });
    expect(r.content.dataSufficiency).toBe("ok");
    expect(r.content.sessionSummary?.sessionsCount).toBe(1);
    expect(r.content.sessionSummary?.tournamentsCount).toBe(2);
    expect(r.content.sessionSummary?.finalTables).toBe(1);
    expect(r.content.sessionSummary?.cravadas).toBe(1);
    expect(r.status).toBe("degraded");
    expect(r.degradedReason).toBe("no_anthropic_key");
    errSpy.mockRestore();
  });
});

describe("generateDailyDebrief — followUp populated", () => {
  it("inclui activeLeakFocus quando findActiveLeakFocusList retorna itens", async () => {
    const sessions = [{ id: "s1", date: "2026-05-20", status: "completed" }];
    const storage = {
      ...makeMockStorage(sessions),
      findActiveLeakFocusList: vi.fn(async () => [
        { leakCode: "ICM", label: "ICM tight push", targetMonth: "2026-05", status: "active" },
      ]),
    };
    vi.doMock("@anthropic-ai/sdk", () => ({ default: function FakeAnthropic() { return null; } }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateDailyDebrief } = await import("../../../server/services/dailyDebriefGenerator");
    const r = await generateDailyDebrief({
      userId: "USER-1",
      periodStart: "2026-05-20",
      injectedStorage: storage,
    });
    expect(r.content.followUp).toBeDefined();
    expect(r.content.followUp?.activeLeakFocus).toHaveLength(1);
    expect(r.content.followUp?.activeLeakFocus[0].code).toBe("ICM");
    errSpy.mockRestore();
  });
});
