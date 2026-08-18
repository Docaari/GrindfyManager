// F2 — RangeLab.tsx (pagina REAL) tem que instanciar history.ts (RF-02.1,
// D-F2-2, ADR-247). O reviewer da rodada 1 achou history.ts bem testado mas
// ORFAO: RangeMatrix.tsx ja dispara onUndo/onRedo quando Ctrl+Z/Ctrl+Y sao
// apertados dentro do container de CADA matriz (isso a rodada 1 entregou e
// range-matrix-gestures.test.tsx ja prova, isolado, com um harness LOCAL
// dentro do proprio arquivo de teste). O que falta e RangeLab.tsx de verdade
// dar os dois prop `onUndo`/`onRedo` pros DOIS RangeMatrix que ja renderiza
// (range-lab-hero-matrix, range-lab-villain-matrix), cada um com sua PROPRIA
// instancia de history.ts (createHistory/push/undo/redo/resetHistory) —
// exatamente o padrao que HistoryHarness ja provou funcionar isolado.
//
// Este arquivo NAO reabre RangeMatrix.tsx nem history.ts (ja testados e
// verdes). Ele so prova a INTEGRACAO real: apertar Ctrl+Z na pagina de
// verdade tem que desfazer a pintura na tela de verdade, e os dois lados
// (heroi/vilao) tem que ter historico independente ali tambem — nao so no
// harness minimo da rodada 1.
//
// Contrato assumido (o que falta em RangeLab.tsx, nada em RangeMatrix.tsx):
//   - useState/useRef com createHistory<RangeEntry[]>([]) para heroRange
//   - useState/useRef com createHistory<RangeEntry[]>([]) para villainRange
//   - RangeMatrix (hero) ganha onUndo/onRedo que chamam undo()/redo() no
//     historico do heroi e refletem em setHeroRange
//   - RangeMatrix (vilao) ganha onUndo/onRedo com o historico DO VILAO
//   - reset() e loadSpot() (ja existentes) passam a chamar resetHistory(...)
//     em vez de so setHeroRange([])/setVillainRange([]) — NAO testado aqui
//     (e o escopo do handoff da F1/F2, coberto por range-matrix-gestures.test.tsx
//     via harness isolado; aqui so undo/redo basico e independencia hero/vilao)
//
// LICOES: #14/#26/#38 (SO `await import`, nunca `require`), #28 (vi.mock casa
// o caminho EXATO — a pagina importa de `@/hooks/useRangeEngine`), #29
// (QueryClientProvider em volta), #2 (data-testid estavel).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { useRangeEngineMock } = vi.hoisted(() => ({
  useRangeEngineMock: vi.fn(),
}));

vi.mock("@/hooks/useRangeEngine", () => ({
  useRangeEngine: (...args: any[]) => useRangeEngineMock(...args),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/range-lab", vi.fn()],
  Link: ({ children }: any) => children,
  useRoute: () => [false, null],
}));

const PAGE_PATH = "../../../client/src/pages/RangeLab";

async function loadPage() {
  const mod: any = await import(/* @vite-ignore */ PAGE_PATH);
  return mod.default ?? mod.RangeLab;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function renderPage() {
  const RangeLab = await loadPage();
  return render(
    <QueryClientProvider client={makeClient()}>
      <RangeLab />
    </QueryClientProvider>,
  );
}

function engineState(overrides: Record<string, unknown> = {}) {
  return { result: null, progress: 0, running: false, cancel: vi.fn(), ...overrides };
}

// NAO usar /emerald/: a celula sempre carrega "hover:outline-emerald-400"
// independente de estar ativa. So `bg-emerald-600` marca a classe LIGADA.
function isPainted(el: HTMLElement): boolean {
  return /bg-emerald-600/.test(el.className);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRangeEngineMock.mockReturnValue(engineState());
});

describe("F2 D-F2-2 — Ctrl+Z/Ctrl+Y no range do HEROI, na pagina real", () => {
  it("pinta AA, Ctrl+Z no container do heroi apaga, Ctrl+Y refaz", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AA"));
    expect(
      isPainted(within(heroMatrix).getByTestId("range-cell-AA")),
      "o clique simples deveria pintar AA antes de testar o desfazer",
    ).toBe(true);

    fireEvent.keyDown(heroMatrix, { key: "z", ctrlKey: true });
    expect(
      isPainted(within(heroMatrix).getByTestId("range-cell-AA")),
      "Ctrl+Z no range do heroi nao desfez a pintura — RangeLab.tsx ainda nao " +
        "instancia history.ts para o heroi (ADR-247 D-F2-2): RangeMatrix ja " +
        "dispara onUndo, mas a pagina real nao passa esse prop.",
    ).toBe(false);

    fireEvent.keyDown(heroMatrix, { key: "y", ctrlKey: true });
    expect(
      isPainted(within(heroMatrix).getByTestId("range-cell-AA")),
      "Ctrl+Y deveria refazer a pintura que o Ctrl+Z desfez",
    ).toBe(true);
  });
});

describe("F2 D-F2-2 — Ctrl+Z/Ctrl+Y no range do VILAO, na pagina real", () => {
  it("pinta KK, Ctrl+Z no container do vilao apaga, Ctrl+Y refaz", async () => {
    await renderPage();
    const villainMatrix = screen.getByTestId("range-lab-villain-matrix");

    fireEvent.click(within(villainMatrix).getByTestId("range-cell-KK"));
    expect(isPainted(within(villainMatrix).getByTestId("range-cell-KK"))).toBe(true);

    fireEvent.keyDown(villainMatrix, { key: "z", ctrlKey: true });
    expect(
      isPainted(within(villainMatrix).getByTestId("range-cell-KK")),
      "Ctrl+Z no range do vilao nao desfez a pintura",
    ).toBe(false);

    fireEvent.keyDown(villainMatrix, { key: "y", ctrlKey: true });
    expect(isPainted(within(villainMatrix).getByTestId("range-cell-KK"))).toBe(true);
  });
});

describe("F2 D-F2-2 — os dois historicos (heroi/vilao) sao INDEPENDENTES na pagina real", () => {
  it("Ctrl+Z no heroi nunca desfaz uma pintura no vilao", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");
    const villainMatrix = screen.getByTestId("range-lab-villain-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AA"));
    fireEvent.click(within(villainMatrix).getByTestId("range-cell-KK"));
    expect(isPainted(within(heroMatrix).getByTestId("range-cell-AA"))).toBe(true);
    expect(isPainted(within(villainMatrix).getByTestId("range-cell-KK"))).toBe(true);

    fireEvent.keyDown(heroMatrix, { key: "z", ctrlKey: true });

    expect(
      isPainted(within(heroMatrix).getByTestId("range-cell-AA")),
      "o proprio heroi deveria ter desfeito",
    ).toBe(false);
    expect(
      isPainted(within(villainMatrix).getByTestId("range-cell-KK")),
      "Ctrl+Z no heroi desfez uma pintura no vilao — historico compartilhado " +
        "em vez de 'por matriz' (D-F2-2 proibe explicitamente)",
    ).toBe(true);
  });

  it("Ctrl+Z no vilao nunca desfaz uma pintura no heroi (o inverso tambem vale)", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");
    const villainMatrix = screen.getByTestId("range-lab-villain-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-QQ"));
    fireEvent.click(within(villainMatrix).getByTestId("range-cell-JJ"));

    fireEvent.keyDown(villainMatrix, { key: "z", ctrlKey: true });

    expect(isPainted(within(villainMatrix).getByTestId("range-cell-JJ"))).toBe(false);
    expect(
      isPainted(within(heroMatrix).getByTestId("range-cell-QQ")),
      "Ctrl+Z no vilao desfez uma pintura no heroi",
    ).toBe(true);
  });
});
