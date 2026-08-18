// F3a — a paleta por categoria mora FORA de `tokens.color` (emenda A14 + licao #22).
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md ("Cores fixas por categoria")
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (Consequencias / Neutras-operacionais)
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `ColorKey` e DERIVADO de `keyof tokens.color`, e todo consumidor de
// `tokens.color[tom]` espera o shape `{ bg, text, border }`. Foi exatamente assim
// que `tokens.color.delta` quebrou o `FilterChip` e obrigou a declarar `ColorKey`
// literal mais um `DeltaTone` a parte (licao #22). `heat` ja mora fora por esse
// motivo; a paleta de categorias segue o mesmo caminho, e este arquivo e o guarda
// que impede a terceira repeticao do mesmo erro.
//
// CONTRATO assumido (`@/lib/ui-tokens`, na vizinhanca de `heat`):
//   export const categoryPalette = {
//     made(id: MadeCategory): string;   // classe de fundo por categoria de mao feita
//     draw(id: DrawTag): string;        // classe de fundo por tag de draw
//   };
import { describe, it, expect } from "vitest";
import { categoryPalette, heat, tokens } from "@/lib/ui-tokens";
import type { DrawTag, MadeCategory } from "@/lib/combo-calc/classify";

const SWATCHES = ["success", "danger", "warn", "info", "action", "neutral", "accent"] as const;

const ALL_MADE: MadeCategory[] = [
  "straight_flush",
  "quads",
  "full_house",
  "flush",
  "straight",
  "set",
  "trips",
  "two_pair",
  "overpair",
  "top_pair",
  "second_pair",
  "third_pair",
  "weak_pair",
  "underpair",
  "ace_high",
  "no_pair",
];

const ALL_DRAWS: DrawTag[] = [
  "fd_nut",
  "fd",
  "bdfd",
  "oesd",
  "gutshot",
  "bdsd",
  "overcards2",
  "overcard1",
];

function assertUsableClass(value: unknown, label: string): void {
  expect(typeof value, `${label}: deveria devolver string`).toBe("string");
  const s = value as string;
  expect(s.length, `${label}: string vazia`).toBeGreaterThan(0);
  expect(s.includes("NaN"), `${label}: "${s}" carrega NaN`).toBe(false);
  expect(s.includes("undefined"), `${label}: "${s}" carrega undefined`).toBe(false);
}

describe("F3a A14 — a paleta de categorias vive fora de tokens.color (licao #22)", () => {
  it("tokens.color nao ganhou chave de categoria", () => {
    const cor = tokens.color as unknown as Record<string, unknown>;
    for (const chave of ["category", "categoryPalette", "made", "draws"]) {
      expect(
        cor[chave],
        `tokens.color.${chave} quebraria ColorKey e todo consumidor de swatch`,
      ).toBeUndefined();
    }
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

  it("heat continua de pe ao lado da paleta nova", () => {
    expect(typeof heat.absolute).toBe("function");
    expect(typeof heat.relative).toBe("function");
    expect(typeof heat.text).toBe("function");
  });
});

describe("F3a A14 — categoryPalette cobre a taxonomia inteira", () => {
  it("as 16 categorias de mao feita tem classe utilizavel", () => {
    for (const id of ALL_MADE) assertUsableClass(categoryPalette.made(id), `made(${id})`);
  });

  it("as 8 tags de draw tem classe utilizavel", () => {
    for (const id of ALL_DRAWS) assertUsableClass(categoryPalette.draw(id), `draw(${id})`);
  });

  it("as cores sao FIXAS: a mesma categoria devolve sempre a mesma classe", () => {
    for (const id of ALL_MADE) {
      expect(categoryPalette.made(id), `made(${id}) mudou entre chamadas`).toBe(
        categoryPalette.made(id),
      );
    }
  });

  it("categorias de forca nao compartilham a cor das categorias fracas", () => {
    expect(
      categoryPalette.made("straight_flush"),
      "nut e lixo com a mesma cor deixam o painel ilegivel",
    ).not.toBe(categoryPalette.made("no_pair"));
    expect(categoryPalette.made("flush")).not.toBe(categoryPalette.made("no_pair"));
    expect(categoryPalette.made("set")).not.toBe(categoryPalette.made("ace_high"));
  });

  it("id desconhecido devolve classe neutra utilizavel, e nao undefined na string", () => {
    // Dado corrompido (rascunho antigo do localStorage) nao pode produzir
    // `class="bg-undefined"` na tela — a mesma defesa que o `heat` ja faz.
    assertUsableClass(categoryPalette.made("nao_existe" as MadeCategory), "made(desconhecido)");
    assertUsableClass(categoryPalette.draw("nao_existe" as DrawTag), "draw(desconhecido)");
  });
});
