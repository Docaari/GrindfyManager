// =============================================================================
// Sprint AI-1C / RF-02 — smoke tests para getReportTier + isReportEligible.
// Foco: tabela canonica de elegibilidade (Trial elegivel; Free nunca) + safe-deny.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getReportTier — tabela canonica RF-02", () => {
  it("user null -> 'free'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier(null)).toBe("free");
  });

  it("subscription_plan='trial' -> 'eligible'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "trial" })).toBe("eligible");
  });

  it("subscription_plan='admin' -> 'eligible'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "admin" })).toBe("eligible");
  });

  it("role='admin' (mesmo com plan='free') -> 'eligible'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", role: "admin", subscriptionPlan: "free" })).toBe("eligible");
  });

  it("subscription_plan='free' -> 'free'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "free" })).toBe("free");
  });

  it("subscription_plan='expired' -> 'free'", async () => {
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "expired" })).toBe("free");
  });

  it("subscription_plan='active' + resolveUserTier='pro' -> 'eligible'", async () => {
    vi.doMock("../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "pro"),
    }));
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "active" })).toBe("eligible");
  });

  it("subscription_plan='active' + resolveUserTier='free' -> 'free'", async () => {
    vi.doMock("../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => "free"),
    }));
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "active" })).toBe("free");
  });

  it("subscription_plan='active' + resolveUserTier lanca -> safe-deny 'free'", async () => {
    vi.doMock("../../../server/coachAccess", () => ({
      resolveUserTier: vi.fn(async () => { throw new Error("db down"); }),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getReportTier } = await import("../../../server/coach/reportEligibility");
    expect(await getReportTier({ userPlatformId: "U", subscriptionPlan: "active" })).toBe("free");
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("isReportEligible — tier + opt-in combinado", () => {
  it("Free com opt-in true -> false (tier override)", async () => {
    const { isReportEligible } = await import("../../../server/coach/reportEligibility");
    const r = await isReportEligible("U", "weekly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "free" }),
      getPrefs: async () => ({ reportWeeklyEnabled: true }),
    });
    expect(r).toBe(false);
  });

  it("Trial com opt-in true -> true", async () => {
    const { isReportEligible } = await import("../../../server/coach/reportEligibility");
    const r = await isReportEligible("U", "weekly", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "trial" }),
      getPrefs: async () => ({ reportWeeklyEnabled: true }),
    });
    expect(r).toBe(true);
  });

  it("Trial com opt-in false -> false", async () => {
    const { isReportEligible } = await import("../../../server/coach/reportEligibility");
    const r = await isReportEligible("U", "daily", {
      getUser: async () => ({ userPlatformId: "U", subscriptionPlan: "trial" }),
      getPrefs: async () => ({ reportDailyEnabled: false }),
    });
    expect(r).toBe(false);
  });

  it("erro de leitura -> safe-deny false", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { isReportEligible } = await import("../../../server/coach/reportEligibility");
    const r = await isReportEligible("U", "monthly", {
      getUser: async () => { throw new Error("boom"); },
      getPrefs: async () => ({ reportMonthlyEnabled: true }),
    });
    expect(r).toBe(false);
    errSpy.mockRestore();
  });
});

describe("LIST_USERS_FOR_REPORTS_FILTER — filtro SQL canonico", () => {
  it("inclui trial/active/admin; nao inclui free/expired", async () => {
    const { LIST_USERS_FOR_REPORTS_FILTER } = await import("../../../server/coach/reportEligibility");
    expect(LIST_USERS_FOR_REPORTS_FILTER).toContain("trial");
    expect(LIST_USERS_FOR_REPORTS_FILTER).toContain("active");
    expect(LIST_USERS_FOR_REPORTS_FILTER).toContain("admin");
    expect(LIST_USERS_FOR_REPORTS_FILTER).not.toContain("expired");
    expect(LIST_USERS_FOR_REPORTS_FILTER).not.toContain("free");
  });
});
