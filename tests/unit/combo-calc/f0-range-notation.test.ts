// RF-00.3 — Notacao `+` com carta adjacente sobe o gap; atalhos AXs / KXo / XX.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma medido:
//   expandRangeToken("98s+") -> ["98s"]
//   expandRangeToken("54s+") -> ["54s"]
//   expandRangeToken("T9o+") -> ["T9o"]
//   expandRangeToken("AXs")  -> []      (silencio total)
// Quem cola range de solver com conectores perde parte do range em silencio.
//
// Convencao PokerStove/Equilab: `XYs+` com Y = X-1 (conector) sobe AS DUAS
// cartas preservando o gap; gap maior mantem "carta alta fixa, kicker sobe".
// Ordem de saida: ascendente, igual ao "99+" e ao "A5s-A2s" que ja existem.
import { describe, it, expect } from "vitest";
import { expandRangeToken } from "@/lib/combo-calc/combos";

describe("RF-00.3 — conector com '+' sobe as duas cartas", () => {
  it("98s+ entra inteiro: 98s ate AKs (6 notacoes)", () => {
    expect(expandRangeToken("98s+")).toEqual([
      "98s",
      "T9s",
      "JTs",
      "QJs",
      "KQs",
      "AKs",
    ]);
  });

  it("54s+ entra inteiro: 54s ate AKs (10 notacoes)", () => {
    expect(expandRangeToken("54s+")).toEqual([
      "54s",
      "65s",
      "76s",
      "87s",
      "98s",
      "T9s",
      "JTs",
      "QJs",
      "KQs",
      "AKs",
    ]);
  });

  it("T9o+ entra inteiro: T9o ate AKo", () => {
    // ATENCAO (test-writer): o criterio de aceite da spec diz "T9o+ -> 4", mas o
    // proprio texto da spec fixa "98s+ = 98s, T9s, JTs, QJs, KQs, AKs" (6, indo
    // ate o topo). Pela mesma regra T9o+ e T9o, JTo, QJo, KQo, AKo = 5. O "4" da
    // lista de criterios e contagem incoerente com a regra declarada; travamos a
    // regra, nao o numero. Divergencia reportada no resumo da fase RED.
    expect(expandRangeToken("T9o+")).toEqual(["T9o", "JTo", "QJo", "KQo", "AKo"]);
  });

  it("32s+ entra inteiro a partir da base da escada (12 notacoes)", () => {
    const out = expandRangeToken("32s+");
    expect(out).toHaveLength(12);
    expect(out[0]).toBe("32s");
    expect(out[out.length - 1]).toBe("AKs");
  });

  it("KQs+ para no topo do baralho", () => {
    expect(expandRangeToken("KQs+")).toEqual(["KQs", "AKs"]);
  });

  it("AKs+ continua devolvendo so AKs (nao gera par) — contrato existente", () => {
    expect(expandRangeToken("AKs+")).toEqual(["AKs"]);
  });

  it("AKo+ continua devolvendo so AKo", () => {
    expect(expandRangeToken("AKo+")).toEqual(["AKo"]);
  });

  it("aceita maiuscula/minuscula do sufixo do naipe", () => {
    expect(expandRangeToken("98S+")).toEqual(expandRangeToken("98s+"));
    expect(expandRangeToken("T9O+")).toEqual(expandRangeToken("T9o+"));
  });
});

describe("RF-00.3 — gap maior que 1 nao regride", () => {
  it("ATs+ continua sendo carta alta fixa com kicker subindo (4 notacoes)", () => {
    expect(expandRangeToken("ATs+")).toEqual(["ATs", "AJs", "AQs", "AKs"]);
  });

  it("KTo+ continua sendo carta alta fixa com kicker subindo (3 notacoes)", () => {
    expect(expandRangeToken("KTo+")).toEqual(["KTo", "KJo", "KQo"]);
  });

  it("T8s+ (gap 2) mantem o kicker subindo sob a mesma carta alta", () => {
    expect(expandRangeToken("T8s+")).toEqual(["T8s", "T9s"]);
  });

  it("pares e intervalos nao mudam", () => {
    expect(expandRangeToken("99+")).toEqual(["99", "TT", "JJ", "QQ", "KK", "AA"]);
    expect(expandRangeToken("A5s-A2s")).toEqual(["A2s", "A3s", "A4s", "A5s"]);
  });
});

describe("RF-00.3 — atalho 'X' (qualquer kicker) e 'XX' (todos os pares)", () => {
  it("AXs abre os 12 suited do as", () => {
    const out = expandRangeToken("AXs");
    expect(out).toEqual([
      "A2s",
      "A3s",
      "A4s",
      "A5s",
      "A6s",
      "A7s",
      "A8s",
      "A9s",
      "ATs",
      "AJs",
      "AQs",
      "AKs",
    ]);
  });

  it("KXo abre os 11 offsuit do rei (kicker sempre abaixo da carta alta)", () => {
    const out = expandRangeToken("KXo");
    expect(out).toHaveLength(11);
    expect(out[0]).toBe("K2o");
    expect(out[out.length - 1]).toBe("KQo");
    expect(out).not.toContain("KAo");
    expect(out).not.toContain("KKo");
  });

  it("o atalho vale para qualquer carta alta, nao so A e K", () => {
    expect(expandRangeToken("QXs")).toEqual([
      "Q2s",
      "Q3s",
      "Q4s",
      "Q5s",
      "Q6s",
      "Q7s",
      "Q8s",
      "Q9s",
      "QTs",
      "QJs",
    ]);
    expect(expandRangeToken("5Xo")).toEqual(["52o", "53o", "54o"]);
  });

  it("2Xs nao tem kicker abaixo e devolve vazio em vez de lixo", () => {
    expect(expandRangeToken("2Xs")).toEqual([]);
  });

  it("XX abre os 13 pares", () => {
    expect(expandRangeToken("XX")).toEqual([
      "22",
      "33",
      "44",
      "55",
      "66",
      "77",
      "88",
      "99",
      "TT",
      "JJ",
      "QQ",
      "KK",
      "AA",
    ]);
  });

  it("aceita 'x' minusculo no atalho", () => {
    expect(expandRangeToken("Axs")).toEqual(expandRangeToken("AXs"));
    expect(expandRangeToken("xx")).toEqual(expandRangeToken("XX"));
  });

  it("continua rejeitando lixo", () => {
    expect(expandRangeToken("ZZ+")).toEqual([]);
    expect(expandRangeToken("")).toEqual([]);
    expect(expandRangeToken("XXs")).toEqual([]);
    expect(expandRangeToken("AX")).toEqual([]);
  });
});
