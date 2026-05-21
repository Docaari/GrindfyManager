// =============================================================================
// Sprint AI-2B / RF-04 (ADR-169 §2.6) — fxCascade.getAveragePtaxForRange helper
// Sprint AI-3 / RF-02 (ADR-174 §2.2) — wire real para adapters.
//
// Cobre:
//   - Média simples dos PTAX diários do BCB em uma janela [start, end].
//   - Fallback para frankfurter se BCB indisponível (lesson #9 — logar antes).
//   - Cache 24h via existing fx cache pattern.
//   - Vazio (sem rates no range) → throw 'no_fx_data'.
//
// AI-3 RF-02 — agora mocka adapters (`server/services/fx/adapters/*`) em vez
// dos stubs deletados `shared/fx/*`.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("fxCascade.getAveragePtaxForRange — média simples", () => {
  it("3 dias de rates BCB [5.00, 5.10, 5.20] → 5.10", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.00, source: "bcb_ptax" },
      { currency: "BRL", date: "2026-02-15", ratePerUsd: 5.10, source: "bcb_ptax" },
      { currency: "BRL", date: "2026-03-15", ratePerUsd: 5.20, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-03-31");
    expect(avg).toBeCloseTo(5.10, 2);
  });
});

describe("fxCascade.getAveragePtaxForRange — fallback frankfurter", () => {
  it("BCB falha → tenta frankfurter (lesson #9 — log antes do fallback)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchTimeseriesBrl = vi.fn(async () => { throw new Error("BCB down"); });
    vi.doMock("../../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.05, source: "frankfurter" },
      { currency: "BRL", date: "2026-02-15", ratePerUsd: 5.15, source: "frankfurter" },
    ]);
    vi.doMock("../../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-02-28");
    expect(avg).toBeCloseTo(5.10, 2);
    expect(errSpy).toHaveBeenCalled(); // logou antes do fallback
    errSpy.mockRestore();
  });
});

describe("fxCascade.getAveragePtaxForRange — sem dados", () => {
  it("Nenhuma source retorna rates → throw 'no_fx_data'", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => []);
    vi.doMock("../../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => []);
    vi.doMock("../../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await expect(
      mod.getAveragePtaxForRange("2026-01-01", "2026-01-02"),
    ).rejects.toThrow(/no_fx_data|sem.*rates|empty/i);
  });
});

describe("fxCascade.getAveragePtaxForRange — cache", () => {
  it("2 calls com mesmo range → segundo hit cache (1 chamada BCB)", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.00, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const mod: any = await import("../../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(fetchTimeseriesBrl).toHaveBeenCalledTimes(1);
  });
});
