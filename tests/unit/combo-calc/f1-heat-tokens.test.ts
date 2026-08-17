// F1 / RF-01.5 — escala de calor nos tokens (emenda A18).
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.5)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-10)
//
// `heat` entra em `@/lib/ui-tokens` como export SEPARADO, NAO dentro de
// `tokens.color`. A licao #22 registra o custo de meter shape heterogeneo la:
// `tokens.color.delta` quebrou `ColorKey` e os consumidores de swatch
// (`FilterChip`), e exigiu `ColorKey` literal mais um `DeltaTone` a parte.
// Repetir o erro conhecido custaria a mesma correcao de novo.
//
// Tres derivacoes, porque uma so nao serve:
//   absolute  — 0..1 para equity;
//   relative  — ao min/max do conjunto, quando o que importa e o ranking;
//   text      — variante escurecida; o amarelo do meio e ilegivel como fonte.
import { describe, it, expect } from "vitest";
import { heat, tokens } from "@/lib/ui-tokens";

const SWATCHES = [
  "success",
  "danger",
  "warn",
  "info",
  "action",
  "neutral",
  "accent",
] as const;

function assertUsableClass(value: unknown, label: string): void {
  expect(typeof value, `${label}: heat deveria devolver string`).toBe("string");
  const s = value as string;
  expect(s.length, `${label}: string vazia`).toBeGreaterThan(0);
  expect(s.includes("NaN"), `${label}: "${s}" carrega NaN`).toBe(false);
  expect(s.includes("undefined"), `${label}: "${s}" carrega undefined`).toBe(false);
}

// ── escala absoluta ──────────────────────────────────────────

describe("F1 A18 — heat.absolute (equity de 0 a 100%)", () => {
  it("as pontas da escala sao visualmente diferentes", () => {
    expect(
      heat.absolute(1),
      `absolute(0)="${heat.absolute(0)}" e absolute(1)="${heat.absolute(1)}" iguais: nao ha escala`,
    ).not.toBe(heat.absolute(0));
  });

  it("a escala tem pelo menos tres degraus distintos", () => {
    const degraus = new Set([0, 0.25, 0.5, 0.75, 1].map((f) => heat.absolute(f)));
    expect(
      degraus.size,
      `degraus distintos: ${degraus.size} (${[...degraus].join(", ")})`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("devolve classe utilizavel em toda a faixa", () => {
    for (const f of [0, 0.1, 0.25, 0.33, 0.5, 0.66, 0.75, 0.9, 1]) {
      assertUsableClass(heat.absolute(f), `absolute(${f})`);
    }
  });

  it("entrada fora de 0..1 e presa na faixa", () => {
    expect(heat.absolute(-5), "abaixo de 0 deveria virar 0").toBe(heat.absolute(0));
    expect(heat.absolute(-0.001)).toBe(heat.absolute(0));
    expect(heat.absolute(5), "acima de 1 deveria virar 1").toBe(heat.absolute(1));
    expect(heat.absolute(1.001)).toBe(heat.absolute(1));
    expect(heat.absolute(Infinity)).toBe(heat.absolute(1));
    expect(heat.absolute(-Infinity)).toBe(heat.absolute(0));
  });

  it("NaN nao vaza para a string (numero ausente nunca vira classe quebrada)", () => {
    assertUsableClass(heat.absolute(NaN), "absolute(NaN)");
    assertUsableClass(heat.absolute(undefined as unknown as number), "absolute(undefined)");
  });
});

// ── escala relativa ──────────────────────────────────────────

describe("F1 A18 — heat.relative (ranking dentro do conjunto)", () => {
  it("normaliza o valor entre min e max", () => {
    expect(heat.relative(10, 10, 20), "no minimo").toBe(heat.absolute(0));
    expect(heat.relative(20, 10, 20), "no maximo").toBe(heat.absolute(1));
    expect(heat.relative(15, 10, 20), "no meio").toBe(heat.absolute(0.5));
  });

  it("valor fora do intervalo e preso nas pontas", () => {
    expect(heat.relative(-100, 10, 20)).toBe(heat.absolute(0));
    expect(heat.relative(999, 10, 20)).toBe(heat.absolute(1));
  });

  it("min igual a max devolve o valor NEUTRO, sem NaN (divisao por zero)", () => {
    const neutro = heat.relative(5, 5, 5);
    assertUsableClass(neutro, "relative(5, 5, 5)");
    expect(
      neutro,
      "o conjunto sem amplitude nao tem ranking: o meio da escala e a resposta honesta",
    ).toBe(heat.absolute(0.5));
    expect(heat.relative(0, 0, 0)).toBe(neutro);
  });

  it("min maior que max nao produz classe quebrada", () => {
    assertUsableClass(heat.relative(5, 20, 10), "relative(5, 20, 10)");
  });

  it("entrada nao finita nao produz NaN", () => {
    assertUsableClass(heat.relative(NaN, 0, 1), "relative(NaN, 0, 1)");
    assertUsableClass(heat.relative(0.5, NaN, 1), "relative(0.5, NaN, 1)");
    assertUsableClass(heat.relative(0.5, 0, NaN), "relative(0.5, 0, NaN)");
  });
});

// ── variante de texto ────────────────────────────────────────

describe("F1 A18 — heat.text (variante escurecida para fonte)", () => {
  it("difere da variante de fundo em toda a faixa", () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      expect(
        heat.text(f),
        `text(${f})="${heat.text(f)}" igual a absolute(${f})="${heat.absolute(f)}": ` +
          "o amarelo do meio da escala e ilegivel como cor de fonte",
      ).not.toBe(heat.absolute(f));
    }
  });

  it("devolve classe utilizavel e presa na faixa", () => {
    for (const f of [-3, 0, 0.5, 1, 4, NaN]) {
      assertUsableClass(heat.text(f), `text(${f})`);
    }
    expect(heat.text(-3)).toBe(heat.text(0));
    expect(heat.text(4)).toBe(heat.text(1));
  });

  it("tambem tem pelo menos tres degraus distintos", () => {
    const degraus = new Set([0, 0.5, 1].map((f) => heat.text(f)));
    expect(degraus.size).toBeGreaterThanOrEqual(3);
  });
});

// ── guarda da licao #22 ──────────────────────────────────────

describe("F1 D-F1-10 — heat vive FORA de tokens.color (licao #22)", () => {
  it("tokens.color nao ganhou uma chave heat", () => {
    expect(
      (tokens.color as unknown as Record<string, unknown>).heat,
      "heat dentro de tokens.color quebra ColorKey e os consumidores de swatch",
    ).toBeUndefined();
  });

  it("todo swatch de tokens.color continua com text, bg e border", () => {
    for (const key of SWATCHES) {
      const swatch = tokens.color[key] as unknown as Record<string, unknown>;
      expect(swatch, `tokens.color.${key} sumiu`).toBeDefined();
      expect(typeof swatch.text, `tokens.color.${key}.text`).toBe("string");
      expect(typeof swatch.bg, `tokens.color.${key}.bg`).toBe("string");
      expect(typeof swatch.border, `tokens.color.${key}.border`).toBe("string");
    }
  });

  it("tokens.color.delta continua com o shape proprio (positive/negative/neutral)", () => {
    expect(typeof tokens.color.delta.positive).toBe("string");
    expect(typeof tokens.color.delta.negative).toBe("string");
    expect(typeof tokens.color.delta.neutral).toBe("string");
  });

  it("heat e um objeto com as tres derivacoes", () => {
    expect(typeof heat.absolute).toBe("function");
    expect(typeof heat.relative).toBe("function");
    expect(typeof heat.text).toBe("function");
  });
});
