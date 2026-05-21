// =============================================================================
// Sprint AI-3 / RF-06 (ADR-174 §2.6) — Perf via Promise.all
//
// Cobre:
//   - quarterlyReportGenerator gather: operações independentes disparadas em
//     paralelo (Promise.all wave 1). irpfSummary depende de isBrUser(profile)
//     → wave 2.
//   - Como medir sem flakiness: cada mock storage method registra timestamp ao
//     iniciar; assert que diff entre primeiro e último start é pequeno
//     (~5ms) — indica disparo paralelo, NÃO serial.
//   - cgameAggregator.getInchwormSeries: 6 awaits mensais paralelos (não seriais).
//
// Lessons aplicadas:
//   - Promise.allSettled isola falhas — 1 falha em wave 1 não derruba os outros.
//
// Status esperado: TODOS FALHAM (impl serial hoje).
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

interface StartLog {
  method: string;
  at: number;
}

function makeTimedStorage(startLog: StartLog[], overrides: any = {}): any {
  const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
  const track = (method: string) => async (...args: any[]) => {
    startLog.push({ method, at: Date.now() });
    await sleep(50); // cada método demora 50ms
    return overrides[method]?.(...args) ?? null;
  };
  return {
    getUserProfile: vi.fn(async (uid: string) => {
      startLog.push({ method: "getUserProfile", at: Date.now() });
      await sleep(50);
      return { userPlatformId: uid, country: "US", timezone: "America/New_York" };
    }),
    getPerformanceByPeriod: vi.fn(track("getPerformanceByPeriod")),
    getGrindSessions: vi.fn(track("getGrindSessions")),
    listWarmupRitualsForRange: vi.fn(track("listWarmupRitualsForRange")),
    listMentalHandsForRange: vi.fn(track("listMentalHandsForRange")),
    listActiveCareerGoals: vi.fn(track("listActiveCareerGoals")),
    findActiveLeakFocusList: vi.fn(track("findActiveLeakFocusList")),
    getSessionTournaments: vi.fn(async () => []),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-1" })),
  };
}

describe("generateQuarterlyReport — RF-06 gather paralelo (Promise.all wave)", () => {
  it("operações independentes disparadas em paralelo (timestamps próximos)", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const startLog: StartLog[] = [];
    const storage = makeTimedStorage(startLog);

    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const t0 = Date.now();
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    const totalElapsed = Date.now() - t0;

    // Independentes de wave 1: perf, sessions, mentalHands, careerGoals,
    // warmupRituals (cgame). profile é wave 0 (deps de irpf, mas user é US
    // então irpf nem dispara — só serve pra checar BR-ness).
    const independents = [
      "getPerformanceByPeriod",
      "getGrindSessions",
      "listMentalHandsForRange",
      "listActiveCareerGoals",
      "listWarmupRitualsForRange",
    ];
    const starts = independents
      .map((m) => startLog.find((e) => e.method === m)?.at)
      .filter((x): x is number => x !== undefined);

    expect(starts.length).toBeGreaterThanOrEqual(4);
    const min = Math.min(...starts);
    const max = Math.max(...starts);
    // Se serial: max - min ~ 4 * 50 = 200ms.
    // Se paralelo: max - min < 30ms (margem síncrona).
    expect(max - min).toBeLessThan(50);

    // Sanity: wall-clock total deve ser próximo de 1 wave (~50-150ms),
    // NÃO soma das 5 (~250ms+).
    expect(totalElapsed).toBeLessThan(250);

    errSpy.mockRestore();
  });

  it("Promise.allSettled — falha de 1 mock não derruba os outros", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const storage: any = {
      getUserProfile: vi.fn(async () => ({ userPlatformId: "USER-1", country: "US" })),
      // mentalHands throw — não deve derrubar o relatório
      listMentalHandsForRange: vi.fn(async () => {
        throw new Error("mental hands DB error");
      }),
      getPerformanceByPeriod: vi.fn(async () => ({ profit: 1000, tournaments: 50, buyInSum: 500 })),
      listWarmupRitualsForRange: vi.fn(async () => [
        { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
      ]),
      listActiveCareerGoals: vi.fn(async () => [
        { id: "cg-1", title: "Meta", horizon: "ano", targetMetric: "profit_usd", targetValue: 10000 },
      ]),
      findActiveLeakFocusList: vi.fn(async () => []),
      getGrindSessions: vi.fn(async () => []),
      getSessionTournaments: vi.fn(async () => []),
      persistReport: vi.fn(async (p: any) => p),
    };

    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    // Quarterly não throw, content gerado, careerGoalsProgress populado mesmo
    // com mentalHands quebrado.
    expect(r.content).toBeTruthy();
    expect(Array.isArray(r.content.careerGoalsProgress)).toBe(true);
    expect(r.content.careerGoalsProgress.length).toBeGreaterThan(0);
    // mentalHandHighlights vazio ou ausente, mas não throw.
    expect(Array.isArray(r.content.mentalHandHighlights ?? [])).toBe(true);

    errSpy.mockRestore();
  });
});

describe("cgameAggregator.getInchwormSeries — RF-06 paralelo (6 awaits → 1 wave)", () => {
  it("6 chamadas mensais disparadas em paralelo (timestamps próximos)", async () => {
    const callTimes: number[] = [];
    const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
    const mockStorage: any = {
      listWarmupRitualsForRange: vi.fn(async () => {
        callTimes.push(Date.now());
        await sleep(40);
        return [
          { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
        ];
      }),
    };

    const { getInchwormSeries } = await import(
      "../../../server/services/cgameAggregator"
    );
    const t0 = Date.now();
    const series = await getInchwormSeries("USER-1", 6, mockStorage);
    const totalElapsed = Date.now() - t0;

    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBe(6);

    // Se serial: 6 * 40 = 240ms total. Se paralelo: ~40-80ms.
    expect(totalElapsed).toBeLessThan(150);

    // Timestamps de início ~simultâneos (diff < 30ms).
    expect(callTimes.length).toBeGreaterThanOrEqual(6);
    const min = Math.min(...callTimes);
    const max = Math.max(...callTimes);
    expect(max - min).toBeLessThan(50);
  });
});
