// F2 — SuitPickerPopover.tsx existe e esta testado ISOLADO (suit-picker-popover.test.tsx,
// rodada 1) mas nenhuma tela o monta (achado do reviewer da rodada 1). Este
// arquivo testa a INTEGRACAO em RangeLab.tsx — nao repete os testes de forma
// do popover em si (presets, slider por combo, Limpar), so prova que abrir o
// popover a partir de uma celula ativa da matriz de verdade escreve de volta
// no `heroRange` da pagina.
//
// Decisao de onde abrir o popover (o prompt desta rodada pede pra decidir e
// documentar — RF-02.2 nao fixa o gatilho): um BOTAO PEQUENO dentro de cada
// celula ATIVA da matriz (nao aparece em celula desligada), testid
// `range-cell-naipes-<notation>`. Alternativas descartadas:
//   - long-press: exige temporizador e nao tem equivalente limpo de
//     `fireEvent` (teria que fazer fake timers em cima de pointer events que
//     JA precisam ser reais para o drag de RF-02.1 — custo de manutencao
//     alto pra pouco ganho de descoberta).
//   - segundo-clique (double-click): colide com a semantica existente de
//     "clique alterna a classe" — um segundo clique rapido primeiro LIGA
//     (ou desliga) a classe e so DEPOIS abriria o popover, then um duplo
//     sentido no mesmo gesto.
// O botao dedicado e clicavel, descobrivel, e nao overloada nenhum modificador
// (Ctrl/Shift/Alt ja estao ocupados por RF-02.1/D-F2-5).
//
// O botao clicado NAO deveria TAMBEM alternar a classe (stopPropagation) —
// testado abaixo (a celula continua pintada depois de abrir o popover).
//
// Clicar de novo no mesmo botao FECHA o popover (toggle) — assim nao precisa
// de um botao de fechar dedicado dentro do SuitPickerPopover (que a rodada 1
// nao criou, de proposito: o popover so tem presets/slider/Limpar).
//
// Contrato assumido:
//   - RangeMatrixProps ganha `onOpenSuitPicker?: (notation: string) => void`.
//   - Um botao SO aparece em celulas com `entry` (ativas), testid
//     `range-cell-naipes-<notation>`.
//   - RangeLab.tsx guarda `{ side: "hero"|"villain", notation: string } | null`
//     e renderiza `<SuitPickerPopover>` (testid `suit-picker-popover`, ja
//     fixado pelo proprio componente) quando esse estado nao e null.
//   - `combos` do popover vem de `enumerateCombos(parseNotation(notation), dead)`
//     — nao testado exaustivamente aqui (e testado em combos.ts), so que o
//     popover recebe ALGO e responde a mudanca.
//
// LICOES: #14/#26/#38 (SO `await import`), #28 (vi.mock casa o caminho EXATO),
// #29 (QueryClientProvider em volta), #2 (data-testid).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { comboKey, parseCard } from "@/lib/combo-calc/cards";

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

function card(spec: string) {
  const c = parseCard(spec);
  if (!c) throw new Error(`carta invalida na fixture: ${spec}`);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRangeEngineMock.mockReturnValue(engineState());
});

describe("F2 — botao de naipe SO existe em celula ATIVA", () => {
  it("celula desligada nao tem o botao de abrir o seletor de naipes", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");
    expect(within(heroMatrix).queryByTestId("range-cell-naipes-AKs")).toBeNull();
  });

  it("apos pintar a celula, o botao de naipes aparece", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AKs"));

    expect(within(heroMatrix).getByTestId("range-cell-naipes-AKs")).toBeInTheDocument();
  });
});

describe("F2 — abrir o popover a partir da matriz de verdade", () => {
  it("clicar no botao de naipes abre o SuitPickerPopover para a notacao certa, sem desligar a celula", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AKs"));
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs"));

    const popover = await screen.findByTestId("suit-picker-popover");
    expect(popover.textContent, "o popover deveria identificar a notacao AKs").toMatch(/AKs/);

    // NAO usar /emerald/: a celula sempre carrega "hover:outline-emerald-400"
    // independente de estar ativa. So `bg-emerald-600` marca a classe LIGADA.
    expect(
      within(heroMatrix).getByTestId("range-cell-AKs").className,
      "abrir o popover de naipes nao deveria desligar a classe (o clique no botao vazou pro toggle da celula)",
    ).toMatch(/bg-emerald-600/);
  });

  it("clicar de novo no mesmo botao fecha o popover", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AKs"));
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs"));
    await screen.findByTestId("suit-picker-popover");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs"));

    expect(screen.queryByTestId("suit-picker-popover")).toBeNull();
  });
});

describe("F2 — alternar um naipe dentro do popover escreve de volta em heroRange (via onChange)", () => {
  it("mover o slider de UM combo persiste como comboFreqOverrides — reabrir o popover mostra o valor salvo", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AKs"));
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs"));
    await screen.findByTestId("suit-picker-popover");

    // Board vazio nesta pagina recem-carregada: os 4 combos suited de AKs
    // (um por naipe) estao todos disponiveis, sem card removal.
    const spadesKey = comboKey(card("As"), card("Ks"));
    const slider = screen.getByTestId(`suit-picker-slider-${spadesKey}`) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "30" } });

    // Fecha e reabre o popover: se a escrita chegou em heroRange, o slider
    // volta com o valor persistido em vez do default (100%).
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs")); // fecha
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs")); // reabre
    await screen.findByTestId("suit-picker-popover");

    await waitFor(() => {
      const reopened = screen.getByTestId(`suit-picker-slider-${spadesKey}`) as HTMLInputElement;
      expect(
        reopened.value,
        "o override de 30% no combo de espadas nao sobreviveu a reabertura do popover — " +
          "RangeLab.tsx nao esta escrevendo o onChange do popover de volta em heroRange",
      ).toBe("30");
    });
  });

  it("um preset de frequencia (50%) tambem se reflete na celula da matriz (opacidade proporcional)", async () => {
    await renderPage();
    const heroMatrix = screen.getByTestId("range-lab-hero-matrix");

    fireEvent.click(within(heroMatrix).getByTestId("range-cell-AKs"));
    fireEvent.click(within(heroMatrix).getByTestId("range-cell-naipes-AKs"));
    const popover = await screen.findByTestId("suit-picker-popover");

    fireEvent.click(within(popover).getByTestId("suit-picker-preset-50"));

    await waitFor(() => {
      const cell = within(heroMatrix).getByTestId("range-cell-AKs");
      // RangeMatrix.tsx ja aplica `opacity: 0.4 + entry.frequency * 0.6` quando
      // `frequency < 1` — 50% deveria virar 0.7.
      expect(cell.style.opacity).toBe("0.7");
    });
  });
});
