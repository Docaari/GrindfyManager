// =============================================================================
// Sprint AI-2B / RF-03 (ADR-169 §2.2) — isReportEligible branch 'quarterly'
//
// Cobre:
//   - PREF_FIELD_BY_KIND adiciona quarterly → 'reportQuarterlyEnabled'.
//   - Trial + reportQuarterlyEnabled=true → true.
//   - Pro+ + reportQuarterlyEnabled=true → true.
//   - Free + reportQuarterlyEnabled=true → false (tier override).
//   - Expired + reportQuarterlyEnabled=true → false.
//   - reportQuarterlyEnabled=false → false em qualquer tier.
//   - Erro de leitura → safe-deny false.
//
// Status esperado: TODOS FALHAM (branch quarterly não existe ainda).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isReportEligible('quarterly') — tier × opt-in", () => {
  it("Trial + reportQuarterlyEnabled=true → true", async () => {
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "trial" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: true }),
    });
    expect(r).toBe(true);
  });

  it("Pro (active+resolveUserTier='pro') + opt-in true → true", async () => {
    vi.doMock("../../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "pro"),
    }));
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "active" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: true }),
    });
    expect(r).toBe(true);
  });

  it("Admin + opt-in true → true", async () => {
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "admin" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: true }),
    });
    expect(r).toBe(true);
  });

  it("Free + reportQuarterlyEnabled=true → false (tier override)", async () => {
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "free" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: true }),
    });
    expect(r).toBe(false);
  });

  it("Expired + opt-in true → false", async () => {
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "expired" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: true }),
    });
    expect(r).toBe(false);
  });

  it("Trial + reportQuarterlyEnabled=false → false (opt-in override)", async () => {
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "trial" }),
      getPrefs: async () => ({ reportQuarterlyEnabled: false }),
    });
    expect(r).toBe(false);
  });

  it("erro em getPrefs → safe-deny false", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { isReportEligible } = await import(
      "../../../../server/coach/reportEligibility"
    );
    const r = await isReportEligible("U", "quarterly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "trial" }),
      getPrefs: async () => { throw new Error("db down"); },
    });
    expect(r).toBe(false);
    errSpy.mockRestore();
  });
});

describe("PREF_FIELD_BY_KIND — mapping quarterly", () => {
  it("expõe quarterly → 'reportQuarterlyEnabled'", async () => {
    const mod: any = await import(
      "../../../../server/coach/reportEligibility"
    );
    expect(mod.PREF_FIELD_BY_KIND).toBeTruthy();
    expect(mod.PREF_FIELD_BY_KIND.quarterly).toBe("reportQuarterlyEnabled");
  });
});
