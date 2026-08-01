import { describe, it, expect } from "vitest";
import {
  BUYIN_BANDS,
  FIELD_BANDS,
  MODIFIER_FILTERS,
  resolveBands,
} from "@shared/dashboard-filter-bands";
import { BUYIN_BUCKETS } from "../../../server/scoring/scoringConstants";

// =============================================================================
// Guarda de paridade das faixas de ABI.
//
// `shared/dashboard-filter-bands` redeclara as 12 faixas de buy-in porque o
// cliente nao pode importar `server/`. Sem esta guarda, alguem ajusta o recorte
// no Tournament Selector e o dashboard passa a chamar de "$16-19" um intervalo
// diferente — o jogador ve dois numeros com o mesmo rotulo e nao entende.
// =============================================================================

describe("BUYIN_BANDS x BUYIN_BUCKETS (paridade)", () => {
  it("cobre os mesmos intervalos, na mesma ordem", () => {
    expect(BUYIN_BANDS.map((b) => ({ min: b.min, max: b.max }))).toEqual(
      BUYIN_BUCKETS.map((b) => ({ min: b.min, max: b.max })),
    );
  });

  it("usa o mesmo rotulo que o jogador ve na area Torneios", () => {
    expect(BUYIN_BANDS.map((b) => b.label)).toEqual(
      BUYIN_BUCKETS.map((b) => b.range),
    );
  });

  it("nao tem buraco entre uma faixa e a proxima", () => {
    for (let i = 1; i < BUYIN_BANDS.length; i++) {
      expect(BUYIN_BANDS[i].min).toBe(BUYIN_BANDS[i - 1].max);
    }
  });
});

describe("FIELD_BANDS", () => {
  it("comeca em zero e termina aberto", () => {
    expect(FIELD_BANDS[0].min).toBe(0);
    expect(FIELD_BANDS[FIELD_BANDS.length - 1].max).toBe(Infinity);
  });

  it("tem id unico por faixa", () => {
    const ids = FIELD_BANDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mantem os cortes que o jogador ja conhecia nos botoes rapidos", () => {
    expect(FIELD_BANDS.map((b) => b.label)).toEqual([
      "<100",
      "100-300",
      "300-700",
      "700-1500",
      "1500-3000",
      "3000-6000",
      "6000-12000",
      "12000+",
    ]);
  });
});

describe("resolveBands", () => {
  it("devolve vazio para entrada ausente ou vazia", () => {
    expect(resolveBands(undefined, BUYIN_BANDS)).toEqual([]);
    expect(resolveBands(null, BUYIN_BANDS)).toEqual([]);
    expect(resolveBands([], BUYIN_BANDS)).toEqual([]);
  });

  it("traduz id em intervalo", () => {
    expect(resolveBands(["abi_20_29"], BUYIN_BANDS)).toEqual([
      { min: 20, max: 30 },
    ]);
  });

  it("traduz varias faixas preservando a ordem pedida", () => {
    expect(resolveBands(["abi_71_130", "abi_1_6"], BUYIN_BANDS)).toEqual([
      { min: 71, max: 131 },
      { min: 0, max: 7 },
    ]);
  });

  it("ignora id desconhecido em vez de quebrar (URL antiga / editada a mao)", () => {
    expect(resolveBands(["abi_20_29", "nao_existe"], BUYIN_BANDS)).toEqual([
      { min: 20, max: 30 },
    ]);
  });

  it("preserva Infinity na ultima faixa", () => {
    expect(resolveBands(["abi_1k_plus"], BUYIN_BANDS)).toEqual([
      { min: 1000, max: Infinity },
    ]);
  });
});

describe("MODIFIER_FILTERS", () => {
  it("trata satelite e flight como coisas separadas", () => {
    const ids = MODIFIER_FILTERS.map((m) => m.id);
    expect(ids).toContain("satellite");
    expect(ids).toContain("flight");
  });
});
