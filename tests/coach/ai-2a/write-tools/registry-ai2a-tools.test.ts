// =============================================================================
// Sprint AI-2A — registry de tools (4 write + 5 diagnostic = 9 tools novas).
//
// Lesson #8: valida presenca INDIVIDUAL, nao length absoluta.
//
// Cobre:
//   - As 9 tools novas estao exportadas + registradas em coachTools/index.ts.
//   - Cada uma tem schema valido (Zod).
//   - gateByTier alinhado com isToolEligibleTier (Pro+).
//
// Status esperado: TODOS FALHAM (tools nao existem ainda).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

const AI_2A_TOOLS = [
  "bulk_propose_grade",
  "schedule_study_block",
  "create_study_theme",
  "mark_off_day",
  "analyze_variance",
  "diagnose_plateau",
  "compute_grind_study_ratio",
  "calculate_effective_rake",
  "query_pool_intelligence",
];

describe("AI-2A tools registry", () => {
  it("as 9 tools estao no coachTools agregado (export array)", async () => {
    const mod = await import("../../../../server/coachTools");
    const names = (mod.coachTools as any[]).map((t) => t.name);
    for (const name of AI_2A_TOOLS) {
      expect(names).toContain(name);
    }
  });

  it("cada tool AI-2A tem inputSchema valido (Zod)", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    for (const name of AI_2A_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `tool ${name} ausente`).toBeTruthy();
      expect(tool.inputSchema, `tool ${name} sem inputSchema`).toBeTruthy();
      expect(typeof tool.inputSchema.safeParse).toBe("function");
    }
  });

  it("cada tool AI-2A tem gateByTier incluindo Pro+", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    for (const name of AI_2A_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.gateByTier, `tool ${name} sem gateByTier`).toBeTruthy();
      expect(tool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
    }
  });

  it("write tools (4) tem requiresConfirmation=true e auditLevel='persist'", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    const writeNames = ["bulk_propose_grade", "schedule_study_block", "create_study_theme", "mark_off_day"];
    for (const name of writeNames) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.requiresConfirmation, `${name} requiresConfirmation`).toBe(true);
      expect(tool.auditLevel, `${name} auditLevel`).toBe("persist");
    }
  });

  it("read/diagnostic tools (5) tem requiresConfirmation=false e auditLevel='log'", async () => {
    const mod = await import("../../../../server/coachTools");
    const tools = mod.coachTools as any[];
    const readNames = [
      "analyze_variance",
      "diagnose_plateau",
      "compute_grind_study_ratio",
      "calculate_effective_rake",
      "query_pool_intelligence",
    ];
    for (const name of readNames) {
      const tool = tools.find((t) => t.name === name);
      expect(tool.requiresConfirmation, `${name} requiresConfirmation`).toBeFalsy();
      expect(tool.auditLevel, `${name} auditLevel`).toBe("log");
    }
  });
});
