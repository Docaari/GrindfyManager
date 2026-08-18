// F3a / RF-03.8 — a `ComboTable` vira DUAS LISTAS PARALELAS, nunca pareada.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (RF-03.8)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (D-F3-21)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md (D-F3-19)
//
// O QUE ESTE ARQUIVO PROTEGE — e por que ele e um guarda, nao um teste de layout
//
// O exemplo da spec ("KhQh = flush de copas -> voce A6s = top par, kicker 6") vem
// do shape v1 do POPUP (`Verdict.perCombo`), onde o heroi e sempre uma mao so e
// cada linha e um combo do vilao contra ela. A `ComboTable` da pagina recebe
// `perHeroCombo`: uma linha por combo do HEROI, ja agregado contra o range
// INTEIRO do vilao. **Nao existe "o combo do vilao daquela linha"** — parear
// seria inventar um confronto que o modelo v2 nao tem. E o mesmo descasamento que
// o ADR-247 (D-F2-4) ja registrou para o `solveBreakevenMultiplier`.
//
// Obrigacao de teste que nasce dai (D-F3-19): NENHUM ponto da UI pode construir
// uma linha que junte um combo do heroi a um combo do vilao. Se aparecer, e o
// shape v1 vazando.
//
// Contrato assumido:
//   <ComboTable heroRows villainRows board heroMode />
//   data-testid: range-lab-combo-table,
//                range-lab-combo-table-hero | range-lab-combo-table-villain,
//                combo-row-hero-<comboKey> | combo-row-villain-<comboKey>,
//                combo-made-hero-<comboKey> | combo-made-villain-<comboKey>,
//                range-lab-combo-table-hero-hand (so no modo mao unica),
//                range-lab-combo-table-street-note (fora do river)
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid estavel).
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

const TABLE_PATH = "../../../client/src/components/range-lab/ComboTable";

async function loadTable() {
  const mod: any = await import(/* @vite-ignore */ TABLE_PATH);
  return mod.ComboTable ?? mod.default;
}

const CARD = (rank: number, suit: string) => ({ rank, suit }) as any;

/** Flop `9c 8c 2h` — nao e river de proposito: a coluna diz "a mao feita AGORA". */
const FLOP = [CARD(9, "c"), CARD(8, "c"), CARD(2, "h")];
const RIVER = [CARD(9, "c"), CARD(8, "c"), CARD(2, "h"), CARD(13, "d"), CARD(4, "s")];

function heroRow(a: any, b: any, equity: number) {
  return {
    combo: [a, b],
    weight: 1,
    pairMass: 12,
    equity,
    evCall: equity * 50 - 13.8,
    decision: equity > 0.28 ? "call" : "fold",
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: null,
  };
}

function villainRow(a: any, b: any, equity: number | null, degradedReason: string | null = null) {
  return {
    combo: [a, b],
    weight: 1,
    pairMass: equity === null ? 0 : 8,
    equity,
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason,
  };
}

/** Tres do heroi contra cinco do vilao: um shape PAREADO nao consegue produzir 3 e 5. */
const HERO_ROWS = [
  heroRow(CARD(14, "s"), CARD(6, "s"), 0.72),
  heroRow(CARD(13, "s"), CARD(13, "d"), 0.81),
  heroRow(CARD(7, "d"), CARD(2, "d"), 0.14),
];

const VILLAIN_ROWS = [
  villainRow(CARD(14, "c"), CARD(13, "c"), 0.44),
  villainRow(CARD(12, "d"), CARD(9, "s"), 0.51),
  villainRow(CARD(11, "d"), CARD(11, "s"), 0.63),
  villainRow(CARD(5, "d"), CARD(4, "s"), 0.19),
  villainRow(CARD(10, "h"), CARD(9, "h"), null, "no_valid_villain_combo"),
];

async function renderTable(extra: Record<string, unknown> = {}) {
  const ComboTable = await loadTable();
  return render(
    <ComboTable
      heroRows={HERO_ROWS}
      villainRows={VILLAIN_ROWS}
      board={FLOP}
      heroMode="range"
      {...extra}
    />,
  );
}

// ── o guarda do shape v1 ─────────────────────────────────────

describe("F3a D-F3-19 — duas listas paralelas, e nenhuma linha junta os dois lados", () => {
  it("cada lista tem exatamente o numero de linhas do SEU lado", async () => {
    await renderTable();
    const heroi = screen.getAllByTestId(/^combo-row-hero-/);
    const vilao = screen.getAllByTestId(/^combo-row-villain-/);

    expect(
      heroi.length,
      `${heroi.length} linhas do heroi para ${HERO_ROWS.length} combos. ` +
        "Uma tabela pareada produziria min(H,V) ou H*V linhas, nunca H e V independentes",
    ).toBe(HERO_ROWS.length);
    expect(vilao.length).toBe(VILLAIN_ROWS.length);
    expect(heroi.length, "o caso so discrimina se os dois lados tiverem tamanhos diferentes").not.toBe(
      vilao.length,
    );
  });

  it("nenhuma linha do vilao vive dentro de uma linha do heroi (nem o contrario)", async () => {
    const { container } = await renderTable();
    expect(
      container.querySelectorAll('[data-testid^="combo-row-hero-"] [data-testid^="combo-row-villain-"]'),
      "linha do vilao aninhada na do heroi e o pareamento do shape v1 voltando",
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-testid^="combo-row-villain-"] [data-testid^="combo-row-hero-"]'),
    ).toHaveLength(0);
  });

  it("cada linha carrega a leitura de UM lado so", async () => {
    await renderTable();
    for (const linha of screen.getAllByTestId(/^combo-row-villain-/)) {
      expect(
        within(linha).queryAllByTestId(/^combo-made-hero-/),
        "a linha do vilao trouxe a mao feita do heroi junto: isso e parear",
      ).toHaveLength(0);
    }
    for (const linha of screen.getAllByTestId(/^combo-row-hero-/)) {
      expect(within(linha).queryAllByTestId(/^combo-made-villain-/)).toHaveLength(0);
    }
  });

  it("as duas listas ficam em containers separados e nomeados", async () => {
    await renderTable();
    const heroi = screen.getByTestId("range-lab-combo-table-hero");
    const vilao = screen.getByTestId("range-lab-combo-table-villain");
    expect(within(heroi).getAllByTestId(/^combo-row-hero-/)).toHaveLength(HERO_ROWS.length);
    expect(within(vilao).getAllByTestId(/^combo-row-villain-/)).toHaveLength(VILLAIN_ROWS.length);
    expect(within(heroi).queryAllByTestId(/^combo-row-villain-/)).toHaveLength(0);
  });
});

// ── a mao feita por combo (RF-03.8) ──────────────────────────

describe("F3a RF-03.8 — cada linha diz a mao feita do proprio combo", () => {
  it("a coluna de mao feita vem preenchida nos dois lados", async () => {
    await renderTable();
    for (const linha of screen.getAllByTestId(/^combo-row-hero-/)) {
      const celula = within(linha).getByTestId(/^combo-made-hero-/);
      expect((celula.textContent ?? "").trim().length, "mao feita em branco").toBeGreaterThan(0);
    }
    for (const linha of screen.getAllByTestId(/^combo-row-villain-/)) {
      const celula = within(linha).getByTestId(/^combo-made-villain-/);
      expect((celula.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("KK e AK no MESMO bordo saem com rotulos diferentes", async () => {
    await renderTable();
    const kk = screen.getByTestId(/^combo-made-hero-K/);
    const outros = screen
      .getAllByTestId(/^combo-made-hero-/)
      .map((el) => el.textContent)
      .filter((t) => t !== kk.textContent);
    expect(
      outros.length,
      "todos os combos sairam com o mesmo rotulo: a coluna nao esta lendo o combo",
    ).toBeGreaterThan(0);
  });

  it("fora do river a tabela declara que a mao ainda vai mudar", async () => {
    await renderTable();
    const nota = screen.getByTestId("range-lab-combo-table-street-note");
    expect((nota.textContent ?? "").toLowerCase()).toMatch(/agora|ainda vai mudar|no flop/);
  });

  it("no river a nota de 'mao feita agora' nao aparece", async () => {
    await renderTable({ board: RIVER });
    expect(
      screen.queryByTestId("range-lab-combo-table-street-note"),
      "no river nao ha carta por vir: a ressalva vira ruido",
    ).toBeNull();
  });
});

// ── modo mao unica (D-F3-21) ─────────────────────────────────

describe("F3a D-F3-21 — no modo 'minha mao', a mao do heroi aparece UMA vez, no cabecalho", () => {
  it("o cabecalho traz a mao e a leitura dela", async () => {
    await renderTable({ heroMode: "hand", heroRows: [HERO_ROWS[0]] });
    const cabecalho = screen.getByTestId("range-lab-combo-table-hero-hand");
    const texto = (cabecalho.textContent ?? "").trim();
    expect(texto.length, "cabecalho vazio no modo mao unica").toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^combo-row-villain-/)).toHaveLength(VILLAIN_ROWS.length);
  });

  it("mesmo no modo mao unica, a linha do vilao NAO afirma o confronto pareado", async () => {
    await renderTable({ heroMode: "hand", heroRows: [HERO_ROWS[0]] });
    for (const linha of screen.getAllByTestId(/^combo-row-villain-/)) {
      expect(
        within(linha).queryAllByTestId(/^combo-made-hero-/),
        "a mao do heroi aparece uma vez, no cabecalho — nunca repetida por linha",
      ).toHaveLength(0);
    }
  });
});

// ── ausencia de numero continua sendo ausencia ───────────────

describe("F3a — combo do vilao sem numero mostra travessao, nunca 0%", () => {
  it("a linha degradada aparece e a equity fica em branco", async () => {
    await renderTable();
    const linha = screen.getByTestId(/^combo-row-villain-T/);
    expect(
      (linha.textContent ?? "").includes("—"),
      "combo sem oponente com '0,0%' e o numero errado com cara de certo",
    ).toBe(true);
    expect(linha.textContent).not.toMatch(/0[.,]0\s*%/);
  });
});
