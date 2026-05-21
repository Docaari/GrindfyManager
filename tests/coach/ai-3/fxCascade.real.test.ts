// =============================================================================
// Sprint AI-3 / RF-02 (ADR-174 §2.2) — FX cascade wire real
//
// shared/fxCascade.ts deve deixar de importar stubs
// (shared/fx/{bcbClient,frankfurterClient}.ts) e delegar para os adapters de
// produção (server/services/fx/adapters/{bcbPtaxAdapter,frankfurterAdapter}).
//
// Adapter shape: FxRow[] com {currency, date, ratePerUsd, source}
//   - NÃO o shape legado {value, date} dos stubs (lesson #3).
//
// Casos:
//   - BCB retorna FxRow[] → avg de ratePerUsd, retorna número.
//   - BCB throw FxFetchError → log + fallback Frankfurter (lesson #9).
//   - BCB retorna [] + Frankfurter retorna BRL rows → avg do fallback.
//   - Frankfurter retorna mix (BRL + EUR) → filtra currency==='BRL'.
//   - Ambos vazios → throw 'no_fx_data'.
//   - Cache 24h: 2x mesmo range → adapter chamado 1x.
//
// Status esperado: TODOS FALHAM (impl ainda usa stubs).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fxCascade.getAveragePtaxForRange — BCB adapter (shape FxRow real)", () => {
  it("BCB retorna 3 rates BRL com {currency, date, ratePerUsd, source} → média correta", async () => {
    const fetchTimeseriesBrl = vi.fn(async (_from: string, _to: string) => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.00, source: "bcb_ptax" },
      { currency: "BRL", date: "2026-02-15", ratePerUsd: 5.10, source: "bcb_ptax" },
      { currency: "BRL", date: "2026-03-15", ratePerUsd: 5.20, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-03-31");
    expect(avg).toBeCloseTo(5.10, 2);
    expect(fetchTimeseriesBrl).toHaveBeenCalledWith("2026-01-01", "2026-03-31");
  });

  it("BCB retorna 60 rates → avg correto (sanidade janela trimestral)", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      currency: "BRL",
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      ratePerUsd: 5.0 + (i % 10) * 0.01, // 5.00, 5.01, ..., 5.09 ciclando
      source: "bcb_ptax",
    }));
    const fetchTimeseriesBrl = vi.fn(async () => rows);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-03-31");
    // 60 rates cyclando 5.00..5.09 = média ≈ 5.045
    expect(avg).toBeCloseTo(5.045, 2);
  });
});

describe("fxCascade.getAveragePtaxForRange — fallback Frankfurter (lesson #9 log antes)", () => {
  it("BCB throw FxFetchError → log + fallback Frankfurter (filtra BRL do mix)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchTimeseriesBrl = vi.fn(async () => {
      throw new Error("FxFetchError: bcb_ptax HTTP 503");
    });
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    // Frankfurter retorna mix BRL + EUR — só BRL deve entrar na média.
    const fetchTimeseries = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.05, source: "frankfurter" },
      { currency: "EUR", date: "2026-01-15", ratePerUsd: 0.92, source: "frankfurter" },
      { currency: "BRL", date: "2026-02-15", ratePerUsd: 5.15, source: "frankfurter" },
      { currency: "EUR", date: "2026-02-15", ratePerUsd: 0.93, source: "frankfurter" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-02-28");
    // (5.05 + 5.15) / 2 = 5.10 — EUR foi filtrado.
    expect(avg).toBeCloseTo(5.10, 2);

    // Lesson #9: logou ANTES do fallback.
    expect(errSpy).toHaveBeenCalled();
    const firstCall = (errSpy.mock.calls[0] ?? [])[0];
    expect(String(firstCall)).toContain("fxCascade.bcb");
    errSpy.mockRestore();
  });

  it("BCB retorna [] (vazio) → fallback Frankfurter sem throw", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => []);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.20, source: "frankfurter" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(avg).toBeCloseTo(5.20, 2);
    expect(fetchTimeseries).toHaveBeenCalled();
  });

  it("Frankfurter chamado com symbols=['BRL'] (não busca currencies não usadas)", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => []);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.00, source: "frankfurter" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(fetchTimeseries).toHaveBeenCalled();
    const call = fetchTimeseries.mock.calls[0];
    // 3o arg = symbols
    expect(Array.isArray(call[2])).toBe(true);
    expect(call[2]).toContain("BRL");
  });
});

describe("fxCascade.getAveragePtaxForRange — ambos vazios → no_fx_data", () => {
  it("BCB [] + Frankfurter [] → throw 'no_fx_data'", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => []);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => []);
    vi.doMock("../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await expect(
      mod.getAveragePtaxForRange("2026-01-01", "2026-01-02"),
    ).rejects.toThrow(/no_fx_data/);
  });

  it("BCB throw + Frankfurter throw → throw 'no_fx_data' (segue caindo)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchTimeseriesBrl = vi.fn(async () => {
      throw new Error("FxFetchError: bcb network");
    });
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));
    const fetchTimeseries = vi.fn(async () => {
      throw new Error("FxFetchError: frankfurter network");
    });
    vi.doMock("../../../server/services/fx/adapters/frankfurterAdapter", () => ({
      fetchTimeseries,
      frankfurterAdapter: { fetchTimeseries },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await expect(
      mod.getAveragePtaxForRange("2026-01-01", "2026-01-02"),
    ).rejects.toThrow(/no_fx_data/);
    errSpy.mockRestore();
  });
});

describe("fxCascade.getAveragePtaxForRange — cache 24h", () => {
  it("2x mesmo range → adapter BCB chamado 1x", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.10, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(fetchTimeseriesBrl).toHaveBeenCalledTimes(1);
  });

  it("ranges diferentes → cache miss → adapter chamado N vezes", async () => {
    const fetchTimeseriesBrl = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.10, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    await mod.getAveragePtaxForRange("2026-02-01", "2026-02-28");
    expect(fetchTimeseriesBrl).toHaveBeenCalledTimes(2);
  });
});

describe("fxCascade — stubs deletados (regressão)", () => {
  it("cascade NÃO importa shared/fx/bcbClient (deletado)", async () => {
    // Helper: o módulo cascade não deve importar nada de shared/fx/* legacy.
    // Após a deleção, qualquer tentativa de import dentro de fxCascade quebraria.
    // Aqui validamos via NÃO-mock do path antigo + mock do adapter novo:
    const fetchTimeseriesBrl = vi.fn(async () => [
      { currency: "BRL", date: "2026-01-15", ratePerUsd: 5.10, source: "bcb_ptax" },
    ]);
    vi.doMock("../../../server/services/fx/adapters/bcbPtaxAdapter", () => ({
      fetchTimeseriesBrl,
      bcbPtaxAdapter: { fetchTimeseriesBrl },
    }));

    const mod: any = await import("../../../shared/fxCascade");
    if (typeof mod._resetFxCascadeCacheForTests === "function") {
      mod._resetFxCascadeCacheForTests();
    }
    const avg = await mod.getAveragePtaxForRange("2026-01-01", "2026-01-31");
    expect(avg).toBeCloseTo(5.10, 2);
    // Se o módulo legado bcbClient/frankfurterClient ainda fosse usado, o
    // adapter novo não seria invocado.
    expect(fetchTimeseriesBrl).toHaveBeenCalled();
  });
});
