// =============================================================================
// Sprint AI-2A / RF-06.4 (ADR-166) — calculate_effective_rake
//
// Cobre:
//   - Zod: period enum 30d|90d|6m default 90d.
//   - Agrega tournaments.rake por site quando filtro não especificado.
//   - rakeEstimated=true quando algum tournament tem rake field ausente (10% MTT default).
//   - totalRakebackUsd via wallet_transactions WHERE reason='rakeback'.
//   - effectiveRakePct = totalRake/totalBuyIn * 100.
//   - netRakePct = (rake - rakeback)/buyIn * 100.
//   - Descritor: read tool + Pro+.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("calculate_effective_rake — Zod validation", () => {
  it("rejeita period invalido", async () => {
    const { calculateEffectiveRakeInputSchema } = await import(
      "../../../../server/coachTools/handlers/calculateEffectiveRake"
    );
    expect(
      calculateEffectiveRakeInputSchema.safeParse({ period: "12m" }).success,
    ).toBe(false);
  });
});

describe("calculate_effective_rake — agregacao", () => {
  it("agrupa bySite quando filtro nao especificado", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: [
          { id: "t1", site: "WPN", buyInUsd: 100, rakeUsd: 10 },
          { id: "t2", site: "WPN", buyInUsd: 200, rakeUsd: 20 },
          { id: "t3", site: "GG", buyInUsd: 50, rakeUsd: 5 },
        ],
      })),
      getRakebackTransactions: vi.fn(async () => ({ totalUsd: 0 })),
    };
    const { calculateEffectiveRakeTool } = await import(
      "../../../../server/coachTools/handlers/calculateEffectiveRake"
    );
    const r: any = await calculateEffectiveRakeTool.handler(
      { period: "90d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(Array.isArray(r.bySite)).toBe(true);
    const sites = r.bySite.map((s: any) => s.site);
    expect(sites).toEqual(expect.arrayContaining(["WPN", "GG"]));
    expect(r.totalBuyInUsd).toBe(350);
    expect(r.totalRakeUsd).toBe(35);
    expect(r.effectiveRakePct).toBeCloseTo(10, 1);
  });

  it("rakeEstimated=true quando algum tournament sem rake field (10% MTT default)", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: [
          { id: "t1", site: "WPN", buyInUsd: 100, rakeUsd: 10 },
          { id: "t2", site: "Stars", buyInUsd: 100 }, // sem rake -> estimado 10
        ],
      })),
      getRakebackTransactions: vi.fn(async () => ({ totalUsd: 0 })),
    };
    const { calculateEffectiveRakeTool } = await import(
      "../../../../server/coachTools/handlers/calculateEffectiveRake"
    );
    const r: any = await calculateEffectiveRakeTool.handler(
      { period: "90d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.rakeEstimated).toBe(true);
    expect(r.totalRakeUsd).toBeCloseTo(20, 1);
  });

  it("totalRakebackUsd via wallet_transactions reason=rakeback; netRakePct correto", async () => {
    const injectedStorage: any = {
      getPerformanceByPeriod: vi.fn(async () => ({
        tournaments: [{ id: "t1", site: "WPN", buyInUsd: 1000, rakeUsd: 100 }],
      })),
      getRakebackTransactions: vi.fn(async () => ({ totalUsd: 30 })),
    };
    const { calculateEffectiveRakeTool } = await import(
      "../../../../server/coachTools/handlers/calculateEffectiveRake"
    );
    const r: any = await calculateEffectiveRakeTool.handler(
      { period: "90d" },
      { userId: "U", injectedStorage } as any,
    );
    expect(r.totalRakebackUsd).toBe(30);
    expect(r.effectiveRakePct).toBeCloseTo(10, 1);
    expect(r.netRakePct).toBeCloseTo(7, 1);
  });
});

describe("calculate_effective_rake — descritor", () => {
  it("read tool + tier Pro+", async () => {
    const { calculateEffectiveRakeTool } = await import(
      "../../../../server/coachTools/handlers/calculateEffectiveRake"
    );
    expect(calculateEffectiveRakeTool.name).toBe("calculate_effective_rake");
    expect(calculateEffectiveRakeTool.requiresConfirmation).toBeFalsy();
    expect(calculateEffectiveRakeTool.auditLevel).toBe("log");
    expect(calculateEffectiveRakeTool.gateByTier).toEqual(expect.arrayContaining(["pro", "premium", "admin"]));
  });
});
