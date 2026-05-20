// =============================================================================
// Sprint AI-2B / RF-04 (ADR-169 §2.6) — fxCascade.getAveragePtaxForRange helper
//
// Cobre:
//   - Média simples dos PTAX diários do BCB em uma janela [start, end].
//   - Fallback para frankfurter se BCB indisponível (lesson #9 — logar antes).
//   - Cache 24h via existing fx cache pattern.
//   - Vazio (sem rates no range) → throw 'no_fx_data'.
//
// Status esperado: TODOS FALHAM (helper novo).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("fxCascade.getAveragePtaxForRange — média simples", () => {
  it("3 dias de rates BCB [5.00, 5.10, 5.20] → 5.10", async () => {
    vi.doMock("../../../../shared/fxCascade", async () => {
      const actual: any = await vi.importActual("../../../../shared/fxCascade");
      return actual;
    });
    // Mock BCB fetcher para retornar 3 rates
    const fetchBcb = vi.fn(async () => [
      { date: "2026-01-15", value: 5.00 },
      { date: "2026-02-15", value: 5.10 },
      { date: "2026-03-15", value: 5.20 },
    ]);
    vi.doMock("../../../../shared/fx/bcbClient", () => ({
      fetchBcbRatesForRange: fetchBcb,
      default: { fetchBcbRatesForRange: fetchBcb },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-03-31");
    expect(avg).toBeCloseTo(5.10, 2);
  });
});

describe("fxCascade.getAveragePtaxForRange — fallback frankfurter", () => {
  it("BCB falha → tenta frankfurter (lesson #9 — log antes do fallback)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("../../../../shared/fx/bcbClient", () => ({
      fetchBcbRatesForRange: vi.fn(async () => { throw new Error("BCB down"); }),
      default: { fetchBcbRatesForRange: vi.fn(async () => { throw new Error("BCB down"); }) },
    }));
    const fetchFrank = vi.fn(async () => [
      { date: "2026-01-15", value: 5.05 },
      { date: "2026-02-15", value: 5.15 },
    ]);
    vi.doMock("../../../../shared/fx/frankfurterClient", () => ({
      fetchFrankfurterRatesForRange: fetchFrank,
      default: { fetchFrankfurterRatesForRange: fetchFrank },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-02-28");
    expect(avg).toBeCloseTo(5.10, 2);
    expect(errSpy).toHaveBeenCalled(); // logou antes do fallback
    errSpy.mockRestore();
  });
});

describe("fxCascade.getAveragePtaxForRange — sem dados", () => {
  it("Nenhuma source retorna rates → throw 'no_fx_data'", async () => {
    vi.doMock("../../../../shared/fx/bcbClient", () => ({
      fetchBcbRatesForRange: vi.fn(async () => []),
      default: { fetchBcbRatesForRange: vi.fn(async () => []) },
    }));
    vi.doMock("../../../../shared/fx/frankfurterClient", () => ({
      fetchFrankfurterRatesForRange: vi.fn(async () => []),
      default: { fetchFrankfurterRatesForRange: vi.fn(async () => []) },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    await expect(
      mod.getAveragePtaxForRange("2026-01-01", "2026-01-02"),
    ).rejects.toThrow(/no_fx_data|sem.*rates|empty/i);
  });
});

describe("fxCascade.getAveragePtaxForRange — cache", () => {
  it("2 calls com mesmo range → segundo hit cache (1 chamada BCB)", async () => {
    const fetchBcb = vi.fn(async () => [
      { date: "2026-01-15", value: 5.00 },
    ]);
    vi.doMock("../../../../shared/fx/bcbClient", () => ({
      fetchBcbRatesForRange: fetchBcb,
      default: { fetchBcbRatesForRange: fetchBcb },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(fetchBcb).toHaveBeenCalledTimes(1);
  });
});
