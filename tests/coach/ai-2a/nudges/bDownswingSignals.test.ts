// =============================================================================
// Sprint AI-2A / RF-08 (ADR-167) — getDrawdownInWindow helper.
//
// Cobre:
//   - Helper getDrawdownInWindow(userId, windowDays, injectedStorage?) em
//     coachSignalsStorage.ts.
//   - refBankroll via getConsolidatedBalanceAt; current via getConsolidatedBalance.
//   - drawdownPct = (ref - current)/ref * 100.
//   - Sem snapshot razoavel -> sampleConfidence='low'.
//   - Safe-deny em erro (lesson #9).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("getDrawdownInWindow helper", () => {
  it("ref=1000 USD, current=800 USD -> drawdownPct=20", async () => {
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 800),
      getConsolidatedBalanceAt: vi.fn(async () => 1000),
    }));
    const mod = await import("../../../../server/storage/coachSignalsStorage");
    const fn = (mod as any).getDrawdownInWindow;
    expect(typeof fn).toBe("function");
    const r = await fn("U", 7);
    expect(r).toBeTruthy();
    expect(r.refBankrollUsd).toBe(1000);
    expect(r.currentBankrollUsd).toBe(800);
    expect(r.drawdownPct).toBeCloseTo(20, 1);
    expect(r.sampleConfidence === "high" || r.sampleConfidence === "low").toBeTruthy();
  });

  it("sem snapshot historico -> null OR sampleConfidence='low'", async () => {
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 1000),
      getConsolidatedBalanceAt: vi.fn(async () => null), // sem snapshot
    }));
    const mod = await import("../../../../server/storage/coachSignalsStorage");
    const fn = (mod as any).getDrawdownInWindow;
    const r = await fn("U", 7);
    if (r) {
      expect(r.sampleConfidence).toBe("low");
    } else {
      expect(r).toBeNull();
    }
  });

  it("erro no walletService -> safe-deny null + log", async () => {
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => { throw new Error("db down"); }),
      getConsolidatedBalanceAt: vi.fn(async () => 1000),
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("../../../../server/storage/coachSignalsStorage");
    const fn = (mod as any).getDrawdownInWindow;
    const r = await fn("U", 7);
    expect(r === null || r?.sampleConfidence === "low").toBeTruthy();
    errSpy.mockRestore();
  });

  it("current > ref -> drawdownPct = 0 (no loss)", async () => {
    vi.doMock("../../../../server/services/walletService", () => ({
      getConsolidatedBalance: vi.fn(async () => 1200),
      getConsolidatedBalanceAt: vi.fn(async () => 1000),
    }));
    const mod = await import("../../../../server/storage/coachSignalsStorage");
    const fn = (mod as any).getDrawdownInWindow;
    const r = await fn("U", 7);
    expect(r.drawdownPct).toBeLessThanOrEqual(0);
  });
});
