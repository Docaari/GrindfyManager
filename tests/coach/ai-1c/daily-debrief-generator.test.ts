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

describe("generateDailyDebrief — sem sessao no dia", () => {
  it("retorna content reportType='daily' + dataSufficiency='low' + sessionSummary zerado", async () => {
    const storage = makeMockStorage([]);
    const { generateDailyDebrief } = await import("../../../server/services/dailyDebriefGenerator");
    const r = await generateDailyDebrief({
      userId: "USER-1",
      periodStart: "2026-05-20",
      injectedStorage: storage,
    });
    expect(r.content.reportType).toBe("daily");
    expect(r.content.periodStart).toBe("2026-05-20");
    expect(r.content.periodEnd).toBe("2026-05-20");
    expect(r.content.dataSufficiency).toBe("low");
    expect(r.content.sessionSummary?.sessionsCount).toBe(0);
    expect(r.content.sessionSummary?.tournamentsCount).toBe(0);
    expect(r.status).toBe("ready"); // sem dado nao chama LLM, nao degrada
    expect(r.costUsdEstimate).toBe(0);
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
