// =============================================================================
// Sprint AI-2B / RF-04 (ADR-169 §RF-04) — compute_irpf_summary tool (read, ad-hoc)
//
// Cobre:
//   - Descritor: name + requiresConfirmation:false + auditLevel:'log' + Pro+/Trial.
//   - Zod: period {start, end} YYYY-MM-DD; rejeita period.end < period.start.
//   - Output: profitUsd + profitBrl via fxCascade.getAveragePtaxForRange + avgPtax + byCurrency + disclaimer.
//   - BR-only: user country != BR ou timezone fora america/* → erro 'br_only'.
//   - FX via fxCascade.getAveragePtaxForRange.
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("compute_irpf_summary — descritor", () => {
  it("name + requiresConfirmation:false + auditLevel:'log' + Pro+", async () => {
    const { computeIrpfSummaryTool } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    expect(computeIrpfSummaryTool.name).toBe("compute_irpf_summary");
    expect(computeIrpfSummaryTool.requiresConfirmation).toBeFalsy();
    expect(computeIrpfSummaryTool.auditLevel).toBe("log");
    expect(computeIrpfSummaryTool.gateByTier).toEqual(
      expect.arrayContaining(["pro", "premium", "admin"]),
    );
  });
});

describe("compute_irpf_summary — Zod validation", () => {
  it("rejeita period.end < period.start", async () => {
    const { computeIrpfSummaryInputSchema } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    expect(
      computeIrpfSummaryInputSchema.safeParse({
        period: { start: "2026-04-01", end: "2026-01-01" },
      }).success,
    ).toBe(false);
  });

  it("rejeita datas fora de YYYY-MM-DD", async () => {
    const { computeIrpfSummaryInputSchema } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    expect(
      computeIrpfSummaryInputSchema.safeParse({
        period: { start: "01/01/2026", end: "31/03/2026" },
      }).success,
    ).toBe(false);
  });

  it("aceita period válido", async () => {
    const { computeIrpfSummaryInputSchema } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    expect(
      computeIrpfSummaryInputSchema.safeParse({
        period: { start: "2026-01-01", end: "2026-03-31" },
      }).success,
    ).toBe(true);
  });
});

describe("compute_irpf_summary — execução", () => {
  it("user BR → retorna profitUsd + profitBrl + avgPtax + disclaimer", async () => {
    const injectedStorage: any = {
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-BR",
        country: "BR",
        timezone: "America/Sao_Paulo",
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 10000,
        tournaments: 200,
        buyInSum: 6000,
        byCurrency: [
          { currency: "USD", profit: 8000 },
          { currency: "BRL", profit: 10200 },
        ],
      })),
    };
    vi.doMock("../../../../shared/fxCascade", () => ({
      fxCascade: { getAveragePtaxForRange: vi.fn(async () => 5.10) },
      getAveragePtaxForRange: vi.fn(async () => 5.10),
    }));
    const { computeIrpfSummaryTool } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const out: any = await computeIrpfSummaryTool.handler!(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-BR", injectedStorage } as any,
    );
    expect(out.profitUsd).toBeCloseTo(10000, 0);
    expect(out.profitBrl).toBeCloseTo(51000, 0);
    expect(out.avgPtax).toBeCloseTo(5.10, 2);
    expect(out.disclaimer).toMatch(/informativo|contador|substituir/i);
    expect(Array.isArray(out.byCurrency)).toBe(true);
  });

  it("user não-BR → retorna ok:false error='br_only'", async () => {
    const injectedStorage: any = {
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-US",
        country: "US",
        timezone: "America/New_York",
      })),
    };
    const { computeIrpfSummaryTool } = await import(
      "../../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const out: any = await computeIrpfSummaryTool.handler!(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-US", injectedStorage } as any,
    );
    expect(out?.ok).toBe(false);
    expect(out?.error).toBe("br_only");
  });
});
