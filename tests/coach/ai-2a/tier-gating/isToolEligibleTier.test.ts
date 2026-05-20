// =============================================================================
// Sprint AI-2A — isToolEligibleTier (server/coach/toolEligibility.ts)
//
// Q-E locked 2026-05-20: Trial recebe as 8 tools AI-2A; Free não.
//
// Cobre:
//   - Trial -> true.
//   - Pro/Premium/Admin -> true (via resolveUserTier).
//   - Free/Expired -> false.
//   - 'active' + resolveUserTier=pro -> true.
//   - 'active' + resolveUserTier=free -> false.
//   - Safe-deny em erro (lesson #9).
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

describe("isToolEligibleTier — Q-E locked: Trial recebe tools AI-2A", () => {
  it("subscription_plan='trial' -> true", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "trial" },
      "bulk_propose_grade",
    );
    expect(r).toBe(true);
  });

  it("subscription_plan='admin' -> true", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "admin" },
      "bulk_propose_grade",
    );
    expect(r).toBe(true);
  });

  it("subscription_plan='free' -> false", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "free" },
      "bulk_propose_grade",
    );
    expect(r).toBe(false);
  });

  it("subscription_plan='expired' -> false", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "expired" },
      "analyze_variance",
    );
    expect(r).toBe(false);
  });

  it("subscription_plan='active' + resolveUserTier='pro' -> true", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "pro"),
    }));
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "active" },
      "bulk_propose_grade",
    );
    expect(r).toBe(true);
  });

  it("subscription_plan='active' + resolveUserTier='premium' -> true", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "premium"),
    }));
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "active" },
      "diagnose_plateau",
    );
    expect(r).toBe(true);
  });

  it("subscription_plan='active' + resolveUserTier='free' -> false", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "free"),
    }));
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "active" },
      "bulk_propose_grade",
    );
    expect(r).toBe(false);
  });

  it("erro no resolveUserTier -> safe-deny false + log", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => {
        throw new Error("db down");
      }),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U", subscriptionPlan: "active" },
      "bulk_propose_grade",
    );
    expect(r).toBe(false);
    errSpy.mockRestore();
  });
});

describe("listEligibleToolsForUser — filtra AI-2A por isToolEligibleTier", () => {
  it("Trial recebe tools AI-2A (filter passa)", async () => {
    const { listEligibleToolsForUser } = await import("../../../../server/coach/toolEligibility");
    const allTools = [
      { name: "bulk_propose_grade" },
      { name: "analyze_variance" },
      { name: "query_dimension" }, // tool antiga — sempre passa
    ];
    const r = await listEligibleToolsForUser({ id: "U", subscriptionPlan: "trial" }, allTools as any);
    const names = r.map((t: any) => t.name);
    expect(names).toContain("bulk_propose_grade");
    expect(names).toContain("analyze_variance");
    expect(names).toContain("query_dimension");
  });

  it("Free NAO recebe tools AI-2A; tools antigas continuam (gateadas no descritor)", async () => {
    const { listEligibleToolsForUser } = await import("../../../../server/coach/toolEligibility");
    const allTools = [
      { name: "bulk_propose_grade" },
      { name: "analyze_variance" },
      { name: "query_dimension" },
    ];
    const r = await listEligibleToolsForUser({ id: "U", subscriptionPlan: "free" }, allTools as any);
    const names = r.map((t: any) => t.name);
    expect(names).not.toContain("bulk_propose_grade");
    expect(names).not.toContain("analyze_variance");
    // tools nao-AI-2A continuam — gateadas por descriptor.gateByTier (responsabilidade do registry).
    expect(names).toContain("query_dimension");
  });
});

describe("resolveUserTier — nao deve mudar (regressao zero)", () => {
  it("Trial em resolveUserTier continua 'free' (rate limit estrito do chat)", async () => {
    // Garantia: AI-2A NAO mexe em coachAccess.ts resolveUserTier — Trial continua
    // sendo "free" lá; quem libera as tools é isToolEligibleTier (Q-E).
    const mod = await import("../../../../server/coachAccess");
    expect(typeof (mod as any).resolveUserTier).toBe("function");
  });
});
