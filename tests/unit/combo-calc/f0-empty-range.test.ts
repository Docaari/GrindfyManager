// RF-00.2 — Range sem massa nao produz veredito.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma medido (range com uma unica classe KK em frequencia 0):
//   { heroEquity: 0, decision: "fold", totalCombos: 0, emptyEntries: [] }
// A tela mostra banner vermelho "FOLD (-EV) / 0.0% / EV do call: -13.8 fichas".
// Numero errado perde para numero ausente (00-produto.md): massa zero devolve
// veredito SEM decisao e com razao nomeada.
import { describe, it, expect } from "vitest";
import { evaluateSpot } from "@/lib/combo-calc/evaluateSpot";
import {
  BLOCKED_SPOT,
  TURN_SPOT,
  WEIGHTLESS_SPOT,
  entry,
} from "./f0-fixtures";

describe("RF-00.2 — massa ponderada zero nunca vira FOLD", () => {
  it("classe unica em frequencia 0 nao devolve decision 'fold'", () => {
    const v = evaluateSpot(WEIGHTLESS_SPOT);
    expect(v.decision).not.toBe("fold");
  });

  it("classe unica em frequencia 0 devolve veredito sem decisao", () => {
    const v = evaluateSpot(WEIGHTLESS_SPOT);
    expect(v.decision).toBeNull();
  });

  it("classe unica em frequencia 0 nomeia a razao 'empty_range'", () => {
    const v = evaluateSpot(WEIGHTLESS_SPOT);
    expect(v.degradedReason).toBe("empty_range");
  });

  it("massa total ponderada zero fica explicita no veredito", () => {
    const v = evaluateSpot(WEIGHTLESS_SPOT);
    expect(v.totalWeight).toBe(0);
    expect(v.totalCombos).toBe(0);
  });

  it("range totalmente vazio (nenhuma classe) tambem fica sem decisao", () => {
    const v = evaluateSpot({ ...TURN_SPOT, villainRange: [] });
    expect(v.decision).toBeNull();
    expect(v.degradedReason).toBe("empty_range");
  });

  it("todas as classes mortas por card removal ficam sem decisao e listam as classes", () => {
    const v = evaluateSpot(BLOCKED_SPOT);
    expect(v.decision).toBeNull();
    expect(v.degradedReason).toBe("empty_range");
    expect(v.emptyEntries).toContain("AdAs");
  });

  it("varias classes, todas em frequencia 0, ficam sem decisao", () => {
    const v = evaluateSpot({
      ...TURN_SPOT,
      villainRange: [entry("KK", 0), entry("A7s", 0), entry("76s", 0)],
    });
    expect(v.decision).toBeNull();
    expect(v.degradedReason).toBe("empty_range");
  });

  it("uma unica classe com peso residual ja produz decisao normal", () => {
    const v = evaluateSpot({
      ...TURN_SPOT,
      villainRange: [entry("KK", 0), entry("A7s", 0.01)],
    });
    expect(v.degradedReason).toBeNull();
    expect(v.decision).not.toBeNull();
    expect(v.totalWeight).toBeGreaterThan(0);
  });

  it("spot com range de verdade nao ganha razao degradada", () => {
    const v = evaluateSpot(TURN_SPOT);
    expect(v.degradedReason).toBeNull();
    expect(v.decision).toBe("call");
    expect(v.totalWeight).toBeCloseTo(11, 9);
  });
});
