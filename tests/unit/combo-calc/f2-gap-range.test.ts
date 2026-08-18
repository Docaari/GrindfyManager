// F2 — regra nova `gap-range` em RANGE_TOKEN_RULES (D-F2-3, ADR-247).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.5, "Arquitetura desta frente")
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-3)
//
// Unica adicao ao parser nesta frente. `combos.ts` ja e uma tabela ORDENADA de
// regras (D9 do indice, F0): esta e a UNICA entrada nova, para "T9s-54s" —
// intervalo de conectores/gappers com o MESMO gap dos dois lados do "-",
// variando a carta alta entre os dois limites. Formato: mesmo shape sintatico
// de `kicker-range` ("A5s-A2s"), mas kicker-range exige o MESMO rank alto dos
// dois lados (`m[1] === m[4]`) e devolve `null` quando os ranks altos
// diferem — e exatamente esse `null` que abre espaco para `gap-range`, sem
// que uma regra precise saber da outra (contrato `expand: null` cede a vez).
//
// Contrato assumido: `gap-range` valida `rIdx(hi) - rIdx(kicker)` IGUAL dos
// dois lados do "-"; gaps diferentes -> null (cede a vez, nao "sou eu e
// falho"). Saida SEMPRE ascendente por forca (mesma convencao das regras
// existentes), independente da ordem em que o jogador digitou os dois lados.
import { describe, it, expect } from "vitest";
import { expandRangeToken } from "@/lib/combo-calc/combos";

describe("F2 D-F2-3 — gap-range: T9s-54s (regra nova)", () => {
  it("T9s-54s expande os 6 conectores suited de gap 1, ascendente", () => {
    expect(expandRangeToken("T9s-54s")).toEqual([
      "54s", "65s", "76s", "87s", "98s", "T9s",
    ]);
  });

  it("a ordem dos limites no input nao muda o resultado (54s-T9s == T9s-54s)", () => {
    expect(expandRangeToken("54s-T9s")).toEqual(expandRangeToken("T9s-54s"));
  });

  it("offsuit tambem funciona: 98o-54o expande os gappers offsuit de gap 1", () => {
    expect(expandRangeToken("98o-54o")).toEqual(["54o", "65o", "76o", "87o", "98o"]);
  });

  it("gap 2 (ex.: JT8-52... ) tambem preserva o proprio gap, nao o de 1", () => {
    // J8s (gap 2: J=9,8=6 -> 3? conferido abaixo por indice) ate 53s (mesmo gap).
    // RANK_STR = 23456789TJQKA; idx(J)=9, idx(8)=6 -> gap=3; idx(5)=3, idx(2)=0 -> gap=3.
    expect(expandRangeToken("J8s-52s")).toEqual([
      "52s", "63s", "74s", "85s", "96s", "T7s", "J8s",
    ]);
  });
});

describe("F2 D-F2-3 — gap-range cede a vez quando o gap nao bate (nao inventa numero)", () => {
  it("gaps diferentes dos dois lados devolvem [] (nenhuma regra reivindica o token)", () => {
    // T9s (gap 1) vs 53s (gap 2): gap-range devolve null, kicker-range tambem
    // (ranks altos diferentes), e o fallback de notacao literal falha porque
    // "T9s-53s" nao e uma notacao valida sozinha.
    expect(expandRangeToken("T9s-53s")).toEqual([]);
  });

  it("suits diferentes dos dois lados tambem nao casam (T9s-54o)", () => {
    expect(expandRangeToken("T9s-54o")).toEqual([]);
  });
});

describe("F2 D-F2-3 — regras existentes continuam funcionando (regressao)", () => {
  it("55-TT (pairs-range) continua intacta", () => {
    expect(expandRangeToken("55-TT")).toEqual(["55", "66", "77", "88", "99", "TT"]);
  });

  it("AsKh (notacao especifica, fallback) continua intacta", () => {
    expect(expandRangeToken("AsKh")).toEqual(["AsKh"]);
  });

  it("A5s-A2s (kicker-range, mesmo rank alto) continua intacta", () => {
    expect(expandRangeToken("A5s-A2s")).toEqual(["A2s", "A3s", "A4s", "A5s"]);
  });

  it("99+ (pairs-plus) continua intacta", () => {
    expect(expandRangeToken("99+")).toEqual(["99", "TT", "JJ", "QQ", "KK", "AA"]);
  });

  it("98s+ (conector, gap preservado subindo) continua intacta", () => {
    expect(expandRangeToken("98s+")).toEqual(["98s", "T9s", "JTs", "QJs", "KQs", "AKs"]);
  });
});
