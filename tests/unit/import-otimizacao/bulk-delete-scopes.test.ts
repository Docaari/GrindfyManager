/**
 * ADR-243 — escopos do painel de remocao. Antes so existiam dois inputs de data
 * digitados a mao e nenhuma forma de remover tudo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SCOPES, windowForScope } from "../../../client/src/components/upload/BulkDeleteTournamentsCard";

describe("escopos de remocao", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("oferece atalho para tudo e para os periodos comuns", () => {
    expect(SCOPES.map((s) => s.id)).toEqual(["all", "7d", "30d", "90d", "year", "custom"]);
  });

  it("7d/30d/90d terminam hoje e comecam N dias atras", () => {
    expect(windowForScope("7d")).toEqual({ from: "2026-07-24", to: "2026-07-31" });
    expect(windowForScope("30d")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(windowForScope("90d")).toEqual({ from: "2026-05-02", to: "2026-07-31" });
  });

  it("'este ano' comeca em 1 de janeiro", () => {
    expect(windowForScope("year")).toEqual({ from: "2026-01-01", to: "2026-07-31" });
  });

  it("'tudo' e 'personalizado' nao impoem janela", () => {
    expect(windowForScope("all")).toEqual({ from: null, to: null });
    expect(windowForScope("custom")).toEqual({ from: null, to: null });
  });
});
