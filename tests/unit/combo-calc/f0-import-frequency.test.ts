// RF-00.6 — Frequencia importada normalizada na fronteira.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma: "AKo:50" no import guarda frequency = 50. A tela exibe "5000%" e a
// opacidade da celula estoura. O clamp so acontece la no fundo, em
// comboFrequency, quando o numero errado ja apareceu.
//
// Regra: valor > 1 e lido como percentual e dividido por 100; > 100 e RECUSADO
// com aviso visivel, nao truncado em silencio. clampFreq continua como ultima
// linha de defesa.
import { describe, it, expect } from "vitest";
import { parseImportedFrequency } from "@/lib/combo-calc/uiRules";
import { clampFreq } from "@/lib/combo-calc/combos";

function freqOf(raw: string | number): number {
  const r = parseImportedFrequency(raw);
  if (!r.ok) throw new Error(`esperava aceitar ${raw}, recusou por ${r.reason}`);
  return r.frequency;
}

describe("RF-00.6 — percentual do import vira fracao", () => {
  it("AKo:50 entra como 50%, nao como 5000%", () => {
    expect(freqOf(50)).toBeCloseTo(0.5, 12);
  });

  it("valor entre 0 e 1 e lido como fracao, sem dividir", () => {
    expect(freqOf(0.5)).toBeCloseTo(0.5, 12);
    expect(freqOf(0.05)).toBeCloseTo(0.05, 12);
  });

  it("1 continua sendo 100% (fronteira que nao vira 1%)", () => {
    expect(freqOf(1)).toBe(1);
  });

  it("100 e o topo do percentual e vira 1", () => {
    expect(freqOf(100)).toBe(1);
  });

  it("0 e frequencia legitima e sobrevive", () => {
    expect(freqOf(0)).toBe(0);
  });

  it("aceita string, que e o que o campo de import entrega", () => {
    expect(freqOf("50")).toBeCloseTo(0.5, 12);
    expect(freqOf("0.25")).toBeCloseTo(0.25, 12);
    expect(freqOf("100")).toBe(1);
  });

  it("aceita virgula decimal (UI em PT-BR)", () => {
    expect(freqOf("0,25")).toBeCloseTo(0.25, 12);
    expect(freqOf("33,5")).toBeCloseTo(0.335, 12);
  });

  it("ignora espaco em volta", () => {
    expect(freqOf("  50  ")).toBeCloseTo(0.5, 12);
  });
});

describe("RF-00.6 — valor fora de faixa e recusado com aviso, nao truncado", () => {
  it("acima de 100 e recusado em vez de virar 1", () => {
    const r = parseImportedFrequency(101);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ ok: false, reason: "out_of_range" });
  });

  it("a recusa devolve o valor cru para a mensagem da tela", () => {
    const r = parseImportedFrequency("5000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raw).toBe("5000");
  });

  it("valor negativo e recusado em vez de virar 0 em silencio", () => {
    const r = parseImportedFrequency(-1);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: "out_of_range" });
  });

  it("texto que nao e numero e recusado com razao propria", () => {
    for (const raw of ["", "   ", "abc", "1.2.3", "NaN"]) {
      const r = parseImportedFrequency(raw);
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: "not_a_number" });
    }
  });

  it("NaN e Infinity sao recusados", () => {
    expect(parseImportedFrequency(NaN).ok).toBe(false);
    expect(parseImportedFrequency(Infinity).ok).toBe(false);
    expect(parseImportedFrequency(-Infinity).ok).toBe(false);
  });

  it("null e undefined nao lancam e sao recusados", () => {
    expect(() => parseImportedFrequency(null)).not.toThrow();
    expect(parseImportedFrequency(null).ok).toBe(false);
    expect(parseImportedFrequency(undefined).ok).toBe(false);
  });
});

describe("RF-00.6 — clampFreq continua sendo a ultima linha de defesa", () => {
  it("tudo que o import aceita ja passa por clampFreq sem mudar", () => {
    for (const raw of [0, 0.25, 1, 50, 100, "0,5"] as const) {
      const f = freqOf(raw);
      expect(clampFreq(f)).toBe(f);
    }
  });

  it("clampFreq nao foi afrouxado", () => {
    expect(clampFreq(5)).toBe(1);
    expect(clampFreq(-1)).toBe(0);
    expect(clampFreq(NaN)).toBe(0);
  });
});
