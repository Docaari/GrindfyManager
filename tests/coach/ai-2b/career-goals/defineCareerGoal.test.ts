// =============================================================================
// Sprint AI-2B / RF-02 (ADR-168) — define_career_goal (write, confirm v1)
//
// Cobre:
//   - Descritor: name + requiresConfirmation:true + auditLevel:'persist' + gateByTier Pro+.
//   - Zod input: title max 120, description max 1000, targetMetric enum, targetValue>0,
//     targetDeadline YYYY-MM-DD, horizon enum default 'trimestre'.
//   - Gating: isToolEligibleTier (Pro+/Trial) — free nega.
//   - Preview: payloadBefore null + payloadAfter com title; wouldExceedCap quando >=5 ativas.
//   - Execute (após confirm): cria 1 row via createCareerGoal storage; opcionalmente
//     popula ai_structured_profile.metas com origem='career_goal'.
//   - Undo: deleta row via deleteCareerGoal storage.
//
// Status esperado: TODOS FALHAM (módulo não existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("define_career_goal — descritor", () => {
  it("name + requiresConfirmation:true + auditLevel:'persist' + gateByTier Pro+", async () => {
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(defineCareerGoalTool.name).toBe("define_career_goal");
    expect(defineCareerGoalTool.requiresConfirmation).toBe(true);
    expect(defineCareerGoalTool.auditLevel).toBe("persist");
    expect(defineCareerGoalTool.gateByTier).toEqual(
      expect.arrayContaining(["pro", "premium", "admin"]),
    );
  });
});

describe("define_career_goal — Zod validation", () => {
  it("rejeita title vazio", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(defineCareerGoalInputSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejeita title > 120 chars", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({ title: "a".repeat(125) }).success,
    ).toBe(false);
  });

  it("rejeita description > 1000 chars", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Atingir Pro Stakes",
        description: "x".repeat(1500),
      }).success,
    ).toBe(false);
  });

  it("rejeita targetMetric fora do enum", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Meta X",
        targetMetric: "lucro_brl",
      }).success,
    ).toBe(false);
  });

  it("rejeita targetValue <= 0", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Meta",
        targetValue: 0,
      }).success,
    ).toBe(false);
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Meta",
        targetValue: -100,
      }).success,
    ).toBe(false);
  });

  it("rejeita targetDeadline fora de YYYY-MM-DD", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Meta",
        targetDeadline: "31/12/2026",
      }).success,
    ).toBe(false);
  });

  it("rejeita horizon fora do enum", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "Meta",
        horizon: "decada",
      }).success,
    ).toBe(false);
  });

  it("aceita input minimo válido (default horizon='trimestre')", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    const r = defineCareerGoalInputSchema.safeParse({
      title: "Atingir Pro Stakes em 12 meses",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.horizon).toBe("trimestre");
    }
  });

  it("aceita input completo", async () => {
    const { defineCareerGoalInputSchema } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    expect(
      defineCareerGoalInputSchema.safeParse({
        title: "ROI 8% em 2026",
        description: "Manter ROI consistente",
        targetMetric: "roi_pct",
        targetValue: 8,
        targetDeadline: "2026-12-31",
        horizon: "ano",
      }).success,
    ).toBe(true);
  });
});

describe("define_career_goal — preview", () => {
  it("payloadBefore null + payloadAfter com title quando < cap", async () => {
    const injectedStorage: any = {
      countActiveCareerGoals: vi.fn(async () => 2),
      listActiveCareerGoals: vi.fn(async () => []),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    const out: any = await defineCareerGoalTool.preview!(
      { title: "Meta nova", targetMetric: "profit_usd", targetValue: 50000 },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.payloadBefore).toBeNull();
    expect(out.payloadAfter).toBeTruthy();
    expect(out.payloadAfter.title).toBe("Meta nova");
    expect(out.wouldExceedCap).toBeFalsy();
  });

  it("wouldExceedCap=true + oldestActive quando >= COACH_CAREER_GOALS_MAX_ACTIVE", async () => {
    const oldestRow = { id: "g-old", title: "Meta antiga", createdAt: new Date("2025-01-01") };
    const injectedStorage: any = {
      countActiveCareerGoals: vi.fn(async () => 5),
      listActiveCareerGoals: vi.fn(async () => [
        oldestRow,
        { id: "g-2", title: "M2", createdAt: new Date("2025-06-01") },
      ]),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    const out: any = await defineCareerGoalTool.preview!(
      { title: "Meta 6" },
      { userId: "USER-1", injectedStorage } as any,
    );
    expect(out.wouldExceedCap).toBe(true);
    expect(out.oldestActive).toBeTruthy();
    expect(out.oldestActive.id).toBe("g-old");
  });
});

describe("define_career_goal — execute (após confirm)", () => {
  it("cria 1 row em career_goals com status='active'", async () => {
    const injectedStorage: any = {
      countActiveCareerGoals: vi.fn(async () => 0),
      listActiveCareerGoals: vi.fn(async () => []),
      createCareerGoal: vi.fn(async (payload: any) => ({
        id: "cg-1",
        ...payload,
        status: "active",
        createdAt: new Date(),
      })),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    const out: any = await defineCareerGoalTool.executeConfirmed!(
      { title: "Atingir Pro Stakes", targetMetric: "profit_usd", targetValue: 50000 },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.createCareerGoal).toHaveBeenCalledTimes(1);
    expect(out.payloadAfter).toBeTruthy();
    expect(out.payloadAfter.id).toBe("cg-1");
    expect(out.payloadAfter.status).toBe("active");
  });
});

describe("define_career_goal — undo", () => {
  it("undo deleta a row criada", async () => {
    const injectedStorage: any = {
      deleteCareerGoal: vi.fn(async () => undefined),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    await defineCareerGoalTool.undo!(
      null,
      { id: "cg-1" },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteCareerGoal).toHaveBeenCalledWith(
      expect.stringMatching(/cg-1/),
    );
  });
});
