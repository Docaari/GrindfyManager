// F2 — gestos puros da matriz (D-F2-1, ADR-247).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.1)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-1)
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/lib/combo-calc/rangeGestures.ts):
//
//   export function expandCtrlClick(notation: string): string[];
//     // = expandRangeToken(notation + "+") — ZERO gramatica nova (D9 do indice).
//   export function rowHeaderCells(row: number): string[];
//     // cellNotation(row, i) para i de 0 a 12 — RangeMatrix.tsx:cellNotation
//   export function colHeaderCells(col: number): string[];
//     // cellNotation(i, col) para i de 0 a 12
//   export function rectangleBetween(
//     a: { row: number; col: number },
//     b: { row: number; col: number },
//   ): string[];
//     // cellNotation(r, c) para r em [min,max](a.row,b.row), c em [min,max](a.col,b.col),
//     // row-major (r crescente por fora, c crescente por dentro). Simetrico: a<->b
//     // dao o mesmo resultado.
//   export function scrollFrequencyDelta(current: number, wheelDeltaY: number): number;
//     // deltaY > 0 (scroll para baixo) reduz 5%; deltaY < 0 (scroll para cima)
//     // aumenta 5%. clampFreq nos dois extremos (reusa combos.ts, sem funcao nova).
//
// `rowHeaderCells`/`colHeaderCells` importam `cellNotation` de
// `@/components/range-lab/RangeMatrix` (ja exportado pela F1) — a propria ADR
// diz "deriva da MESMA matematica de cellNotation, sem tabela propria".
//
// LICOES: #8 (nao asserte enum.length; aqui vale o oposto — asserte a lista
// INTEIRA com toEqual, porque a ordem e a identidade dos 13 elementos SAO o
// contrato, nao um detalhe incidental).
import { describe, it, expect } from "vitest";
import { cellNotation } from "@/components/range-lab/RangeMatrix";
import { expandRangeToken } from "@/lib/combo-calc/combos";
import {
  expandCtrlClick,
  rowHeaderCells,
  colHeaderCells,
  rectangleBetween,
  scrollFrequencyDelta,
} from "@/lib/combo-calc/rangeGestures";

describe("F2 D-F2-1 — expandCtrlClick reusa expandRangeToken(notation + '+'), zero gramatica nova", () => {
  it("Ctrl+clique no par 22 seleciona todos os pares ate AA (criterio de aceite 1)", () => {
    expect(expandCtrlClick("22")).toEqual([
      "22", "33", "44", "55", "66", "77", "88", "99", "TT", "JJ", "QQ", "KK", "AA",
    ]);
  });

  it("Ctrl+clique em A9s sobe o kicker ate AKs (criterio de aceite 2)", () => {
    expect(expandCtrlClick("A9s")).toEqual(["A9s", "ATs", "AJs", "AQs", "AKs"]);
  });

  it("Ctrl+clique num conector (gap=1) sobe as DUAS cartas preservando o gap", () => {
    expect(expandCtrlClick("98s")).toEqual(["98s", "T9s", "JTs", "QJs", "KQs", "AKs"]);
  });

  it("Ctrl+clique em AA e o caso trivial: so AA mesmo", () => {
    expect(expandCtrlClick("AA")).toEqual(["AA"]);
  });

  it("e literalmente expandRangeToken(notation + '+'), sem implementacao paralela", () => {
    for (const n of ["22", "A9s", "98s", "KQo", "T7o"]) {
      expect(expandCtrlClick(n)).toEqual(expandRangeToken(n + "+"));
    }
  });
});

describe("F2 D-F2-1 — cabecalho de linha/coluna deriva de cellNotation, sem tabela propria", () => {
  it("rowHeaderCells(0) e a linha do Ace: par + todos os suited com A alta", () => {
    expect(rowHeaderCells(0)).toEqual([
      "AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    ]);
  });

  it("colHeaderCells(0) e a coluna do Ace: par + todos os offsuit com A alta", () => {
    expect(colHeaderCells(0)).toEqual([
      "AA", "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
    ]);
  });

  it("rowHeaderCells(1) e a linha do K: mistura AKo (K como kicker) com KQs..K2s (K carta alta)", () => {
    expect(rowHeaderCells(1)).toEqual([
      "AKo", "KK", "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
    ]);
  });

  it("colHeaderCells(1) e a coluna do K: mistura AKs (K como kicker) com KQo..K2o", () => {
    expect(colHeaderCells(1)).toEqual([
      "AKs", "KK", "KQo", "KJo", "KTo", "K9o", "K8o", "K7o", "K6o", "K5o", "K4o", "K3o", "K2o",
    ]);
  });

  it("linha e coluna do MESMO rank sao conjuntos DIFERENTES, exceto o par (obrigacao do ADR)", () => {
    for (let idx = 0; idx < 13; idx++) {
      const row = rowHeaderCells(idx);
      const col = colHeaderCells(idx);
      const shared = row.filter((c) => col.includes(c));
      expect(
        shared,
        `rank idx=${idx}: linha e coluna compartilham alem do par: ${shared.join(",")}`,
      ).toHaveLength(1);
      expect(shared[0].length, "o unico elemento compartilhado deve ser o par (2 chars)").toBe(2);
    }
  });

  it("cada eixo deriva literalmente de cellNotation, sem tabela propria", () => {
    for (let i = 0; i < 13; i++) {
      expect(rowHeaderCells(3)[i]).toBe(cellNotation(3, i));
      expect(colHeaderCells(3)[i]).toBe(cellNotation(i, 3));
    }
  });
});

describe("F2 D-F2-1 — Shift+clique pinta o retangulo entre duas celulas", () => {
  it("retangulo 2x2 no canto AA produz as 4 celulas, row-major", () => {
    expect(rectangleBetween({ row: 0, col: 0 }, { row: 1, col: 1 })).toEqual([
      "AA", "AKs", "AKo", "KK",
    ]);
  });

  it("retangulo e simetrico: comecar de qualquer canto da o mesmo conjunto e a mesma ordem", () => {
    const fromTopLeft = rectangleBetween({ row: 0, col: 0 }, { row: 1, col: 1 });
    const fromBottomRight = rectangleBetween({ row: 1, col: 1 }, { row: 0, col: 0 });
    expect(fromBottomRight).toEqual(fromTopLeft);
  });

  it("retangulo 3x3 cobre exatamente as 9 celulas esperadas", () => {
    expect(rectangleBetween({ row: 0, col: 0 }, { row: 2, col: 2 })).toEqual([
      "AA", "AKs", "AQs",
      "AKo", "KK", "KQs",
      "AQo", "KQo", "QQ",
    ]);
  });

  it("retangulo de uma unica celula (mesma origem e destino) devolve so ela", () => {
    expect(rectangleBetween({ row: 4, col: 4 }, { row: 4, col: 4 })).toEqual(["TT"]);
  });
});

describe("F2 emenda A7 — scroll na celula ajusta a frequencia da classe em passos de 5%", () => {
  it("deltaY positivo (scroll para baixo) reduz 5%", () => {
    expect(scrollFrequencyDelta(0.5, 10)).toBeCloseTo(0.45, 9);
  });

  it("deltaY negativo (scroll para cima) aumenta 5%", () => {
    expect(scrollFrequencyDelta(0.5, -10)).toBeCloseTo(0.55, 9);
  });

  it("nunca desce abaixo de 0 (clampFreq)", () => {
    expect(scrollFrequencyDelta(0.02, 10)).toBe(0);
  });

  it("nunca sobe acima de 1 (clampFreq)", () => {
    expect(scrollFrequencyDelta(0.98, -10)).toBe(1);
  });

  it("de 0 continua em 0 ao rolar para baixo (nao vira negativo)", () => {
    expect(scrollFrequencyDelta(0, 10)).toBe(0);
  });

  it("de 1 continua em 1 ao rolar para cima (nao ultrapassa 100%)", () => {
    expect(scrollFrequencyDelta(1, -10)).toBe(1);
  });
});
