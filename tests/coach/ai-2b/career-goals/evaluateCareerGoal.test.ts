// =============================================================================
// Sprint AI-2B / RF-02 (ADR-168) — evaluate_career_goal (read-only puro)
//
// Cobre:
//   - Descritor: requiresConfirmation:false + auditLevel:'log' + Pro+/Trial gating.
//   - targetMetric='profit_usd': chama getPerformanceByPeriod desde createdAt..now,
//     FX → USD (lesson #6). Calcula progressPct.
//   - targetMetric='tournaments_count': count.
//   - targetMetric='bankroll_usd': walletService.getConsolidatedBalance.
//   - Divisão por zero (targetValue=0 ou null) → progressPct null + confidence 'low'.
//   - sample < 5 → estimate='unknown', confidence='low'.
//   - NÃO grava progress_note no DB (read-only puro — ADR-168 §RF-02.2).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("evaluate_career_goal — descritor", () => {
  it("requiresConfirmation:false + auditLevel:'log'", async () => {
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    expect(evaluateCareerGoalTool.name).toBe("evaluate_career_goal");
    expect(evaluateCareerGoalTool.requiresConfirmation).toBeFalsy();
    expect(evaluateCareerGoalTool.auditLevel).toBe("log");
    expect(evaluateCareerGoalTool.gateByTier).toEqual(
      expect.arrayContaining(["pro", "premium", "admin"]),
    );
  });
});

describe("evaluate_career_goal — Zod validation", () => {
  it("rejeita goalId vazio", async () => {
    const { evaluateCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    expect(evaluateCareerGoalInputSchema.safeParse({ goalId: "" }).success).toBe(false);
  });

  it("aceita goalId válido", async () => {
    const { evaluateCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    expect(
      evaluateCareerGoalInputSchema.safeParse({ goalId: "cg-abc-123" }).success,
    ).toBe(true);
  });
});

describe("evaluate_career_goal — targetMetric='profit_usd'", () => {
  it("calcula progressPct via getPerformanceByPeriod desde createdAt até now", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-1",
        userId: "USER-1",
        title: "Atingir $50k em 12m",
        targetMetric: "profit_usd",
        targetValue: 50000,
        targetDeadline: "2026-12-31",
        horizon: "ano",
        status: "active",
        createdAt: new Date("2026-01-01"),
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 25000, // USD
        tournaments: 200,
        buyInSum: 15000,
      })),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "cg-1" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.goal.id).toBe("cg-1");
    expect(out.progress.currentValue).toBeCloseTo(25000, 0);
    expect(out.progress.progressPct).toBeCloseTo(50, 0);
    expect(out.progress.confidence).toBe("high");
  });
});

describe("evaluate_career_goal — divisão por zero (targetValue=0 ou null)", () => {
  it("targetValue=null → progressPct=null + confidence='low'", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-2",
        userId: "USER-1",
        title: "Meta custom",
        targetMetric: "custom",
        targetValue: null,
        targetDeadline: null,
        horizon: "trimestre",
        status: "active",
        createdAt: new Date("2026-04-01"),
      })),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "cg-2" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.progress.progressPct).toBeNull();
    expect(out.progress.confidence).toBe("low");
  });
});

describe("evaluate_career_goal — targetMetric='tournaments_count'", () => {
  it("count via getPerformanceByPeriod.tournaments", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-3",
        userId: "USER-1",
        title: "Jogar 1000 torneios",
        targetMetric: "tournaments_count",
        targetValue: 1000,
        targetDeadline: "2026-12-31",
        horizon: "ano",
        status: "active",
        createdAt: new Date("2026-01-01"),
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 0,
        tournaments: 500,
        buyInSum: 0,
      })),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "cg-3" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.progress.currentValue).toBe(500);
    expect(out.progress.progressPct).toBeCloseTo(50, 0);
  });
});

describe("evaluate_career_goal — targetMetric='bankroll_usd'", () => {
  it("usa walletService.getConsolidatedBalance USD", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-4",
        userId: "USER-1",
        title: "Banca $30k",
        targetMetric: "bankroll_usd",
        targetValue: 30000,
        horizon: "trimestre",
        status: "active",
        createdAt: new Date("2026-04-01"),
      })),
      getConsolidatedBalanceUsd: vi.fn(async () => 15000),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "cg-4" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.progress.currentValue).toBe(15000);
    expect(out.progress.progressPct).toBeCloseTo(50, 0);
  });
});

describe("evaluate_career_goal — sample baixo", () => {
  it("tournaments < 5 → estimate='unknown' + confidence='low'", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-5",
        userId: "USER-1",
        title: "Meta lucro",
        targetMetric: "profit_usd",
        targetValue: 10000,
        targetDeadline: "2026-12-31",
        horizon: "ano",
        status: "active",
        createdAt: new Date("2026-05-15"),
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 200,
        tournaments: 3,
        buyInSum: 50,
      })),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "cg-5" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.progress.confidence).toBe("low");
    expect(out.progress.estimate).toBe("unknown");
  });
});

describe("evaluate_career_goal — read-only puro (não grava DB)", () => {
  it("NÃO chama updateCareerGoal nem setProgressNote", async () => {
    const updateSpy = vi.fn(async () => undefined);
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => ({
        id: "cg-6",
        userId: "USER-1",
        title: "Meta",
        targetMetric: "profit_usd",
        targetValue: 10000,
        horizon: "trimestre",
        status: "active",
        createdAt: new Date("2026-04-01"),
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 5000,
        tournaments: 100,
        buyInSum: 3000,
      })),
      updateCareerGoal: updateSpy,
      setProgressNote: updateSpy,
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    await evaluateCareerGoalTool.handler!(
      { goalId: "cg-6" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("evaluate_career_goal — goal não encontrada", () => {
  it("retorna erro 'not_found' quando getCareerGoal null", async () => {
    const injectedStorage: any = {
      getCareerGoal: vi.fn(async () => null),
    };
    const { evaluateCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/evaluateCareerGoal"
    );
    const out: any = await evaluateCareerGoalTool.handler!(
      { goalId: "missing" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out?.ok).toBe(false);
    expect(out?.error).toMatch(/not_found/i);
  });
});
