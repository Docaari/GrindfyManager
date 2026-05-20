// =============================================================================
// Sprint AI-2B — registry: 4 tools novas (define_career_goal, evaluate_career_goal,
// log_mental_hand, compute_irpf_summary).
//
// Lesson #8: valida presença INDIVIDUAL, NUNCA length absoluta.
//
// Cobre:
//   - 4 tools registradas em coachTools/index.ts (agregado).
//   - Cada uma com inputSchema Zod válido.
//   - gateByTier inclui Pro+ (e Trial via isToolEligibleTier — formal helper).
//   - Write tools (define_career_goal + log_mental_hand): requiresConfirmation=true + auditLevel='persist'.
//   - Read tools (evaluate_career_goal + compute_irpf_summary): requiresConfirmation falsy + auditLevel='log'.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

const AI_2B_TOOLS = [
  "define_career_goal",
  "evaluate_career_goal",
  "log_mental_hand",
  "compute_irpf_summary",
];

describe("AI-2B tools registry", () => {
  it("as 4 tools estão no coachTools agregado", async () => {
    const mod = await import("../../../../server/coachTools");
    const names = (mod.coachTools as any[]).map((t) => t.name);
    for (const name of AI_2B_TOOLS) {
      expect(names, `tool ${name} ausente`).toContain(name);
    }
  });

  it("cada tool AI-2B tem inputSchema válido (Zod)", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    for (const name of AI_2B_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `tool ${name} ausente`).toBeTruthy();
      expect(tool.inputSchema, `tool ${name} sem inputSchema`).toBeTruthy();
      expect(typeof tool.inputSchema.safeParse).toBe("function");
    }
  });

  it("cada tool AI-2B tem gateByTier incluindo Pro+", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    for (const name of AI_2B_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.gateByTier, `${name} sem gateByTier`).toBeTruthy();
      expect(tool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
    }
  });

  it("write tools (2) têm requiresConfirmation=true + auditLevel='persist'", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    const writeNames = ["define_career_goal", "log_mental_hand"];
    for (const name of writeNames) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.requiresConfirmation, `${name} requiresConfirmation`).toBe(true);
      expect(tool.auditLevel, `${name} auditLevel`).toBe("persist");
    }
  });

  it("read tools (2) têm requiresConfirmation falsy + auditLevel='log'", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    const readNames = ["evaluate_career_goal", "compute_irpf_summary"];
    for (const name of readNames) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.requiresConfirmation, `${name} requiresConfirmation`).toBeFalsy();
      expect(tool.auditLevel, `${name} auditLevel`).toBe("log");
    }
  });
});

describe("AI-2B tools — Trial elegível via isToolEligibleTier", () => {
  it("isToolEligibleTier retorna true para as 4 tools quando user é trial", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "free"),
    }));
    const { isToolEligibleTier } = await import(
      "../../../../server/coach/toolEligibility"
    );
    const trialUser = { userPlatformId: "U", subscriptionPlan: "trial" } as any;
    for (const name of AI_2B_TOOLS) {
      const ok = await isToolEligibleTier(trialUser, name);
      expect(ok, `tool ${name} deveria estar elegível para Trial`).toBe(true);
    }
  });

  it("Free user → 4 tools negadas", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "free"),
    }));
    const { isToolEligibleTier } = await import(
      "../../../../server/coach/toolEligibility"
    );
    const freeUser = { userPlatformId: "U", subscriptionPlan: "free" } as any;
    for (const name of AI_2B_TOOLS) {
      const ok = await isToolEligibleTier(freeUser, name);
      expect(ok, `tool ${name} deveria ser negada para Free`).toBe(false);
    }
  });
});
