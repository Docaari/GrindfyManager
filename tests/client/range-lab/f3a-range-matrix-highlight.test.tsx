// F3a / RF-03.7 — `RangeMatrix` ganha `highlight`, e ganha como prop OPCIONAL.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (RF-03.7, criterio 6)
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secao 5)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (Consequencias / "RangeMatrix ganha prop opcional, nao contrato novo")
//
// O QUE ESTE ARQUIVO PROTEGE
//
// A matriz serve QUATRO superficies: as duas da pagina e as duas do popup
// (`CombosCalculator`, D13/D-F2-6, religado na F2). A F3a nao pode mudar o
// comportamento de nenhuma delas — a prop e opcional e, SEM ela, a celula
// continua exatamente como hoje. Esse e o primeiro bloco de testes aqui, e ele
// vale mais que os outros: o popup e a unica superficie que ja funciona em
// producao.
//
// Contrato assumido (adicao ao componente existente):
//   highlight?: Set<string>                                     // classes acesas
//   highlightCounts?: Map<string, { passing: number; total: number }>
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid estavel).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const MATRIX_PATH = "../../../client/src/components/range-lab/RangeMatrix";

async function loadMatrix() {
  const mod: any = await import(/* @vite-ignore */ MATRIX_PATH);
  return mod.RangeMatrix ?? mod.default;
}

const ENTRIES = [
  { notation: "AKs", kind: "suited", frequency: 1 },
  { notation: "AQs", kind: "suited", frequency: 1 },
  { notation: "TT", kind: "pair", frequency: 1 },
  { notation: "A7o", kind: "offsuit", frequency: 1 },
] as any[];

async function renderMatrix(extra: Record<string, unknown> = {}) {
  const RangeMatrix = await loadMatrix();
  return render(<RangeMatrix entries={ENTRIES} onChange={() => {}} {...extra} />);
}

// ── sem a prop, nada muda (o popup nao pode sentir a F3a) ────

describe("F3a — sem `highlight`, a matriz se comporta exatamente como hoje", () => {
  it("nenhuma celula ganha marca de destaque", async () => {
    await renderMatrix();
    for (const notation of ["AKs", "TT", "A7o", "72o"]) {
      const cell = screen.getByTestId(`range-cell-${notation}`);
      expect(
        cell.getAttribute("data-highlighted"),
        `${notation}: a marca apareceu sem a prop — o popup sentiria a mudanca`,
      ).toBeNull();
    }
  });

  it("o title da celula continua sendo a notacao, sem contagem de filtro", async () => {
    await renderMatrix();
    const cell = screen.getByTestId("range-cell-AKs");
    expect(cell.getAttribute("title")).toBe("AKs");
  });

  it("a matriz 13x13 inteira continua renderizando", async () => {
    await renderMatrix();
    expect(screen.getByTestId("range-cell-AA")).toBeInTheDocument();
    expect(screen.getByTestId("range-cell-22")).toBeInTheDocument();
    expect(screen.getByTestId("range-cell-72o")).toBeInTheDocument();
  });
});

// ── com a prop, acende quem passa e esmaece o resto ──────────

describe("F3a criterio 6 — `highlight` acende as classes que passam no filtro", () => {
  it("classe no conjunto acende; classe fora, nao", async () => {
    await renderMatrix({ highlight: new Set(["AKs", "TT"]) });

    expect(screen.getByTestId("range-cell-AKs").getAttribute("data-highlighted")).toBe("true");
    expect(screen.getByTestId("range-cell-TT").getAttribute("data-highlighted")).toBe("true");
    expect(
      screen.getByTestId("range-cell-AQs").getAttribute("data-highlighted"),
      "AQs esta no range mas nao passou no filtro: tem que ficar esmaecida",
    ).toBe("false");
  });

  it("classe fora do range tambem responde ao filtro (a matriz inteira esmaece)", async () => {
    await renderMatrix({ highlight: new Set(["AKs"]) });
    expect(screen.getByTestId("range-cell-72o").getAttribute("data-highlighted")).toBe("false");
  });

  it("conjunto vazio nao e o mesmo que ausencia de prop", async () => {
    await renderMatrix({ highlight: new Set<string>() });
    expect(
      screen.getByTestId("range-cell-AKs").getAttribute("data-highlighted"),
      "conjunto vazio significa 'nada passou'; a ausencia da prop significa 'sem filtro'",
    ).toBe("false");
  });

  it("acender nao liga nem desliga classe nenhuma do range", async () => {
    const chamadas: unknown[] = [];
    const RangeMatrix = await loadMatrix();
    render(
      <RangeMatrix
        entries={ENTRIES}
        onChange={(next: unknown) => chamadas.push(next)}
        highlight={new Set(["AKs"])}
      />,
    );
    expect(
      chamadas,
      "o filtro e leitura: ele nao pode editar o range por efeito colateral",
    ).toHaveLength(0);
  });
});

// ── o tooltip que explica a celula parcial ───────────────────

describe("F3a RF-03.7 — o tooltip diz quantos combos da celula passam", () => {
  it("celula com contagem mostra 'X de Y'", async () => {
    await renderMatrix({
      highlight: new Set(["AKs"]),
      highlightCounts: new Map([
        ["AKs", { passing: 1, total: 4 }],
        ["AQs", { passing: 0, total: 4 }],
      ]),
    });

    const title = screen.getByTestId("range-cell-AKs").getAttribute("title") ?? "";
    expect(
      title,
      `veio "${title}": uma celula e uma classe com ate 4 combos, que podem cair ` +
        "em categorias diferentes — sem essa contagem a celula acesa mente",
    ).toMatch(/1\s*de\s*4/);
    expect(title, "o tooltip nao pode perder a notacao da classe").toContain("AKs");
  });

  it("celula sem contagem informada nao imprime numero quebrado", async () => {
    await renderMatrix({
      highlight: new Set(["AKs"]),
      highlightCounts: new Map([["AKs", { passing: 1, total: 4 }]]),
    });
    const title = screen.getByTestId("range-cell-72o").getAttribute("title") ?? "";
    expect(title).not.toMatch(/undefined|NaN/);
    expect(title).toContain("72o");
  });
});
