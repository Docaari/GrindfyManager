// =============================================================================
// Sprint AI-2A / RF-06.2 (ADR-166) — diagnose_plateau
//
// Cobre:
//   - Zod: months 2-12 default 3.
//   - Sample size < 30*months -> isPlateau=false, signal='unknown'.
//   - ROI flat (stddev/|mean| < threshold) -> signal='roi_flat'.
//   - 0 estudo + leaks ativos -> signal candidate 'no_study'.
//   - Prioridade dos sinais: roi_flat > volume_flat > no_study > selection_drift > unknown.
//   - Output shape: isPlateau, signal, roiTrend, studyMinutesTrend, leaksActive, narrative, recommendation.
//   - env vars COACH_PLATEAU_* respeitadas.
//   - Descritor: read tool + Pro+ + auditLevel log.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ROI_THRESHOLD = process.env.COACH_PLATEAU_ROI_FLAT_THRESHOLD;
const ORIGINAL_STUDY_FLOOR = process.env.COACH_PLATEAU_STUDY_FLOOR_MIN;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_ROI_THRESHOLD === undefined) delete process.env.COACH_PLATEAU_ROI_FLAT_THRESHOLD;
  else process.env.COACH_PLATEAU_ROI_FLAT_THRESHOLD = ORIGINAL_ROI_THRESHOLD;
  if (ORIGINAL_STUDY_FLOOR === undefined) delete process.env.COACH_PLATEAU_STUDY_FLOOR_MIN;
  else process.env.COACH_PLATEAU_STUDY_FLOOR_MIN = ORIGINAL_STUDY_FLOOR;
});

describe("diagnose_plateau — Zod validation", () => {
  it("months < 2 invalido", async () => {
    const { diagnosePlateauInputSchema } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    expect(diagnosePlateauInputSchema.safeParse({ months: 1 }).success).toBe(false);
  });
  it("months > 12 invalido", async () => {
    const { diagnosePlateauInputSchema } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    expect(diagnosePlateauInputSchema.safeParse({ months: 24 }).success).toBe(false);
  });
  it("default months=3", async () => {
    const { diagnosePlateauInputSchema } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    const r = diagnosePlateauInputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.months).toBe(3);
  });
});

describe("diagnose_plateau — sinais", () => {
  it("sample < 30*months -> isPlateau=false signal='unknown'", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({ sampleSize: 20, tournaments: [] })),
      getMonthlyRoiTrend: vi.fn(async () => [{ month: "2026-03", roi: 5 }, { month: "2026-04", roi: 4 }, { month: "2026-05", roi: 6 }]),
      getMonthlyVolumeTrend: vi.fn(async () => [{ month: "2026-03", volume: 20 }]),
      getMonthlyStudyMinutesTrend: vi.fn(async () => [{ month: "2026-03", minutes: 0 }]),
      getProfileAdherenceTrend: vi.fn(async () => []),
      findActiveLeakFocusList: vi.fn(async () => []),
    };
    const { diagnosePlateauTool } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    const r: any = await diagnosePlateauTool.handler(
      { months: 3 },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.isPlateau).toBe(false);
    expect(r.signal).toBe("unknown");
  });

  it("ROI flat (stddev/mean < threshold) -> signal='roi_flat'", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({ sampleSize: 200, tournaments: [] })),
      getMonthlyRoiTrend: vi.fn(async () => [
        { month: "2026-03", roi: 5.0 },
        { month: "2026-04", roi: 5.1 },
        { month: "2026-05", roi: 4.95 },
      ]),
      getMonthlyVolumeTrend: vi.fn(async () => [
        { month: "2026-03", volume: 100 },
        { month: "2026-04", volume: 120 },
        { month: "2026-05", volume: 80 },
      ]),
      getMonthlyStudyMinutesTrend: vi.fn(async () => [
        { month: "2026-03", minutes: 600 },
        { month: "2026-04", minutes: 700 },
        { month: "2026-05", minutes: 800 },
      ]),
      getProfileAdherenceTrend: vi.fn(async () => [0.85, 0.9, 0.88]),
      findActiveLeakFocusList: vi.fn(async () => [{ leakCode: "icm" }]),
    };
    const { diagnosePlateauTool } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    const r: any = await diagnosePlateauTool.handler(
      { months: 3 },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.isPlateau).toBe(true);
    expect(r.signal).toBe("roi_flat");
    expect(Array.isArray(r.leaksActive)).toBe(true);
    expect(r.recommendation).toBeTruthy();
    expect(r.recommendation.kind).toMatch(/tool|link/);
  });

  it("0 estudo (study minutes <= floor) com sample suficiente + leaks -> signal='no_study'", async () => {
    process.env.COACH_PLATEAU_STUDY_FLOOR_MIN = "240";
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({ sampleSize: 200, tournaments: [] })),
      // ROI variando o suficiente pra NAO ser roi_flat
      getMonthlyRoiTrend: vi.fn(async () => [
        { month: "2026-03", roi: 2 },
        { month: "2026-04", roi: 10 },
        { month: "2026-05", roi: -3 },
      ]),
      getMonthlyVolumeTrend: vi.fn(async () => [
        { month: "2026-03", volume: 100 },
        { month: "2026-04", volume: 200 },
        { month: "2026-05", volume: 50 },
      ]),
      getMonthlyStudyMinutesTrend: vi.fn(async () => [
        { month: "2026-03", minutes: 0 },
        { month: "2026-04", minutes: 0 },
        { month: "2026-05", minutes: 0 },
      ]),
      getProfileAdherenceTrend: vi.fn(async () => [0.9, 0.85, 0.92]),
      findActiveLeakFocusList: vi.fn(async () => [{ leakCode: "vbet" }]),
    };
    const { diagnosePlateauTool } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    const r: any = await diagnosePlateauTool.handler(
      { months: 3 },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.isPlateau).toBe(true);
    expect(r.signal).toBe("no_study");
  });
});

describe("diagnose_plateau — descritor", () => {
  it("read tool com tier Pro+", async () => {
    const { diagnosePlateauTool } = await import(
      "../../../../server/coachTools/handlers/diagnosePlateau"
    );
    expect(diagnosePlateauTool.name).toBe("diagnose_plateau");
    expect(diagnosePlateauTool.requiresConfirmation).toBeFalsy();
    expect(diagnosePlateauTool.auditLevel).toBe("log");
    expect(diagnosePlateauTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
