// =============================================================================
// Sprint AI-2A — Tool eligibility integration.
//
// Cobre:
//   - Chamada de tool AI-2A com Trial passa (antes do AI-2A blockava — Trial mapeado free).
//   - Chamada de tool AI-2A com Free -> 'tool_not_eligible_tier' OR ausente da lista.
//   - Chamada com Pro -> passa normalmente.
//
// Status esperado: TODOS FALHAM (toolEligibility nao existe + integracao no registry/route).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("Tool eligibility integration — Trial passa nas tools AI-2A", () => {
  it("Trial chama bulk_propose_grade -> nao retorna tool_not_eligible_tier", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U-TRIAL", subscriptionPlan: "trial" },
      "bulk_propose_grade",
    );
    expect(r).toBe(true);
  });

  it("Trial chama analyze_variance -> permitida", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U-TRIAL", subscriptionPlan: "trial" },
      "analyze_variance",
    );
    expect(r).toBe(true);
  });
});

describe("Tool eligibility integration — Free bloqueada das AI-2A", () => {
  it("Free chama bulk_propose_grade -> false (tool_not_eligible_tier)", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U-FREE", subscriptionPlan: "free" },
      "bulk_propose_grade",
    );
    expect(r).toBe(false);
  });

  it("Free chama compute_grind_study_ratio -> false", async () => {
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U-FREE", subscriptionPlan: "free" },
      "compute_grind_study_ratio",
    );
    expect(r).toBe(false);
  });
});

describe("Tool eligibility integration — Pro+ inalterado", () => {
  it("Pro chama bulk_propose_grade -> true", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "pro"),
    }));
    const { isToolEligibleTier } = await import("../../../../server/coach/toolEligibility");
    const r = await isToolEligibleTier(
      { id: "U-PRO", subscriptionPlan: "active" },
      "bulk_propose_grade",
    );
    expect(r).toBe(true);
  });
});
