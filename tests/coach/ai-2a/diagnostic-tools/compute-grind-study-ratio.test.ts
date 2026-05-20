// =============================================================================
// Sprint AI-2A / RF-06.3 (ADR-166) — compute_grind_study_ratio
//
// Cobre:
//   - Zod: period enum 30d|90d default 30d.
//   - grindHours soma sessions; studyHours soma study_sessions_v2 minutes/60.
//   - ratio null quando studyHours=0 -> interpretation='sem_estudo'.
//   - ratio < 5 -> 'abaixo'; 5..10 -> 'dentro'; > 10 -> 'acima'.
//   - benchmark.range fixo '5:1 a 10:1'.
//   - Descritor: read tool + Pro+.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("compute_grind_study_ratio — Zod validation", () => {
  it("rejeita period invalido", async () => {
    const { computeGrindStudyRatioInputSchema } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    expect(
      computeGrindStudyRatioInputSchema.safeParse({ period: "6m" }).success,
    ).toBe(false);
  });
  it("default period=30d", async () => {
    const { computeGrindStudyRatioInputSchema } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    const r = computeGrindStudyRatioInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.period).toBe("30d");
  });
});

describe("compute_grind_study_ratio — calculo", () => {
  it("ratio dentro do range 5:1 a 10:1 -> interpretation='dentro'", async () => {
    const injectedStorage: any = {
      getGrindHoursForPeriod: vi.fn(async () => 50),
      getStudyMinutesForPeriod: vi.fn(async () => 600), // 10h
    };
    const { computeGrindStudyRatioTool } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    const r: any = await computeGrindStudyRatioTool.handler(
      { period: "30d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.grindHours).toBe(50);
    expect(r.studyHours).toBe(10);
    expect(r.ratio).toBe(5);
    expect(r.benchmark.range).toBe("5:1 a 10:1");
    expect(r.benchmark.interpretation).toBe("dentro");
  });

  it("ratio > 10 -> 'acima' (grind sem estudo)", async () => {
    const injectedStorage: any = {
      getGrindHoursForPeriod: vi.fn(async () => 80),
      getStudyMinutesForPeriod: vi.fn(async () => 240), // 4h -> ratio 20
    };
    const { computeGrindStudyRatioTool } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    const r: any = await computeGrindStudyRatioTool.handler(
      { period: "30d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.ratio).toBe(20);
    expect(r.benchmark.interpretation).toBe("acima");
  });

  it("ratio < 5 -> 'abaixo'", async () => {
    const injectedStorage: any = {
      getGrindHoursForPeriod: vi.fn(async () => 5),
      getStudyMinutesForPeriod: vi.fn(async () => 300), // 5h -> ratio 1
    };
    const { computeGrindStudyRatioTool } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    const r: any = await computeGrindStudyRatioTool.handler(
      { period: "30d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.ratio).toBe(1);
    expect(r.benchmark.interpretation).toBe("abaixo");
  });

  it("studyHours=0 -> ratio:null, interpretation:'sem_estudo'", async () => {
    const injectedStorage: any = {
      getGrindHoursForPeriod: vi.fn(async () => 30),
      getStudyMinutesForPeriod: vi.fn(async () => 0),
    };
    const { computeGrindStudyRatioTool } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    const r: any = await computeGrindStudyRatioTool.handler(
      { period: "30d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.ratio).toBeNull();
    expect(r.benchmark.interpretation).toBe("sem_estudo");
  });
});

describe("compute_grind_study_ratio — descritor", () => {
  it("read tool + tier Pro+", async () => {
    const { computeGrindStudyRatioTool } = await import(
      "../../../../server/coachTools/handlers/computeGrindStudyRatio"
    );
    expect(computeGrindStudyRatioTool.name).toBe("compute_grind_study_ratio");
    expect(computeGrindStudyRatioTool.requiresConfirmation).toBeFalsy();
    expect(computeGrindStudyRatioTool.auditLevel).toBe("log");
    expect(computeGrindStudyRatioTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
