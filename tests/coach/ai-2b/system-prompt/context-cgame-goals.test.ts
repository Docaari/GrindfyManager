// =============================================================================
// Sprint AI-2B / RF-08 (page context) — assembleContext blocos DINÂMICOS novos
//
// Cobre:
//   - Bloco "## Metas ativas" se user tem career_goals ativas (top 3).
//   - Bloco "## C-game recente" se há warm-ups recentes (últimos 30d).
//   - Empty: 0 metas + 0 warm-ups → blocos omitidos.
//   - getMentalHandHistoryRecent block (top N do trimestre — RF-08 §disclaimer).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("assembleContext — bloco '## Metas ativas'", () => {
  it("user com 2 metas ativas → bloco populado com top 3", async () => {
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => [
        { id: "cg-1", title: "Atingir Pro Stakes", horizon: "ano" },
        { id: "cg-2", title: "ROI 8%", horizon: "trimestre" },
      ]),
      listWarmupRitualsForRange: vi.fn(async () => []),
      getStructuredProfile: vi.fn(async () => null),
      listMentalHandsForRange: vi.fn(async () => []),
    };
    const { assembleContext } = await import(
      "../../../../server/services/coachContext"
    );
    const ctx = await assembleContext({ userId: "USER-1", route: "/coach-ai", injectedStorage } as any);
    const dynamicText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    expect(dynamicText).toMatch(/Metas ativas/i);
    expect(dynamicText).toMatch(/Atingir Pro Stakes/);
  });

  it("user sem metas → bloco omitido", async () => {
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => []),
      listWarmupRitualsForRange: vi.fn(async () => []),
      getStructuredProfile: vi.fn(async () => null),
      listMentalHandsForRange: vi.fn(async () => []),
    };
    const { assembleContext } = await import(
      "../../../../server/services/coachContext"
    );
    const ctx = await assembleContext({ userId: "USER-1", route: "/coach-ai", injectedStorage } as any);
    const dynamicText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    expect(dynamicText).not.toMatch(/Metas ativas/i);
  });
});

describe("assembleContext — bloco '## C-game recente'", () => {
  it("user com warm-ups recentes → bloco com aPct/bPct/cPct", async () => {
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => []),
      listWarmupRitualsForRange: vi.fn(async () => [
        { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 3, overrideUsed: true, decisionToPlay: true },
      ]),
      getStructuredProfile: vi.fn(async () => null),
      listMentalHandsForRange: vi.fn(async () => []),
    };
    const { assembleContext } = await import(
      "../../../../server/services/coachContext"
    );
    const ctx = await assembleContext({ userId: "USER-1", route: "/coach-ai", injectedStorage } as any);
    const dynamicText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    expect(dynamicText).toMatch(/C-game.*recente|C-game recente/i);
    expect(dynamicText).toMatch(/A-game|B-game|C-game/);
  });

  it("user sem warm-ups → bloco C-game omitido", async () => {
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => []),
      listWarmupRitualsForRange: vi.fn(async () => []),
      getStructuredProfile: vi.fn(async () => null),
      listMentalHandsForRange: vi.fn(async () => []),
    };
    const { assembleContext } = await import(
      "../../../../server/services/coachContext"
    );
    const ctx = await assembleContext({ userId: "USER-1", route: "/coach-ai", injectedStorage } as any);
    const dynamicText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    expect(dynamicText).not.toMatch(/C-game recente/i);
  });
});

describe("assembleContext — getMentalHandHistoryRecent block (DINÂMICO)", () => {
  it("user com mental hands recentes → bloco populado com até 3 highlights", async () => {
    const injectedStorage: any = {
      listActiveCareerGoals: vi.fn(async () => []),
      listWarmupRitualsForRange: vi.fn(async () => []),
      getStructuredProfile: vi.fn(async () => null),
      listMentalHandsForRange: vi.fn(async () => [
        { id: "mh-1", occurredAt: new Date(), emotion: "tilt", situation: "BB 30", idealResponse: "fold" },
      ]),
    };
    const { assembleContext } = await import(
      "../../../../server/services/coachContext"
    );
    const ctx = await assembleContext({ userId: "USER-1", route: "/coach-ai", injectedStorage } as any);
    const dynamicText = typeof ctx === "string" ? ctx : JSON.stringify(ctx);
    expect(dynamicText).toMatch(/Mental Hand|mental hand|tilt/i);
  });
});
