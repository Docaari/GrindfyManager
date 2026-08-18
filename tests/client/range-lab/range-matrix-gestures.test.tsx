// F2 — RangeMatrix estendida com os atalhos da frente (RF-02.1, D-F2-1/D-F2-2).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.1)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-1, D-F2-2)
// Diagrama: Docs/architecture/diagrams/range-lab-f2/gestos-e-historico.mermaid
//
// A F1 deixou RangeMatrix.tsx "fazendo o minimo" (so liga/desliga a classe).
// Esta frente estende o MESMO componente (nao cria um novo) com:
//   - Ctrl+clique (expandCtrlClick), Shift+clique (retangulo), header de
//     linha/coluna, scroll (5% por passo).
//   - Ctrl+Z/Ctrl+Y: o componente NAO possui o historico (D-F2-2: mora no
//     DONO do estado). Ele so PRECISA disparar `onUndo`/`onRedo` quando o
//     CONTAINER da matriz recebe o atalho — por isso os testes de undo/redo
//     verificam que o callback dispara, e que duas instancias da matriz
//     (heroi/vilao) tem handlers INDEPENDENTES (nunca um documento so).
//
// Contrato assumido (props NOVAS em RangeMatrixProps, alem das que a F1 ja
// tem — entries/onChange/defaultFrequency/testId):
//   onUndo?: () => void;
//   onRedo?: () => void;
// Testids novos assumidos: `range-row-header-<row 0..12>`,
// `range-col-header-<col 0..12>` (0 = rank mais alto, Ace — mesma ordem de
// RANKS_DESC que `cellNotation` ja usa). Celulas continuam usando o testid
// que a F1 ja plantou: `range-cell-<notation>`.
//
// LICOES: #14/#26/#38 (SO `await import`, nunca `require`, nunca misturar os
// dois no mesmo arquivo — RangeMatrix nao usa Context, mas a convencao do
// pacote e uniforme), #2 (data-testid estavel).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import type { RangeEntry } from "@/lib/combo-calc/types";
import { createHistory, push, undo, resetHistory, type HistoryState } from "@/lib/combo-calc/history";

const MATRIX_PATH = "../../../client/src/components/range-lab/RangeMatrix";

async function loadRangeMatrix() {
  const mod: any = await import(/* @vite-ignore */ MATRIX_PATH);
  return mod.RangeMatrix ?? mod.default;
}

let onChange: ReturnType<typeof vi.fn>;
let onUndo: ReturnType<typeof vi.fn>;
let onRedo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
  onUndo = vi.fn();
  onRedo = vi.fn();
});

function notationsOf(entries: RangeEntry[]): string[] {
  return entries.map((e) => e.notation).sort();
}

async function renderMatrix(entries: RangeEntry[], extraProps: Record<string, unknown> = {}) {
  const RangeMatrix = await loadRangeMatrix();
  return render(
    <RangeMatrix
      entries={entries}
      onChange={onChange}
      onUndo={onUndo}
      onRedo={onRedo}
      testId="matrix-under-test"
      {...extraProps}
    />,
  );
}

// ── Ctrl+clique ──────────────────────────────────────────────

describe("F2 D-F2-1 — Ctrl+clique expande via expandCtrlClick (criterios de aceite 1 e 2)", () => {
  it("Ctrl+clique no 22 pinta os 13 pares ate AA de uma vez", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-cell-22"), { ctrlKey: true });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next: RangeEntry[] = onChange.mock.calls[0][0];
    expect(notationsOf(next)).toEqual(
      ["22", "33", "44", "55", "66", "77", "88", "99", "TT", "JJ", "QQ", "KK", "AA"].sort(),
    );
  });

  it("Ctrl+clique em A9s sobe o kicker ate AKs", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-cell-A9s"), { ctrlKey: true });

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    expect(notationsOf(next)).toEqual(["A9s", "ATs", "AJs", "AQs", "AKs"].sort());
  });

  it("clique SEM Ctrl continua sendo o toggle simples (nao expande)", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-cell-22"));

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    expect(notationsOf(next)).toEqual(["22"]);
  });
});

// ── Shift+clique ─────────────────────────────────────────────

describe("F2 D-F2-1 — Shift+clique pinta o retangulo desde o ultimo clique simples", () => {
  it("clique em AA, depois Shift+clique em KK pinta o retangulo 2x2", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-cell-AA"));
    fireEvent.click(screen.getByTestId("range-cell-KK"), { shiftKey: true });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(notationsOf(lastCall)).toEqual(["AA", "AKs", "AKo", "KK"].sort());
  });
});

// ── Cabecalho de linha/coluna ────────────────────────────────

describe("F2 D-F2-1 — clique no cabecalho pinta a linha ou a coluna inteira", () => {
  it("cabecalho da linha do Ace (row 0) pinta AA + todos os suited A-x", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-row-header-0"));

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    expect(notationsOf(next)).toEqual(
      ["AA", "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s"].sort(),
    );
  });

  it("cabecalho da coluna do Ace (col 0) pinta AA + todos os offsuit A-x (conjunto DIFERENTE da linha)", async () => {
    await renderMatrix([]);
    fireEvent.click(screen.getByTestId("range-col-header-0"));

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    expect(notationsOf(next)).toEqual(
      ["AA", "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o"].sort(),
    );
  });
});

// ── Scroll ajusta frequencia ─────────────────────────────────

describe("F2 emenda A7 — scroll na celula ajusta a frequencia em passos de 5%", () => {
  it("scroll para baixo numa celula ATIVA reduz a frequencia em 5%", async () => {
    await renderMatrix([{ notation: "AA", kind: "pair", frequency: 0.5 }]);
    fireEvent.wheel(screen.getByTestId("range-cell-AA"), { deltaY: 10 });

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    const aa = next.find((e) => e.notation === "AA");
    expect(aa?.frequency).toBeCloseTo(0.45, 9);
  });

  it("scroll para cima numa celula ATIVA aumenta a frequencia em 5%", async () => {
    await renderMatrix([{ notation: "AA", kind: "pair", frequency: 0.5 }]);
    fireEvent.wheel(screen.getByTestId("range-cell-AA"), { deltaY: -10 });

    const next: RangeEntry[] = onChange.mock.calls[0][0];
    const aa = next.find((e) => e.notation === "AA");
    expect(aa?.frequency).toBeCloseTo(0.55, 9);
  });

  it("scroll numa celula INATIVA nao inventa uma classe nova", async () => {
    await renderMatrix([]);
    fireEvent.wheel(screen.getByTestId("range-cell-AA"), { deltaY: 10 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Ctrl+Z / Ctrl+Y escopados ao container ───────────────────

describe("F2 D-F2-2 — Ctrl+Z/Ctrl+Y disparam onUndo/onRedo, escopados a ESTA matriz", () => {
  it("Ctrl+Z no container chama onUndo", async () => {
    await renderMatrix([]);
    fireEvent.keyDown(screen.getByTestId("matrix-under-test"), { key: "z", ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("Ctrl+Y no container chama onRedo", async () => {
    await renderMatrix([]);
    fireEvent.keyDown(screen.getByTestId("matrix-under-test"), { key: "y", ctrlKey: true });
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("'z' sem Ctrl NAO dispara onUndo (nao e um atalho global de tecla)", async () => {
    await renderMatrix([]);
    fireEvent.keyDown(screen.getByTestId("matrix-under-test"), { key: "z" });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("duas instancias da matriz (heroi/vilao) tem historico independente: Ctrl+Z numa NUNCA aciona a outra", async () => {
    const RangeMatrix = await loadRangeMatrix();
    const onUndoHero = vi.fn();
    const onUndoVillain = vi.fn();
    render(
      <>
        <RangeMatrix entries={[]} onChange={vi.fn()} onUndo={onUndoHero} testId="hero-matrix" />
        <RangeMatrix entries={[]} onChange={vi.fn()} onUndo={onUndoVillain} testId="villain-matrix" />
      </>,
    );

    fireEvent.keyDown(screen.getByTestId("hero-matrix"), { key: "z", ctrlKey: true });

    expect(onUndoHero).toHaveBeenCalledTimes(1);
    expect(
      onUndoVillain,
      "Ctrl+Z no range do heroi desfez uma pintura no range do vilao — undo global, nao por matriz",
    ).not.toHaveBeenCalled();
  });
});

// ── Reset de historico em prop externa (nao e um push) ────────

/**
 * Harness minimo: compoe RangeMatrix com o historico JA testado
 * (combo-calc/history.ts) do jeito que D-F2-2 descreve — o dono do estado
 * instancia o historico, nao a matriz. Existe so para provar a integracao
 * completa do criterio "Ctrl+Z depois de carregar spot salvo NAO revela o
 * spot anterior" (estado fantasma), que nenhum teste unitario isolado de
 * history.ts ou de RangeMatrix sozinhos consegue provar.
 *
 * Recebe o componente RangeMatrix ja resolvido (via `await import`, licao
 * #14/#26/#38 — nunca `require` num arquivo `.test.tsx`) como prop, em vez de
 * carrega-lo sozinho: um componente React nao pode `await` no proprio corpo.
 */
function makeHistoryHarness(RangeMatrix: any) {
  return function HistoryHarness() {
    const [hist, setHist] = useState<HistoryState<RangeEntry[]>>(() => createHistory<RangeEntry[]>([]));

    function handleChange(next: RangeEntry[]) {
      setHist((h) => push(h, next));
    }
    function handleUndo() {
      setHist((h) => undo(h));
    }
    function loadPreset() {
      // Reset "de fora do fluxo de pintura" — como loadSpot()/reset() em
      // RangeLab.tsx: NAO passa por push, passa por resetHistory.
      setHist((h) => resetHistory(h, [{ notation: "KK", kind: "pair", frequency: 1 }]));
    }

    return (
      <div>
        <button type="button" data-testid="load-preset" onClick={loadPreset}>
          Carregar spot salvo
        </button>
        <RangeMatrix
          entries={hist.present}
          onChange={handleChange}
          onUndo={handleUndo}
          testId="harness-matrix"
        />
      </div>
    );
  };
}

describe("F2 D-F2-2 — reset em prop externa NAO e desfazivel (sem estado fantasma)", () => {
  it("Ctrl+Z depois de 'carregar spot salvo' nao revela o range anterior ao load", async () => {
    const RangeMatrix = await loadRangeMatrix();
    const HistoryHarness = makeHistoryHarness(RangeMatrix);
    render(<HistoryHarness />);

    // 1. Pinta algo (isso E desfazivel).
    fireEvent.click(screen.getByTestId("range-cell-AA"));
    // 2. Carrega um preset por FORA do fluxo de pintura (reset, nao push).
    fireEvent.click(screen.getByTestId("load-preset"));
    expect(screen.getByTestId("range-cell-KK").className).toMatch(/emerald/);

    // 3. Ctrl+Z: se o historico nao tivesse sido resetado, isto voltaria para
    // o "AA" pintado no passo 1 — o estado fantasma que a D-F2-2 existe para
    // evitar.
    fireEvent.keyDown(screen.getByTestId("harness-matrix"), { key: "z", ctrlKey: true });

    expect(
      screen.getByTestId("range-cell-KK").className,
      "Ctrl+Z revelou o range ANTERIOR ao preset carregado — estado fantasma",
    ).toMatch(/emerald/);
  });
});
