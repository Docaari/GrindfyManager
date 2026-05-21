// =============================================================================
// Sprint AI-3.1 / RF-07 — server/coach/reportCost.ts
//
// A1-M1 do reviewer AI-3: 4 callsites (`computeCost` weekly, `computeMonthlyCost`,
// `computeDailyDebriefCost`, `computeQuarterlyCost`) duplicam constants Sonnet
// 4.6 inline. Extract para `server/coach/reportCost.ts`.
//
// Pricing Anthropic (USD per 1M tokens) — https://docs.anthropic.com/pricing as of 2026-01:
//   Sonnet 4.6:
//     input:      3.00
//     output:    15.00
//     cacheRead:  0.30
//     cacheWrite: 3.75
//   Haiku 4.5:
//     input:      1.00
//     output:     5.00
//     cacheRead:  0.10
//     cacheWrite: 1.25
//
// API esperada:
//   - SONNET_46_PRICE_PER_M, HAIKU_45_PRICE_PER_M (const)
//   - computeReportCost(usage, ratecard?: 'sonnet46'|'haiku45'): number
//   - default ratecard = 'sonnet46'
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RF-07 — reportCost constants exportadas", () => {
  it("exporta SONNET_46_PRICE_PER_M com shape correto", async () => {
    const mod: any = await import("../../../server/coach/reportCost");
    expect(mod.SONNET_46_PRICE_PER_M).toEqual({
      input: 3.00,
      output: 15.00,
      cacheRead: 0.30,
      cacheWrite: 3.75,
    });
  });

  it("exporta HAIKU_45_PRICE_PER_M com shape correto", async () => {
    const mod: any = await import("../../../server/coach/reportCost");
    expect(mod.HAIKU_45_PRICE_PER_M).toEqual({
      input: 1.00,
      output: 5.00,
      cacheRead: 0.10,
      cacheWrite: 1.25,
    });
  });
});

describe("RF-07 — computeReportCost: Sonnet 4.6", () => {
  it("1M input + 1M output → $18.00 (1M * 3 + 1M * 15)", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const cost = computeReportCost(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "sonnet46",
    );
    expect(cost).toBeCloseTo(18.00, 6);
  });

  it("ratecard default = 'sonnet46' quando omitido", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const costDefault = computeReportCost({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    const costExplicit = computeReportCost(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "sonnet46",
    );
    expect(costDefault).toBeCloseTo(costExplicit, 6);
  });

  it("usage tipico (10K input + 2K output) → cost esperado", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    // 10000 * 3/1M + 2000 * 15/1M = 0.03 + 0.03 = 0.06
    const cost = computeReportCost(
      { input_tokens: 10_000, output_tokens: 2_000 },
      "sonnet46",
    );
    expect(cost).toBeCloseTo(0.06, 6);
  });

  it("inclui cache_read_input_tokens + cache_creation_input_tokens", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    // 1M cache_read * 0.30 = 0.30; 1M cache_write * 3.75 = 3.75
    const cost = computeReportCost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
      },
      "sonnet46",
    );
    expect(cost).toBeCloseTo(0.30 + 3.75, 6);
  });

  it("usage SEM cache fields → cost = input + output only", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const cost = computeReportCost(
      { input_tokens: 5_000, output_tokens: 1_000 },
      "sonnet46",
    );
    // 5000 * 3/1M + 1000 * 15/1M = 0.015 + 0.015 = 0.030
    expect(cost).toBeCloseTo(0.030, 6);
  });
});

describe("RF-07 — computeReportCost: Haiku 4.5", () => {
  it("Haiku 4.5 com cache → cost reflete preços cache reduzidos", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    // 1M input * 1.00 + 1M cache_read * 0.10 = 1.00 + 0.10 = 1.10
    const cost = computeReportCost(
      {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
      },
      "haiku45",
    );
    expect(cost).toBeCloseTo(1.10, 6);
  });

  it("Haiku 1M input + 1M output → $6.00 (1.00 + 5.00)", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const cost = computeReportCost(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "haiku45",
    );
    expect(cost).toBeCloseTo(6.00, 6);
  });
});

describe("RF-07 — computeReportCost: edge cases", () => {
  it("usage zero → cost zero", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const cost = computeReportCost(
      { input_tokens: 0, output_tokens: 0 },
      "sonnet46",
    );
    expect(cost).toBe(0);
  });

  it("usage com campos undefined → trata como 0", async () => {
    const { computeReportCost } = await import("../../../server/coach/reportCost");
    const cost = computeReportCost(
      { input_tokens: 1_000, output_tokens: undefined as any },
      "sonnet46",
    );
    // 1000 * 3/1M = 0.003
    expect(cost).toBeCloseTo(0.003, 6);
  });
});

describe("RF-07 integration — 4 callsites migrados", () => {
  it("quarterlyReportGenerator usa computeReportCost (nao computeQuarterlyCost local)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const computeReportCostSpy = vi.fn(() => 0.12345);
    vi.doMock("../../../server/coach/reportCost", () => ({
      SONNET_46_PRICE_PER_M: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      HAIKU_45_PRICE_PER_M: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
      computeReportCost: computeReportCostSpy,
    }));

    // Mock anthropicClient para retornar happy path → custo eh computado.
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: vi.fn(async () => ({
        content: {
          summary: { line: "OK" },
          comparativeNarrative: "X",
          trendNarrative: "Y",
          insights: [],
          followUp: { recommendedAction: "Z" },
        },
        usage: { input_tokens: 1000, output_tokens: 500 },
        rawText: "{...}",
      })),
      getAnthropicClient: vi.fn(async () => ({ messages: { create: vi.fn() } })),
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
    }));
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));

    vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: {
        getGrindSessions: vi.fn(async () => []),
        getPerformanceByPeriod: vi.fn(async () => ({ profit: 100 })),
        listWarmupRitualsForRange: vi.fn(async () => []),
        listMentalHandsForRange: vi.fn(async () => []),
        listActiveCareerGoals: vi.fn(async () => []),
        findActiveLeakFocusList: vi.fn(async () => []),
        getUserProfile: vi.fn(async () => ({
          userPlatformId: "USER-1", country: "US", timezone: "America/New_York",
        })),
        persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-1" })),
      },
    });

    expect(computeReportCostSpy).toHaveBeenCalled();
    const call = computeReportCostSpy.mock.calls[0];
    // Ratecard 'sonnet46' (default ou explicito).
    if (call.length > 1) {
      expect(call[1]).toBe("sonnet46");
    }
  });
});
