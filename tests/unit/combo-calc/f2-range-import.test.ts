// F2 — RF-02.5, parser puro de texto colavel (rangeImport.ts).
// Espelha o comportamento ja validado de `CombosCalculator.applyRangeString`
// (RF-00.6/RF-00.7), extraido para `RangeLibrary.tsx` reusar.
import { describe, it, expect } from "vitest";
import { parseRangeText } from "@/lib/combo-calc/rangeImport";

describe("F2 RF-02.5 — parseRangeText", () => {
  it("expande '99+' em pares consecutivos, frequencia 1", () => {
    const { entries, warnings } = parseRangeText("99+");
    expect(warnings).toHaveLength(0);
    const notations = entries.map((e) => e.notation).sort();
    expect(notations).toEqual(["99", "AA", "JJ", "KK", "QQ", "TT"].sort());
    expect(entries.every((e) => e.frequency === 1)).toBe(true);
  });

  it("frequencia via ':' normaliza percentual (AKo:50 -> 0.5)", () => {
    const { entries, warnings } = parseRangeText("AKo:50");
    expect(warnings).toHaveLength(0);
    expect(entries).toEqual([{ notation: "AKo", kind: "offsuit", frequency: 0.5 }]);
  });

  it("normaliza virgula decimal PT-BR dentro da frequencia (AKo:0,5) sem quebrar o separador de token", () => {
    const { entries, warnings } = parseRangeText("AKo:0,5, KQo");
    expect(warnings).toHaveLength(0);
    const ako = entries.find((e) => e.notation === "AKo");
    expect(ako?.frequency).toBeCloseTo(0.5, 9);
    expect(entries.some((e) => e.notation === "KQo")).toBe(true);
  });

  it("combo especifico (QhJh) entra como kind 'specific'", () => {
    const { entries, warnings } = parseRangeText("QhJh");
    expect(warnings).toHaveLength(0);
    expect(entries).toEqual([{ notation: "QhJh", kind: "specific", frequency: 1 }]);
  });

  it("token ilegivel gera aviso nomeado, nao lanca excecao nem some em silencio", () => {
    const { entries, warnings } = parseRangeText("99+, ZZZ");
    expect(entries.some((e) => e.notation === "99")).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ZZZ");
  });

  it("frequencia fora de 0-100 e recusada com razao nomeada", () => {
    const { entries, warnings } = parseRangeText("AA:150");
    expect(entries).toHaveLength(0);
    expect(warnings[0]).toMatch(/fora da faixa/);
  });

  it("token repetido no mesmo texto: o ultimo vence", () => {
    const { entries } = parseRangeText("AA:50, AA:100");
    expect(entries).toEqual([{ notation: "AA", kind: "pair", frequency: 1 }]);
  });

  it("texto vazio devolve lista vazia sem avisos", () => {
    const { entries, warnings } = parseRangeText("   ");
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
