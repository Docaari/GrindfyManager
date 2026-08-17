// F1 / RF-01.5 — BoardPicker sem fileira de slots (emenda A20).
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.5)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-10)
//
// Um baralho unico: as 3 primeiras cartas viram flop, a 4a turn, a 5a river;
// clicar de novo remove. Menos clique e menos estado do que a fileira de slots
// de hoje.
//
// Contrato assumido (o implementer cria exatamente isto):
//   client/src/components/range-lab/BoardPicker.tsx
//   <BoardPicker board={Card[]} onChange={(next: Card[]) => void} random={() => number} />
//   `random` e opcional e cai em `Math.random` em producao — existe para o teste
//   ser deterministico sem prender o sorteio a uma sequencia especifica.
//   data-testid: range-lab-board-picker, board-card-<cardKey>, board-random
//
// LICOES: #14/#26/#38 (SO `await import` neste arquivo), #2 (data-testid),
// #27 (userEvent.click cobre componentes Radix, que reagem a mousedown).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { cardKey, parseCard } from "@/lib/combo-calc/cards";
import type { Card } from "@/lib/combo-calc/types";

const PICKER_PATH = "../../../client/src/components/range-lab/BoardPicker";

async function loadPicker() {
  const mod: any = await import(/* @vite-ignore */ PICKER_PATH);
  return mod.BoardPicker ?? mod.default;
}

function card(spec: string): Card {
  const c = parseCard(spec);
  if (!c) throw new Error(`carta invalida na fixture: ${spec}`);
  return c;
}

/** PRNG local, deterministico. Nao depende de nenhum modulo novo da F1. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
});

async function renderPicker(board: Card[], seed = 20240815) {
  const BoardPicker = await loadPicker();
  const utils = render(
    <BoardPicker board={board} onChange={onChange} random={seededRandom(seed)} />,
  );
  return {
    ...utils,
    async setBoard(next: Card[]) {
      utils.rerender(
        <BoardPicker board={next} onChange={onChange} random={seededRandom(seed)} />,
      );
    },
  };
}

/** Ultimo bordo que o picker propos. */
function lastBoard(): Card[] {
  if (onChange.mock.calls.length === 0) {
    throw new Error("o picker nunca chamou onChange");
  }
  return onChange.mock.calls[onChange.mock.calls.length - 1][0];
}

function keys(list: Card[]): string[] {
  return list.map(cardKey);
}

// ── montagem por cliques ─────────────────────────────────────

describe("F1 A20 — o bordo se monta em cliques, sem fileira de slots", () => {
  it("renderiza o picker", async () => {
    await renderPicker([]);
    expect(screen.getByTestId("range-lab-board-picker")).toBeInTheDocument();
  });

  it("tres cliques montam o flop", async () => {
    const user = userEvent.setup();
    const view = await renderPicker([]);

    await user.click(screen.getByTestId("board-card-Ad"));
    expect(keys(lastBoard())).toEqual(["Ad"]);
    await view.setBoard(lastBoard());

    await user.click(screen.getByTestId("board-card-8h"));
    expect(keys(lastBoard())).toEqual(["Ad", "8h"]);
    await view.setBoard(lastBoard());

    await user.click(screen.getByTestId("board-card-4h"));
    expect(keys(lastBoard()), "as tres primeiras cartas sao o flop").toEqual([
      "Ad",
      "8h",
      "4h",
    ]);
  });

  it("o quarto clique vira turn e o quinto vira river", async () => {
    const user = userEvent.setup();
    const view = await renderPicker([card("Ad"), card("8h"), card("4h")]);

    await user.click(screen.getByTestId("board-card-2c"));
    expect(lastBoard(), "quarta carta = turn").toHaveLength(4);
    expect(keys(lastBoard())[3]).toBe("2c");
    await view.setBoard(lastBoard());

    await user.click(screen.getByTestId("board-card-5d"));
    expect(lastBoard(), "quinta carta = river").toHaveLength(5);
    expect(keys(lastBoard())[4]).toBe("5d");
  });

  it("clicar numa carta ja escolhida remove ela", async () => {
    const user = userEvent.setup();
    await renderPicker([card("Ad"), card("8h"), card("4h")]);

    await user.click(screen.getByTestId("board-card-8h"));
    expect(
      keys(lastBoard()),
      "clicar de novo tem que remover, nao duplicar nem ignorar",
    ).toEqual(["Ad", "4h"]);
  });

  it("com o bordo cheio, clicar numa carta nova nao passa de cinco", async () => {
    const user = userEvent.setup();
    const cheio = [card("Ad"), card("8h"), card("4h"), card("2c"), card("5d")];
    await renderPicker(cheio);

    await user.click(screen.getByTestId("board-card-Kc"));

    if (onChange.mock.calls.length > 0) {
      expect(
        lastBoard(),
        `o bordo passou de 5 cartas: ${keys(lastBoard()).join(" ")}`,
      ).toHaveLength(5);
      expect(keys(lastBoard())).not.toContain("Kc");
    }
  });

  it("remover funciona mesmo com o bordo cheio (o jogador nunca fica preso)", async () => {
    const user = userEvent.setup();
    const cheio = [card("Ad"), card("8h"), card("4h"), card("2c"), card("5d")];
    await renderPicker(cheio);

    await user.click(screen.getByTestId("board-card-5d"));
    expect(keys(lastBoard())).toEqual(["Ad", "8h", "4h", "2c"]);
  });
});

// ── botao Aleatorio ──────────────────────────────────────────

describe("F1 A20 — Aleatorio sorteia o flop inteiro e depois uma carta por vez", () => {
  it("com o bordo vazio sorteia tres cartas distintas", async () => {
    const user = userEvent.setup();
    await renderPicker([]);

    await user.click(screen.getByTestId("board-random"));

    const board = lastBoard();
    expect(board, `sorteou ${keys(board).join(" ")}`).toHaveLength(3);
    expect(
      new Set(keys(board)).size,
      `cartas repetidas no sorteio: ${keys(board).join(" ")}`,
    ).toBe(3);
  });

  it("com o flop na mesa completa UMA carta, preservando as tres", async () => {
    const user = userEvent.setup();
    const flop = [card("Ad"), card("8h"), card("4h")];
    await renderPicker(flop);

    await user.click(screen.getByTestId("board-random"));

    const board = lastBoard();
    expect(board, `sorteou ${keys(board).join(" ")}`).toHaveLength(4);
    expect(keys(board).slice(0, 3)).toEqual(["Ad", "8h", "4h"]);
    expect(
      new Set(keys(board)).size,
      "a carta sorteada repetiu uma que ja estava no bordo",
    ).toBe(4);
  });

  it("com turn na mesa completa o river", async () => {
    const user = userEvent.setup();
    await renderPicker([card("Ad"), card("8h"), card("4h"), card("2c")]);

    await user.click(screen.getByTestId("board-random"));

    expect(lastBoard()).toHaveLength(5);
    expect(new Set(keys(lastBoard())).size).toBe(5);
  });

  it("com o bordo cheio o sorteio nao estoura cinco cartas", async () => {
    const user = userEvent.setup();
    const cheio = [card("Ad"), card("8h"), card("4h"), card("2c"), card("5d")];
    await renderPicker(cheio);

    await user.click(screen.getByTestId("board-random"));

    if (onChange.mock.calls.length > 0) {
      expect(lastBoard()).toHaveLength(5);
    }
  });

  it("com a mesma semente o sorteio se repete (nao usa Math.random)", async () => {
    const user = userEvent.setup();

    // Duas montagens no mesmo teste: consultar por `within(container)` evita o
    // "found multiple elements" que o `screen` global daria.
    const primeiroView = await renderPicker([], 4242);
    await user.click(within(primeiroView.container).getByTestId("board-random"));
    const primeiro = keys(lastBoard());

    onChange.mockClear();
    const segundoView = await renderPicker([], 4242);
    await user.click(within(segundoView.container).getByTestId("board-random"));
    const segundo = keys(lastBoard());

    expect(
      segundo,
      `mesma semente deu ${primeiro.join(" ")} e depois ${segundo.join(" ")}`,
    ).toEqual(primeiro);
  });
});
