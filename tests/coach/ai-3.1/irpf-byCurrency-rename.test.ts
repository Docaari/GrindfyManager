// =============================================================================
// Sprint AI-3.1 / RF-02 — byCurrency.profit rename para profitNative
//
// MEDIUM-1 do reviewer AI-3: compute_irpf_summary retorna
// `byCurrency[ccy].profit` que e' nativo da moeda (nao USD). Nome ambiguo.
// Rename para `profitNative` (canonico) + manter alias `profit` deprecated
// por 1 sprint (mesmo valor; comentario @deprecated removal target AI-3.2).
//
// Audit consumers (resumo no resumo final):
//   - server/coachTools/handlers/computeIrpfSummary.ts (linhas 85-93) — fonte
//   - server/services/quarterlyReportGenerator.ts (296-317) — re-monta byCurrency
//     proprio (NAO consome computeIrpfSummary output; nao precisa rename aqui)
//   - server/services/weeklyReportGenerator.ts:291 — array consumer (acessa
//     consolidated.byCurrency mas nao .profit, e' iteracao)
//   - server/services/dailyDebriefGenerator.ts (166-206) — Map nativo proprio
//     (nao consome compute_irpf_summary)
//   - client/src/components/grind-session-live/* — usa byCurrency dos session
//     stats, shape DIFERENTE (profit vem de finishedEntry, nao IRPF). NAO migra.
//   ===> Unico consumer DIRETO do output do tool: o LLM via system prompt do
//        Coach + a JSON tool response que vai pro chat (acesso via name 'profit').
//        Audit grep nao identifica UI dedicada IRPF (defer permanente UI).
//
// Status esperado: TODOS FALHAM (campo profitNative nao existe).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStorageBr(): any {
  return {
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-1",
      country: "BR",
      timezone: "America/Sao_Paulo",
    })),
    getPerformanceByPeriod: vi.fn(async () => ({
      profit: 5000,
      byCurrency: [
        { currency: "BRL", profit: 25000 },
        { currency: "USD", profit: 2000 },
      ],
    })),
  };
}

describe("RF-02 — byCurrency.profitNative rename + alias deprecated", () => {
  it("output inclui byCurrency[i].profitNative populado (campo canonico novo)", async () => {
    // Stub fxCascade.getAveragePtaxForRange para retornar PTAX valido.
    vi.doMock("../../../shared/fxCascade", () => ({
      getAveragePtaxForRange: vi.fn(async () => 5.0),
    }));

    const { computeIrpfSummaryTool } = await import(
      "../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const result: any = await computeIrpfSummaryTool.handler(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-1", injectedStorage: makeStorageBr() },
    );

    expect(Array.isArray(result.byCurrency)).toBe(true);
    expect(result.byCurrency.length).toBe(2);
    const brl = result.byCurrency.find((c: any) => c.currency === "BRL");
    expect(brl).toBeDefined();
    // profitNative deve estar populado com o valor nativo da moeda.
    expect(brl.profitNative).toBe(25000);
  });

  it("output mantem alias deprecated `profit` com MESMO valor que profitNative", async () => {
    vi.doMock("../../../shared/fxCascade", () => ({
      getAveragePtaxForRange: vi.fn(async () => 5.0),
    }));

    const { computeIrpfSummaryTool } = await import(
      "../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const result: any = await computeIrpfSummaryTool.handler(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-1", injectedStorage: makeStorageBr() },
    );

    const brl = result.byCurrency.find((c: any) => c.currency === "BRL");
    const usd = result.byCurrency.find((c: any) => c.currency === "USD");

    // Back-compat: `profit` continua presente e bate com profitNative.
    expect(brl.profit).toBe(brl.profitNative);
    expect(brl.profit).toBe(25000);
    expect(usd.profit).toBe(usd.profitNative);
    expect(usd.profit).toBe(2000);
  });

  it("profitNative reflete valor NATIVO da moeda (NAO convertido para USD)", async () => {
    vi.doMock("../../../shared/fxCascade", () => ({
      getAveragePtaxForRange: vi.fn(async () => 5.0),
    }));

    const storage = {
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-1",
        country: "BR",
        timezone: "America/Sao_Paulo",
      })),
      getPerformanceByPeriod: vi.fn(async () => ({
        profit: 1000,
        byCurrency: [
          { currency: "EUR", profit: 8000 }, // 8000 EUR nativo
        ],
      })),
    };

    const { computeIrpfSummaryTool } = await import(
      "../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const result: any = await computeIrpfSummaryTool.handler(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-1", injectedStorage: storage as any },
    );

    const eur = result.byCurrency.find((c: any) => c.currency === "EUR");
    // Nativo deve ser 8000 (sem conversao).
    expect(eur.profitNative).toBe(8000);
    // convertedUsd diferente (no codigo atual passa nativo direto qd nao-BRL).
    // Aqui o foco e' garantir que profitNative NAO sofreu conversao USD.
  });

  it("preserva campos existentes (currency/convertedUsd/convertedBrl) pos-rename", async () => {
    vi.doMock("../../../shared/fxCascade", () => ({
      getAveragePtaxForRange: vi.fn(async () => 5.0),
    }));

    const { computeIrpfSummaryTool } = await import(
      "../../../server/coachTools/handlers/computeIrpfSummary"
    );
    const result: any = await computeIrpfSummaryTool.handler(
      { period: { start: "2026-01-01", end: "2026-03-31" } },
      { userId: "USER-1", injectedStorage: makeStorageBr() },
    );

    const brl = result.byCurrency.find((c: any) => c.currency === "BRL");
    expect(brl.currency).toBe("BRL");
    expect(brl).toHaveProperty("convertedUsd");
    expect(brl).toHaveProperty("convertedBrl");
    // Shape pos-rename: tem profitNative E profit (alias).
    expect(brl).toHaveProperty("profitNative");
    expect(brl).toHaveProperty("profit");
  });
});
