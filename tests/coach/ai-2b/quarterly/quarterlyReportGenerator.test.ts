// =============================================================================
// Sprint AI-2B / RF-03 (ADR-169) — quarterlyReportGenerator (Sonnet 4.6)
//
// Cobre:
//   - Bundle real (gather90DaysBundle equivalent — trimestre).
//   - schemaVersion=3 (ReportContent v3) + reportType='quarterly'.
//   - Sumarização hierárquica Haiku quase sempre dispara (bundle > 20K chars).
//   - cgameSnapshot populado via aggregateCgameForPeriod + getInchwormSeries.
//   - mentalHandHighlights populado (top 3).
//   - careerGoalsProgress populado (só horizons trimestre/ano/multi_ano).
//   - irpfSummary só BR (country='BR' ou timezone america/*); senão omitido.
//   - Sem ANTHROPIC_API_KEY → degraded determinístico (lesson #5/#35).
//   - disclaimer (ADR-173) populado no content + markdown footer.
//   - persist via reportGeneratorShared (cost_usd_estimate + tokens).
//
// Lesson #36: storage com @shared/schema lazy.
// Lesson #5/#35: Anthropic constructor com fallback factory.
//
// Status esperado: TODOS FALHAM.
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

function makeMockStorage(overrides: any = {}): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 0, tournaments: 0, buyInSum: 0 })),
    listWarmupRitualsForRange: vi.fn(async () => []),
    listMentalHandsForRange: vi.fn(async () => []),
    listActiveCareerGoals: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-1",
      country: "BR",
      timezone: "America/Sao_Paulo",
      firstName: "Test",
    })),
    persistReport: vi.fn(async (payload: any) => ({ ...payload, id: "rep-1" })),
    ...overrides,
  };
}

describe("generateQuarterlyReport — shape básico", () => {
  it("retorna content.reportType='quarterly' + schemaVersion=3", async () => {
    const storage = makeMockStorage();
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.content.reportType).toBe("quarterly");
    expect(r.content.schemaVersion).toBe(3);
    expect(r.content.periodStart).toBe("2026-01-01");
    expect(r.content.periodEnd).toBe("2026-03-31");
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — sem ANTHROPIC_API_KEY → degraded determinístico", () => {
  it("status='degraded' + degradedReason='no_anthropic_key'", async () => {
    const storage = makeMockStorage();
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.status).toBe("degraded");
    expect(r.degradedReason).toBe("no_anthropic_key");
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — disclaimer (ADR-173)", () => {
  it("content.disclaimer populado + markdown inclui texto canônico", async () => {
    const storage = makeMockStorage();
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.content.disclaimer).toBeTruthy();
    expect(r.content.disclaimer).toMatch(/informativo|aconselhamento|consulte/i);
    expect(r.markdown).toContain(r.content.disclaimer);
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — IRPF summary (Q-C)", () => {
  it("user BR (country='BR') → irpfSummary populado com profitBrl + avgPtax + disclaimer", async () => {
    const storage = makeMockStorage({
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 10000, // USD
        tournaments: 200,
        buyInSum: 6000,
      })),
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-BR",
        country: "BR",
        timezone: "America/Sao_Paulo",
      })),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    vi.doMock("../../../../shared/fxCascade", () => ({
      fxCascade: {
        getAveragePtaxForRange: vi.fn(async () => 5.10),
      },
      getAveragePtaxForRange: vi.fn(async () => 5.10),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-BR",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.content.irpfSummary).toBeTruthy();
    expect(r.content.irpfSummary.profitUsd).toBeCloseTo(10000, 0);
    expect(r.content.irpfSummary.profitBrl).toBeCloseTo(51000, 0);
    expect(r.content.irpfSummary.avgPtax).toBeCloseTo(5.10, 2);
    expect(r.content.irpfSummary.disclaimer).toMatch(/informativo|contador/i);
    errSpy.mockRestore();
  });

  it("user não-BR (country='US') → irpfSummary omitido", async () => {
    const storage = makeMockStorage({
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-US",
        country: "US",
        timezone: "America/New_York",
      })),
      getPerformanceByPeriod: vi.fn(async () => ({ profit: 5000, tournaments: 100, buyInSum: 3000 })),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-US",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.content.irpfSummary).toBeFalsy();
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — cgameSnapshot integration (ADR-170)", () => {
  it("popula content.cgameSnapshot com aPct/bPct/cPct + inchwormSeries", async () => {
    const storage = makeMockStorage({
      listWarmupRitualsForRange: vi.fn(async () => [
        { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 3, overrideUsed: true, decisionToPlay: true },
      ]),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(r.content.cgameSnapshot).toBeTruthy();
    expect(typeof r.content.cgameSnapshot.aPct).toBe("number");
    expect(typeof r.content.cgameSnapshot.bPct).toBe("number");
    expect(typeof r.content.cgameSnapshot.cPct).toBe("number");
    expect(Array.isArray(r.content.cgameSnapshot.inchwormSeries)).toBe(true);
    errSpy.mockRestore();
  });
});

describe("generateQuarterlyReport — mentalHandHighlights (ADR-171)", () => {
  it("popula top 3 highlights", async () => {
    const storage = makeMockStorage({
      listMentalHandsForRange: vi.fn(async () => [
        { id: "mh-1", occurredAt: new Date("2026-03-15"), emotion: "tilt", situation: "BB 30 vs UTG", idealResponse: "fold" },
        { id: "mh-2", occurredAt: new Date("2026-02-20"), emotion: "frustration", situation: "river bluff", idealResponse: "call" },
        { id: "mh-3", occurredAt: new Date("2026-01-10"), emotion: "fear", situation: "ICM tight", idealResponse: "push" },
        { id: "mh-4", occurredAt: new Date("2026-01-05"), emotion: "tilt", situation: "outdraw", idealResponse: "step away" },
      ]),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(Array.isArray(r.content.mentalHandHighlights)).toBe(true);
    expect(r.content.mentalHandHighlights.length).toBeLessThanOrEqual(3);
  });
});

describe("generateQuarterlyReport — careerGoalsProgress (ADR-168)", () => {
  it("inclui só metas com horizon ∈ {trimestre, ano, multi_ano}", async () => {
    const storage = makeMockStorage({
      listActiveCareerGoals: vi.fn(async () => [
        { id: "cg-1", title: "Meta tri", horizon: "trimestre", targetMetric: "profit_usd", targetValue: 10000 },
        { id: "cg-2", title: "Meta mes", horizon: "mes", targetMetric: "profit_usd", targetValue: 2000 },
        { id: "cg-3", title: "Meta ano", horizon: "ano", targetMetric: "profit_usd", targetValue: 50000 },
      ]),
      getPerformanceByPeriod: vi.fn(async () => ({ profit: 5000, tournaments: 100, buyInSum: 3000 })),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(Array.isArray(r.content.careerGoalsProgress)).toBe(true);
    const ids = r.content.careerGoalsProgress.map((g: any) => g.goalId);
    expect(ids).toContain("cg-1");
    expect(ids).toContain("cg-3");
    expect(ids).not.toContain("cg-2");
  });
});

describe("generateQuarterlyReport — sumarização hierárquica Haiku", () => {
  it("bundle > 20K chars → summarizer_model_used populated", async () => {
    // Bundle gigante: 200 sessões
    const sessions = Array.from({ length: 200 }, (_, i) => ({
      id: `s${i}`,
      date: `2026-${String(((i % 3) + 1)).padStart(2, "0")}-15`,
      status: "completed",
    }));
    const storage = makeMockStorage({
      getGrindSessions: vi.fn(async () => sessions),
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));
    const summarizeSpy = vi.fn(async (args: any) => ({
      summarized: { compact: true },
      modelUsed: "claude-haiku-4-5-20251001",
    }));
    vi.doMock("../../../../server/services/reportSummarizer", () => ({
      summarizeBundleHierarchical: summarizeSpy,
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../../server/services/quarterlyReportGenerator"
    );
    const r = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });
    expect(summarizeSpy).toHaveBeenCalled();
    expect(r.summarizerModelUsed).toBeTruthy();
    errSpy.mockRestore();
  });
});
