// F3b / D-F3-33 — a paleta da decisao mora FORA de `tokens.color` (licao #22).
// ADR: Docs/architecture/decisions/249-range-lab-f3b-decisao.md (D-F3-33)
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `ColorKey` e derivado de `keyof tokens.color` e todo consumidor de
// `tokens.color[tom]` espera `{ bg, text, border }`. Foi assim que
// `tokens.color.delta` quebrou o `FilterChip` e obrigou a declarar `ColorKey`
// literal mais um `DeltaTone` a parte. `heat` e `categoryPalette` ja moram fora
// por esse motivo; esta e a TERCEIRA paleta, e este arquivo e o guarda que
// impede a terceira repeticao do mesmo erro.
//
// CONTRATO (`@/lib/ui-tokens`, na vizinhanca de `heat` e `categoryPalette`):
//   export const decisionPalette = {
//     cascade(id: CascadeStepId): string;
//     confront(outcome: ConfrontOutcome): string;
//     balance(verdict: BluffBalanceVerdict): string;
//   };
import { describe, it, expect } from "vitest";
import { categoryPalette, decisionPalette, heat, tokens } from "@/lib/ui-tokens";

const CASCADE_IDS = [
  "nominal",
  "declared",
  "after_board_removal",
  "after_mutual_removal",
  "loses_to_hero",
] as const;

const OUTCOMES = ["value", "bluff", "chop", "unknown"] as const;
const VERDICTS = ["bluffs_missing", "balanced", "bluffs_excess"] as const;

function classeUsavel(valor: unknown, rotulo: string): void {
  expect(typeof valor, `${rotulo}: deveria devolver string`).toBe("string");
  const s = valor as string;
  expect(s.length, `${rotulo}: string vazia`).toBeGreaterThan(0);
  expect(s.includes("undefined"), `${rotulo}: "${s}" carrega undefined`).toBe(false);
  expect(s.includes("NaN"), `${rotulo}: "${s}" carrega NaN`).toBe(false);
}

describe("F3b D-F3-33 — a paleta da decisao nao entra em tokens.color", () => {
  it("tokens.color nao ganhou chave nenhuma da frente", () => {
    // A paleta tem que EXISTIR para o guarda dizer alguma coisa: sem ela, este
    // teste passaria verde numa arvore em que nada foi feito.
    expect(decisionPalette, "decisionPalette nao existe em @/lib/ui-tokens").toBeTruthy();
    const cor = tokens.color as unknown as Record<string, unknown>;
    for (const chave of ["decision", "decisionPalette", "cascade", "confront", "balance"]) {
      expect(
        cor[chave],
        `tokens.color.${chave} quebraria ColorKey e todo consumidor de swatch (licao #22)`,
      ).toBeUndefined();
    }
  });

  it("mora ao lado de heat e categoryPalette, e nao dentro deles", () => {
    expect(typeof decisionPalette).toBe("object");
    expect(decisionPalette).not.toBe(heat);
    expect(decisionPalette).not.toBe(categoryPalette);
  });

  it("os swatches de tokens.color continuam com o shape de sempre", () => {
    expect(decisionPalette, "decisionPalette nao existe em @/lib/ui-tokens").toBeTruthy();
    for (const tom of ["success", "danger", "warn", "info", "action", "neutral", "accent"] as const) {
      const swatch = (tokens.color as Record<string, any>)[tom];
      expect(swatch, `tokens.color.${tom} sumiu`).toBeTruthy();
      for (const parte of ["bg", "text", "border"] as const) {
        expect(typeof swatch[parte], `tokens.color.${tom}.${parte}`).toBe("string");
      }
    }
  });
});

describe("F3b D-F3-33 — cada id conhecido tem cor, e o desconhecido cai no fundo neutro", () => {
  it("os cinco degraus da cascata", () => {
    for (const id of CASCADE_IDS) classeUsavel(decisionPalette.cascade(id), `cascade(${id})`);
  });

  it("os quatro resultados de confronto, `unknown` inclusive", () => {
    // `unknown` PRECISA de cor propria: ele existe justamente para nao se
    // disfarcar de blefe, e cor igual a do blefe desfaria isso na tela.
    for (const outcome of OUTCOMES) classeUsavel(decisionPalette.confront(outcome), `confront(${outcome})`);
    expect(
      decisionPalette.confront("unknown"),
      "o balde dos combos sem numero pintado igual ao de blefe",
    ).not.toBe(decisionPalette.confront("bluff"));
  });

  it("os tres vereditos de balanco", () => {
    for (const verdict of VERDICTS) classeUsavel(decisionPalette.balance(verdict), `balance(${verdict})`);
    expect(decisionPalette.balance("bluffs_missing")).not.toBe(
      decisionPalette.balance("bluffs_excess"),
    );
  });

  it("id desconhecido devolve fundo neutro, nunca `bg-undefined`", () => {
    for (const fn of ["cascade", "confront", "balance"] as const) {
      classeUsavel((decisionPalette as any)[fn]("nao_existe"), `${fn}(desconhecido)`);
    }
  });
});
