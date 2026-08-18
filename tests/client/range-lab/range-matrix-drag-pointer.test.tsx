// F2 — RangeMatrix.tsx migra o arrastar-para-pintar para Pointer Events
// (RF-02.1, D-F2-1, ADR-247 criterio de aceite 5).
//
// O reviewer da rodada 1 achou: RangeMatrix so tem onClick/onWheel por
// celula. O drag antigo (CombosCalculator.tsx:262-273, onMouseDown +
// onMouseEnter, ver referencia abaixo) nunca foi migrado pra matriz nova —
// nem mouse-drag nem toque pintam varias celulas de uma vez em
// range-lab/RangeMatrix.tsx hoje. Ctrl+clique/Shift+clique/cabecalho (que JA
// existem, testados em range-matrix-gestures.test.tsx) continuam intocados
// aqui — este arquivo so acrescenta o gesto de ARRASTAR.
//
// Referencia de comportamento a preservar (CombosCalculator.tsx):
//   onCellDown(notation): grava modo "add" se a celula estava desligada,
//     "remove" se estava ligada — e already aplica o primeiro toggle.
//   onCellEnter(notation): so pinta/apaga se `drag.current.active`, no MESMO
//     modo decidido no down.
//   encerramento: window "mouseup"/"pointerup"/"blur" + document
//     "mouseleave" (CombosCalculator.tsx:183-193) — ROBUSTO, e a spec pede
//     pra preservar essa robustez na migracao pra pointer events.
//
// Contrato assumido (novo em RangeMatrix.tsx, cada celula ganha):
//   onPointerDown -> inicia o drag, decide modo por `byNotation.has(notation)`
//   onPointerEnter -> se o drag esta ativo, aplica o modo decidido no down
//   um listener em `window` para "pointerup" (e blur, nao testado aqui)
//     encerra o drag — pointerenter POSTERIOR nao pinta mais nada.
//
// Isolado da pagina real: usa um harness controlado local (mesmo padrao que
// range-matrix-gestures.test.tsx usa para o caso de reset de historico) para
// que os `onChange` sucessivos ACUMULEM no `entries`, do jeito que a pagina
// de verdade se comporta — sem isso, cada pointerenter reportaria so a
// PROPRIA celula contra o `entries` ORIGINAL (util para os testes existentes
// de Ctrl+clique/Shift+clique, que disparam onChange uma vez so, mas nao
// para um drag de N celulas).
//
// LIMITACAO jsdom documentada (lesson #25 do CLAUDE.md — nao finja cobertura
// completa): jsdom 29 constroi `PointerEvent` com `pointerId`/`pointerType`
// aceitos no init, mas NAO simula hardware de toque real (multi-touch,
// pressure, captura nativa do SO). O teste de "toque" abaixo so prova que o
// handler NAO discrimina por `pointerType` — nao e prova de que um tablet
// real pinta a matriz.
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import type { RangeEntry } from "@/lib/combo-calc/types";

const MATRIX_PATH = "../../../client/src/components/range-lab/RangeMatrix";

async function loadRangeMatrix() {
  const mod: any = await import(/* @vite-ignore */ MATRIX_PATH);
  return mod.RangeMatrix ?? mod.default;
}

/** Harness controlado: onChange acumula no `entries`, como a pagina real faz. */
function makeControlledHarness(RangeMatrix: any) {
  return function ControlledHarness({ initial = [] as RangeEntry[] }: { initial?: RangeEntry[] }) {
    const [entries, setEntries] = useState<RangeEntry[]>(initial);
    return (
      <RangeMatrix entries={entries} onChange={setEntries} testId="drag-matrix" />
    );
  };
}

async function renderControlled(initial: RangeEntry[] = []) {
  const RangeMatrix = await loadRangeMatrix();
  const ControlledHarness = makeControlledHarness(RangeMatrix);
  return render(<ControlledHarness initial={initial} />);
}

// NAO usar /emerald/: a celula sempre carrega "hover:outline-emerald-400"
// independente de estar ativa. So `bg-emerald-600` marca a classe LIGADA.
function isPainted(el: HTMLElement): boolean {
  return /bg-emerald-600/.test(el.className);
}

const P = { pointerId: 1, pointerType: "mouse" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F2 D-F2-1 criterio 5 — pointerdown numa celula DESLIGADA inicia o modo 'add'", () => {
  it("pointerdown em 22 + pointerenter em 33 e 44 pinta as tres", async () => {
    await renderControlled([]);

    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-44"), P);

    expect(isPainted(screen.getByTestId("range-cell-22")), "a celula onde o drag comecou nao pintou").toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-33")), "pointerenter durante o drag nao pintou").toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-44")), "pointerenter durante o drag nao pintou").toBe(true);
  });

  it("celulas fora do caminho do drag continuam desligadas", async () => {
    await renderControlled([]);
    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), P);

    expect(
      isPainted(screen.getByTestId("range-cell-AA")),
      "uma celula que o pointer nunca tocou nao deveria pintar",
    ).toBe(false);
  });

  it("pointerenter SEM pointerdown antes nao pinta nada (nao ha drag ativo)", async () => {
    await renderControlled([]);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-55"), P);
    expect(isPainted(screen.getByTestId("range-cell-55"))).toBe(false);
  });
});

describe("F2 D-F2-1 criterio 5 — pointerdown numa celula LIGADA inicia o modo 'remove'", () => {
  it("pointerdown em 22 (ativa) + pointerenter em 33 (ativa) apaga as duas", async () => {
    await renderControlled([
      { notation: "22", kind: "pair", frequency: 1 },
      { notation: "33", kind: "pair", frequency: 1 },
    ]);
    expect(isPainted(screen.getByTestId("range-cell-22"))).toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-33"))).toBe(true);

    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), P);

    expect(isPainted(screen.getByTestId("range-cell-22")), "modo remove nao apagou a celula inicial").toBe(false);
    expect(isPainted(screen.getByTestId("range-cell-33")), "modo remove nao apagou a celula tocada pelo drag").toBe(false);
  });

  it("um drag iniciado em modo remove nao apaga uma celula DESLIGADA no caminho (nao inventa toggle duplo)", async () => {
    await renderControlled([{ notation: "22", kind: "pair", frequency: 1 }]);

    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), P); // 33 ja estava desligada

    expect(isPainted(screen.getByTestId("range-cell-22"))).toBe(false);
    expect(
      isPainted(screen.getByTestId("range-cell-33")),
      "modo remove nao deveria ligar uma celula que ja estava desligada",
    ).toBe(false);
  });
});

describe("F2 D-F2-1 — encerramento do drag por pointerup GLOBAL (window), preservando a robustez do popup", () => {
  it("pointerup na window encerra o drag: pointerenter POSTERIOR nao pinta mais nada", async () => {
    await renderControlled([]);

    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), P);
    fireEvent.pointerUp(window, P);

    fireEvent.pointerEnter(screen.getByTestId("range-cell-44"), P);

    expect(isPainted(screen.getByTestId("range-cell-22"))).toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-33"))).toBe(true);
    expect(
      isPainted(screen.getByTestId("range-cell-44")),
      "pointerenter depois do pointerup global ainda pintou — o drag nao foi " +
        "encerrado (regressao da robustez que o mouse ja tinha em CombosCalculator.tsx)",
    ).toBe(false);
  });

  it("um pointerdown NOVO depois do pointerup comeca um drag novo e independente", async () => {
    await renderControlled([]);

    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), P);
    fireEvent.pointerUp(window, P);

    fireEvent.pointerDown(screen.getByTestId("range-cell-99"), P);
    fireEvent.pointerEnter(screen.getByTestId("range-cell-TT"), P);

    expect(isPainted(screen.getByTestId("range-cell-99"))).toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-TT"))).toBe(true);
  });
});

// jsdom LIMITACAO documentada (lesson #25): ver comentario de topo do arquivo.
describe("F2 criterio 5 — matriz responde a toque (limitacao jsdom documentada, nao e prova de hardware real)", () => {
  it("pointerType 'touch' pinta igual a 'mouse' — o handler nao faz branch por tipo de ponteiro", async () => {
    await renderControlled([]);
    fireEvent.pointerDown(screen.getByTestId("range-cell-22"), { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerEnter(screen.getByTestId("range-cell-33"), { pointerId: 1, pointerType: "touch" });

    expect(isPainted(screen.getByTestId("range-cell-22"))).toBe(true);
    expect(isPainted(screen.getByTestId("range-cell-33"))).toBe(true);
  });
});
