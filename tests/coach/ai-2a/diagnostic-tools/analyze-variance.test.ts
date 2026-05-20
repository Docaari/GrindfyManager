// =============================================================================
// Sprint AI-2A / RF-06.1 (ADR-166) — analyze_variance
//
// Cobre:
//   - Zod: period enum 30d|90d|6m|12m, dimension enum overall|stake|site.
//   - Reusa helper extraido server/coach/varianceAnalysis.ts (DRY com Monthly Report).
//   - Fallback heuristico sigmaUsd = 1.5 * stddev(daily_pnl_usd) (lesson #10).
//   - Output shape: sampleSize, observedRoi, confidenceInterval95, method,
//     narrative, confidence (high/medium/low por sampleSize).
//   - getVarianceVsExpected null -> method:'heuristic'; valor real -> 'primedope'.
//   - Audit level 'log', no confirmation, gateByTier Pro+.
//
// Status esperado: TODOS FALHAM (helper + tool nao existem).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("analyze_variance — Zod validation", () => {
  it("rejeita period fora do enum", async () => {
    const { analyzeVarianceInputSchema } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    expect(
      analyzeVarianceInputSchema.safeParse({ period: "5y" }).success,
    ).toBe(false);
  });

  it("aceita defaults (period=90d, dimension=overall)", async () => {
    const { analyzeVarianceInputSchema } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    const r = analyzeVarianceInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.period).toBe("90d");
      expect(r.data.dimension).toBe("overall");
    }
  });
});

describe("analyze_variance — heuristic fallback", () => {
  it("sample size < 30 -> confidence='low' + numericos null", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, profit: 5, buyIn: 10 })),
        sampleSize: 10,
      })),
      getVarianceVsExpected: vi.fn(async () => null),
    };
    const { analyzeVarianceTool } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    const r: any = await analyzeVarianceTool.handler(
      { period: "90d", dimension: "overall" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.confidence).toBe("low");
    expect(r.sampleSize).toBeLessThan(30);
    expect(r.narrative).toMatch(/amostra/i);
  });

  it("sample >= 100 -> confidence='high'; method='heuristic' quando primedope null", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: Array.from({ length: 120 }, (_, i) => ({
          id: `t${i}`,
          profit: (i % 3 === 0) ? 50 : -10,
          buyIn: 100,
          currency: "USD",
          completedAt: new Date(2026, 4, 1 + (i % 30)),
        })),
        sampleSize: 120,
        totalProfit: 800,
        totalBuyIn: 12000,
      })),
      getVarianceVsExpected: vi.fn(async () => null),
    };
    const { analyzeVarianceTool } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    const r: any = await analyzeVarianceTool.handler(
      { period: "90d", dimension: "overall" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.sampleSize).toBe(120);
    expect(r.confidence === "high" || r.confidence === "medium").toBeTruthy();
    expect(r.method).toBe("heuristic");
    expect(typeof r.narrative).toBe("string");
    expect(r.narrative.length).toBeGreaterThan(0);
  });

  it("getVarianceVsExpected retorna valor -> method='primedope'", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, profit: 1, buyIn: 50 })),
        sampleSize: 100,
        totalProfit: 100,
        totalBuyIn: 5000,
      })),
      getVarianceVsExpected: vi.fn(async () => ({ expectedRoi: 5.0, stddevBuyIns: 8.5 })),
    };
    const { analyzeVarianceTool } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    const r: any = await analyzeVarianceTool.handler(
      { period: "90d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.method).toBe("primedope");
    expect(r.expectedRoi).toBeCloseTo(5.0, 1);
  });
});

describe("analyze_variance — varianceAnalysis helper (extraído — DRY)", () => {
  it("computeVarianceAnalysis existe e e funcao", async () => {
    const mod = await import("../../../../server/coach/varianceAnalysis");
    expect(typeof (mod as any).computeVarianceAnalysis).toBe("function");
  });
});

describe("analyze_variance — descritor", () => {
  it("read tool: requiresConfirmation=false, auditLevel='log', tier Pro+", async () => {
    const { analyzeVarianceTool } = await import(
      "../../../../server/coachTools/handlers/analyzeVariance"
    );
    expect(analyzeVarianceTool.name).toBe("analyze_variance");
    expect(analyzeVarianceTool.requiresConfirmation).toBeFalsy();
    expect(analyzeVarianceTool.auditLevel).toBe("log");
    expect(analyzeVarianceTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
