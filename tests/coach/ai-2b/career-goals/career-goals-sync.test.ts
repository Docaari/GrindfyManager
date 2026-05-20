// =============================================================================
// Sprint AI-2B / RF-02 (ADR-168 §2.2) — sync career_goals ↔ ai_structured_profile.metas
//
// Cobre:
//   - define_career_goal execute opcionalmente popula ai_structured_profile.metas
//     com 1 entry resumida (origem='career_goal', id=careerGoalId).
//   - Sync unidirecional opt-in: career_goals → metas. NÃO há trigger inverso
//     (edição em metas NÃO propaga para career_goals).
//   - undo do define_career_goal remove a entry com origem='career_goal' + id matching
//     do JSONB metas.
//   - Helper getAllUserGoals agrega 2 fontes: { structured: [...], legacy: [...] }.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("define_career_goal — sync com ai_structured_profile.metas", () => {
  it("execute popula metas legacy com entry resumida (origem='career_goal')", async () => {
    const injectedStorage: any = {
      countActiveCareerGoals: vi.fn(async () => 0),
      listActiveCareerGoals: vi.fn(async () => []),
      createCareerGoal: vi.fn(async (payload: any) => ({
        id: "cg-sync-1",
        ...payload,
        status: "active",
        createdAt: new Date(),
      })),
      appendStructuredProfileMeta: vi.fn(async () => undefined),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    await defineCareerGoalTool.executeConfirmed!(
      {
        title: "Atingir Pro Stakes em 12 meses",
        horizon: "ano",
      },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    // Sync chamada com entry origem='career_goal' + id=careerGoalId
    expect(injectedStorage.appendStructuredProfileMeta).toHaveBeenCalledTimes(1);
    const [userId, meta] = injectedStorage.appendStructuredProfileMeta.mock.calls[0];
    expect(userId).toBe("USER-1");
    expect(meta.origem).toBe("career_goal");
    expect(meta.id).toBe("cg-sync-1");
    expect(meta.prazo).toBe("trimestre");
  });

  it("horizon='mes' → prazo='mes' na entry sync", async () => {
    const injectedStorage: any = {
      countActiveCareerGoals: vi.fn(async () => 0),
      listActiveCareerGoals: vi.fn(async () => []),
      createCareerGoal: vi.fn(async (payload: any) => ({
        id: "cg-sync-2",
        ...payload,
      })),
      appendStructuredProfileMeta: vi.fn(async () => undefined),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    await defineCareerGoalTool.executeConfirmed!(
      { title: "Bater 200 torneios no mes", horizon: "mes" },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    const [, meta] = injectedStorage.appendStructuredProfileMeta.mock.calls[0];
    expect(meta.prazo).toBe("mes");
  });
});

describe("define_career_goal — undo remove entry sync de metas", () => {
  it("undo deleta career_goals row + remove entry com origem='career_goal' + id matching", async () => {
    const injectedStorage: any = {
      deleteCareerGoal: vi.fn(async () => undefined),
      removeStructuredProfileMetaByCareerGoal: vi.fn(async () => undefined),
    };
    const { defineCareerGoalTool } = await import(
      "../../../../server/coachTools/handlers/defineCareerGoal"
    );
    await defineCareerGoalTool.undo!(
      null,
      { id: "cg-sync-1" },
      { userId: "USER-1", injectedStorage } as any,
      undefined,
    );
    expect(injectedStorage.deleteCareerGoal).toHaveBeenCalledWith(
      expect.stringMatching(/cg-sync-1/),
    );
    expect(injectedStorage.removeStructuredProfileMetaByCareerGoal).toHaveBeenCalledWith(
      "USER-1",
      "cg-sync-1",
    );
  });
});

describe("getAllUserGoals — helper unifica 2 fontes", () => {
  it("retorna { structured: career_goals[], legacy: metas[] }", async () => {
    const structured = [
      { id: "cg-1", title: "Meta estruturada", status: "active" },
    ];
    const legacy = [
      { id: "m-1", texto: "Meta legacy texto livre", origem: "onboarding" },
    ];
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => structured),
      getStructuredProfileMetas: vi.fn(async () => legacy),
    };
    const { getAllUserGoals } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await getAllUserGoals("USER-1", injectedStorage);
    expect(r.structured).toEqual(structured);
    expect(r.legacy).toEqual(legacy);
  });

  it("não deduplica entries com origem='career_goal' do legacy", async () => {
    // ADR-168 §2.2: helper apresenta as 2 fontes sem deduplicar — fica a critério do consumidor.
    const structured = [{ id: "cg-1", title: "Meta", status: "active" }];
    const legacy = [
      { id: "cg-1", texto: "Meta (resumo)", origem: "career_goal" },
      { id: "m-2", texto: "Outra", origem: "onboarding" },
    ];
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => structured),
      getStructuredProfileMetas: vi.fn(async () => legacy),
    };
    const { getAllUserGoals } = await import(
      "../../../../server/storage/careerGoalsStorage"
    );
    const r = await getAllUserGoals("USER-1", injectedStorage);
    expect(r.legacy).toHaveLength(2);
    expect(r.structured).toHaveLength(1);
  });
});
