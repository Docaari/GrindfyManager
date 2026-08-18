// F2 — RF-02.6 devolve o ponto de virada no popup FORA do river (D-F2-4, D-F2-6).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.6, criterios 6 e 7)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-4)
//
// A F0/F1 deixaram `CombosCalculator.tsx` sem teste de wiring proprio alem do
// smoke test em `combos-calculator-smoke.test.tsx` (empty state, range morto,
// carta duplicada, import com token ilegivel — ja cobertos la, nao
// duplicados aqui). Esta frente e a que MAIS mexe nesse arquivo desde a F0
// (D-F2-6, religa a matriz + naipes aos componentes de range-lab/ e, junto
// disso, D-F2-4 devolve o texto do ponto de virada no turn/flop). O maior
// risco de regressao desta frente mora exatamente aqui.
//
// Contrato assumido: o bloco que hoje mostra "Ponto de virada: arraste o
// slider..." (fora do river) e "Break-even: vilao precisa estar blefando..."
// (no river) ganham testid estavel:
//   `combos-breakeven-turnflop` — turn/flop, com o numero de
//     solveBreakevenMultiplier(verdict).k, NAO mais o texto generico de
//     "arraste o slider".
//   `combos-breakeven-river` — river, o mesmo texto/numero que ja existia
//     (breakevenFrequency fechado, ev.ts intocado).
//
// Fixture: os spots MEDIDOS da F0 (f0-fixtures.ts) — pote 36,1/call 13,8,
// hero As6s, range A7s+76s+KK. k de referencia (conferidos nesta sessao):
// flop 0,007621097718527866 (~0,76%), turn 0,05437127917598511 (~5,44%),
// river 0,31855955678670356 (~31,86%, bate com o fechado ate 1e-9).
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const DRAFT_KEY_V1 = "grindfy.comboCalc.draft.v1";
const CALC_PATH = "../../../client/src/components/calculators/CombosCalculator";

async function loadCalculator() {
  const mod: any = await import(/* @vite-ignore */ CALC_PATH);
  return mod.default ?? mod.CombosCalculator;
}

function seedDraft(board: string[]): void {
  localStorage.setItem(
    DRAFT_KEY_V1,
    JSON.stringify({
      board,
      hero: ["As", "6s"],
      entries: [
        { notation: "A7s", kind: "suited", frequency: 1 },
        { notation: "76s", kind: "suited", frequency: 1 },
        { notation: "KK", kind: "pair", frequency: 1 },
      ],
      potInput: "36.1",
      callInput: "13.8",
      bbInput: "",
    }),
  );
}

async function renderCalculator() {
  const CombosCalculator = await loadCalculator();
  return render(<CombosCalculator />);
}

/** Extrai o primeiro numero percentual do texto ("~0,76%" ou "0.76%" -> 0.76). */
function firstPercent(text: string): number {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) throw new Error(`nenhum percentual encontrado em: "${text}"`);
  return parseFloat(m[1].replace(",", "."));
}

beforeEach(() => {
  localStorage.clear();
});

describe("F2 D-F2-4 — flop: o ponto de virada usa solveBreakevenMultiplier, nao 'arraste o slider'", () => {
  it("mostra ~0,76% (k do solver), nao mais o texto generico de arrastar o slider", async () => {
    seedDraft(["Ad", "8h", "4h"]);
    await renderCalculator();

    const bloco = await screen.findByTestId("combos-breakeven-turnflop");
    expect(
      bloco.textContent,
      "o texto antigo 'arraste o slider' nao pode sobreviver ao RF-02.6",
    ).not.toMatch(/arraste o slider/i);
    const pct = firstPercent(bloco.textContent ?? "");
    expect(
      Math.abs(pct - 0.762),
      `esperava algo perto de 0,76% (k do solver), veio "${bloco.textContent}"`,
    ).toBeLessThan(0.5);
  });
});

describe("F2 D-F2-4 — turn: o ponto de virada usa solveBreakevenMultiplier", () => {
  it("mostra ~5,44% (k do solver) no bordo de 4 cartas", async () => {
    seedDraft(["Ad", "8h", "4h", "2c"]);
    await renderCalculator();

    const bloco = await screen.findByTestId("combos-breakeven-turnflop");
    const pct = firstPercent(bloco.textContent ?? "");
    expect(
      Math.abs(pct - 5.437),
      `esperava algo perto de 5,44% (k do solver), veio "${bloco.textContent}"`,
    ).toBeLessThan(0.5);
  });

  it("NAO mostra mais o numero do fechado antigo (41,85% ficticio / erro de 6,8pp documentado na spec)", async () => {
    seedDraft(["Ad", "8h", "4h", "2c"]);
    await renderCalculator();

    const bloco = await screen.findByTestId("combos-breakeven-turnflop");
    const pct = firstPercent(bloco.textContent ?? "");
    // O fechado antigo (W*/W) erra por mais do que o dobro no turn — qualquer
    // numero perto de 1 (100%) ou do valor fechado generico denunciaria que o
    // componente nao trocou de formula.
    expect(pct).toBeLessThan(20);
  });
});

describe("F2 D-F2-4 — river: o texto do fechado continua igual (ev.ts intocado)", () => {
  it("mostra ~31,86%, batendo com o breakevenFrequency fechado (D11 — os dois modelos coincidem no river)", async () => {
    seedDraft(["Ad", "8h", "4h", "2c", "5d"]);
    await renderCalculator();

    const bloco = await screen.findByTestId("combos-breakeven-river");
    const pct = firstPercent(bloco.textContent ?? "");
    expect(Math.abs(pct - 31.856)).toBeLessThan(0.5);
  });
});

describe("F2 D-F2-6 — a matriz do vilao agora e o RangeMatrix compartilhado", () => {
  it("clicar uma celula pinta o range e o veredito aparece; Ctrl+Z desfaz e volta ao empty state", async () => {
    // Board pronto, mas SEM entries — range_empty, portao RF-00.2 bloqueia.
    localStorage.setItem(
      "grindfy.comboCalc.draft.v1",
      JSON.stringify({
        board: ["Ad", "8h", "4h", "2c", "5d"],
        hero: ["As", "6s"],
        entries: [],
        potInput: "36.1",
        callInput: "13.8",
        bbInput: "",
      }),
    );
    await renderCalculator();

    expect(await screen.findByTestId("combos-empty-state")).toBeInTheDocument();

    const cell = screen.getByTestId("range-cell-AA");
    fireEvent.click(cell);

    await waitFor(() =>
      expect(screen.queryByTestId("combos-empty-state")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText(/call|fold|break-even/i).length).toBeGreaterThan(0);

    const matrix = screen.getByTestId("combos-villain-matrix");
    fireEvent.keyDown(matrix, { key: "z", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByTestId("combos-empty-state")).toBeInTheDocument(),
    );
  });
});
