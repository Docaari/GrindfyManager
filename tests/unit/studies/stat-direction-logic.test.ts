// =============================================================================
// Sprint Stats-V2 — Direction semantics logic (RF-06, ADR-063)
//
// Red phase. Funcoes `getStatColor` e `getDirectionTooltip` ainda nao existem.
// Modulo esperado: `shared/stat-direction-logic.ts`
//
// Regras (ADR-063):
//   on-target (delta entre min e max)              => green sempre
//   off-target lower (value < min):
//     - higher_better => red    (abaixo do alvo = leak)
//     - lower_better  => green  (abaixo do alvo = bom)
//     - context       => orange (depende do estilo)
//     - neutral       => gray   (informativo)
//   off-target upper (value > max):
//     - higher_better => green  (acima do alvo = bom)
//     - lower_better  => red    (acima do alvo = leak)
//     - context       => orange
//     - neutral       => gray
//   value=null => gray sempre
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  getStatColor,
  getDirectionTooltip,
} from "../../../shared/stat-direction-logic";

const baseStat = (overrides: Partial<any> = {}) => ({
  id: "x",
  label: "X",
  group: "basics",
  targetMin: 20,
  targetMax: 30,
  direction: "higher_better",
  unit: "pct",
  ...overrides,
});

describe("getStatColor() — on-target", () => {
  it("on-target retorna green independente de direction (higher_better)", () => {
    const stat = baseStat({ direction: "higher_better" });
    expect(getStatColor(stat, 25)).toBe("green");
  });

  it("on-target retorna green (lower_better)", () => {
    const stat = baseStat({ direction: "lower_better" });
    expect(getStatColor(stat, 25)).toBe("green");
  });

  it("on-target retorna green (context)", () => {
    const stat = baseStat({ direction: "context" });
    expect(getStatColor(stat, 25)).toBe("green");
  });

  it("on-target retorna green (neutral)", () => {
    const stat = baseStat({ direction: "neutral" });
    expect(getStatColor(stat, 25)).toBe("green");
  });

  it("borda inferior (value=targetMin) eh on-target", () => {
    const stat = baseStat();
    expect(getStatColor(stat, 20)).toBe("green");
  });

  it("borda superior (value=targetMax) eh on-target", () => {
    const stat = baseStat();
    expect(getStatColor(stat, 30)).toBe("green");
  });
});

describe("getStatColor() — off-target lower (delta-)", () => {
  it("higher_better + value abaixo => red", () => {
    const stat = baseStat({ direction: "higher_better" });
    expect(getStatColor(stat, 10)).toBe("red");
  });

  it("lower_better + value abaixo => green", () => {
    const stat = baseStat({ direction: "lower_better" });
    expect(getStatColor(stat, 10)).toBe("green");
  });

  it("context + value abaixo => orange", () => {
    const stat = baseStat({ direction: "context" });
    expect(getStatColor(stat, 10)).toBe("orange");
  });

  it("neutral + value abaixo => gray", () => {
    const stat = baseStat({ direction: "neutral" });
    expect(getStatColor(stat, 10)).toBe("gray");
  });
});

describe("getStatColor() — off-target upper (delta+)", () => {
  it("higher_better + value acima => green", () => {
    const stat = baseStat({ direction: "higher_better" });
    expect(getStatColor(stat, 50)).toBe("green");
  });

  it("lower_better + value acima => red", () => {
    const stat = baseStat({ direction: "lower_better" });
    expect(getStatColor(stat, 50)).toBe("red");
  });

  it("context + value acima => orange", () => {
    const stat = baseStat({ direction: "context" });
    expect(getStatColor(stat, 50)).toBe("orange");
  });

  it("neutral + value acima => gray", () => {
    const stat = baseStat({ direction: "neutral" });
    expect(getStatColor(stat, 50)).toBe("gray");
  });
});

describe("getStatColor() — null", () => {
  it("value=null retorna gray (higher_better)", () => {
    const stat = baseStat({ direction: "higher_better" });
    expect(getStatColor(stat, null)).toBe("gray");
  });

  it("value=null retorna gray (lower_better)", () => {
    const stat = baseStat({ direction: "lower_better" });
    expect(getStatColor(stat, null)).toBe("gray");
  });

  it("value=null retorna gray (context)", () => {
    const stat = baseStat({ direction: "context" });
    expect(getStatColor(stat, null)).toBe("gray");
  });

  it("value=null retorna gray (neutral)", () => {
    const stat = baseStat({ direction: "neutral" });
    expect(getStatColor(stat, null)).toBe("gray");
  });

  it("value=undefined tratado como null => gray", () => {
    const stat = baseStat({ direction: "higher_better" });
    // @ts-expect-error — testando defensiva
    expect(getStatColor(stat, undefined)).toBe("gray");
  });
});

describe("getDirectionTooltip()", () => {
  it("higher_better retorna string PT-BR mencionando 'maior'", () => {
    const t = getDirectionTooltip("higher_better");
    expect(typeof t).toBe("string");
    expect(t.toLowerCase()).toMatch(/maior/);
  });

  it("lower_better retorna string PT-BR mencionando 'menor'", () => {
    const t = getDirectionTooltip("lower_better");
    expect(typeof t).toBe("string");
    expect(t.toLowerCase()).toMatch(/menor/);
  });

  it("context retorna string PT-BR mencionando 'estilo'", () => {
    const t = getDirectionTooltip("context");
    expect(typeof t).toBe("string");
    expect(t.toLowerCase()).toMatch(/estilo/);
  });

  it("neutral retorna string PT-BR informativa", () => {
    const t = getDirectionTooltip("neutral");
    expect(typeof t).toBe("string");
    expect(t.length).toBeGreaterThan(0);
  });

  it("direction desconhecida retorna string fallback nao vazia", () => {
    // @ts-expect-error — testando fallback
    const t = getDirectionTooltip("desconhecido");
    expect(typeof t).toBe("string");
  });
});
