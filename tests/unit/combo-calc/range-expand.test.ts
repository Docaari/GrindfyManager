import { describe, it, expect } from "vitest";
import { expandRangeToken } from "@/lib/combo-calc/combos";
import {
  serializeState,
  deserializeState,
} from "@/lib/combo-calc/persistence";
import { parseCard, cardKey } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";

describe("expandRangeToken", () => {
  it("par solto", () => {
    expect(expandRangeToken("99")).toEqual(["99"]);
  });
  it("par plus 99+", () => {
    expect(expandRangeToken("99+")).toEqual(["99", "TT", "JJ", "QQ", "KK", "AA"]);
  });
  it("par intervalo 55-22", () => {
    expect(expandRangeToken("55-22")).toEqual(["22", "33", "44", "55"]);
  });
  it("suited plus ATs+", () => {
    expect(expandRangeToken("ATs+")).toEqual(["ATs", "AJs", "AQs", "AKs"]);
  });
  it("offsuit plus KTo+", () => {
    expect(expandRangeToken("KTo+")).toEqual(["KTo", "KJo", "KQo"]);
  });
  it("suited intervalo A5s-A2s", () => {
    expect(expandRangeToken("A5s-A2s")).toEqual(["A2s", "A3s", "A4s", "A5s"]);
  });
  it("passa specific direto", () => {
    expect(expandRangeToken("QhJh")).toEqual(["QhJh"]);
    expect(expandRangeToken("K7hh")).toEqual(["K7hh"]);
  });
  it("AKs+ -> so AKs (nao gera par)", () => {
    expect(expandRangeToken("AKs+")).toEqual(["AKs"]);
  });
  it("intervalo invertido A2s-A5s normaliza ascendente", () => {
    expect(expandRangeToken("A2s-A5s")).toEqual(["A2s", "A3s", "A4s", "A5s"]);
  });
  it("rejeita lixo", () => {
    expect(expandRangeToken("ZZ+")).toEqual([]);
    expect(expandRangeToken("")).toEqual([]);
  });
});

describe("persistencia — round-trip", () => {
  it("serializa e desserializa estado", () => {
    const board = ["Ad", "8h", "4h"].map((c) => parseCard(c)!) as Card[];
    const hero = ["As", "6s"].map((c) => parseCard(c)!) as Card[];
    const state = {
      board,
      hero,
      entries: [{ notation: "A7s", kind: "suited" as const, frequency: 1 }],
      potInput: "36.1",
      callInput: "13.8",
      bbInput: "",
    };
    const ser = serializeState(state);
    expect(ser.board).toEqual(["Ad", "8h", "4h"]);
    const back = deserializeState(ser)!;
    expect(back.board!.map(cardKey)).toEqual(["Ad", "8h", "4h"]);
    expect(back.hero!.map(cardKey)).toEqual(["As", "6s"]);
    expect(back.entries).toEqual(state.entries);
    expect(back.potInput).toBe("36.1");
  });
  it("desserializa null -> null", () => {
    expect(deserializeState(null)).toBeNull();
  });
  it("ignora cartas invalidas na desserializacao", () => {
    const back = deserializeState({
      board: ["Ad", "XX", "4h"],
      hero: ["As", "6s"],
      entries: [],
      potInput: "",
      callInput: "",
      bbInput: "",
    })!;
    expect(back.board!.map(cardKey)).toEqual(["Ad", "4h"]);
  });

  it("saneia entries malformadas (notation nao-string, freq invalida, lixo)", () => {
    const back = deserializeState({
      board: ["Ad"],
      hero: [],
      // shapes corrompidos: numero, null, notation invalida, freq string
      entries: [
        { notation: 123, kind: "x", frequency: 1 },
        null,
        { notation: "ZZ", kind: "pair", frequency: 1 },
        { notation: "A7s", kind: "suited", frequency: "abc" },
        { notation: "55", kind: "pair", frequency: 5 },
      ] as unknown as never,
      potInput: "10",
      callInput: "5",
      bbInput: "",
    })!;
    // so A7s (freq->1 default) e 55 (freq clamp 5->1) sobrevivem
    expect(back.entries!.map((e) => e.notation)).toEqual(["A7s", "55"]);
    expect(back.entries![0].frequency).toBe(1);
    expect(back.entries![1].frequency).toBe(1);
  });

  it("coage inputs nao-string para string vazia", () => {
    const back = deserializeState({
      board: [],
      hero: [],
      entries: [],
      potInput: 36.1 as unknown as string,
      callInput: null as unknown as string,
      bbInput: undefined as unknown as string,
    })!;
    expect(back.potInput).toBe("");
    expect(back.callInput).toBe("");
  });
});
