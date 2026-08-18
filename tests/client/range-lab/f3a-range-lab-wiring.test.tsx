// F3a — o painel de leitura ligado de verdade em /range-lab.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (RF-03.1, RF-03.7, RF-03.8)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (D-F3-18/D-F3-22 seletor de lado; Consequencias: "o Reset passa a
//          limpar tambem os filtros")
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O terceiro painel esta vazio desde a F1 e a superficie e a unica parte da
// frente que NAO tem oraculo. O projeto ja pagou uma vez por unit verde com zero
// integracao (memory/session_2026-04-27-tts-wiring: quebrado em producao). Este
// arquivo e a divida sendo paga de novo, agora para a F3a.
//
// O que ele trava, e nada alem disso:
//   1. o painel de leitura mostra textura + categorias assim que ha bordo e resultado;
//   2. o seletor de lado decide QUAL MATRIZ o filtro pinta (D-F3-22);
//   3. o `Reset` limpa tambem os filtros — o `RESET_TITLE` promete isso desde a F1
//      e e esta frente que cumpre.
//
// LICOES: #14/#26/#38 (SO `await import`), #28 (vi.mock casa o caminho EXATO —
// a pagina PRECISA importar de `@/hooks/useRangeEngine`), #29
// (QueryClientProvider em volta), #2 (data-testid), #27 (userEvent).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { useRangeEngineMock } = vi.hoisted(() => ({ useRangeEngineMock: vi.fn() }));

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

// ── resultado de mentira com o shape REAL do motor da F3a (licao #3) ──

const CARD = (rank: number, suit: string) => ({ rank, suit }) as any;

function heroCombo(a: any, b: any, equity: number) {
  return {
    combo: [a, b],
    weight: 1,
    pairMass: 12,
    equity,
    evCall: equity * 50 - 13.8,
    decision: "call",
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: null,
  };
}

function villainCombo(a: any, b: any, equity: number) {
  return {
    combo: [a, b],
    weight: 1,
    pairMass: 9,
    equity,
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: null,
  };
}

function okExact(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    mode: "exact",
    seed: null,
    samples: null,
    heroRangeEquity: 0.58,
    villainRangeEquity: 0.42,
    requiredEquity: 0.276553106212,
    evCall: 15.2,
    decision: "call",
    confidence: null,
    perHeroCombo: [
      heroCombo(CARD(14, "s"), CARD(9, "h"), 0.68),
      heroCombo(CARD(13, "s"), CARD(13, "d"), 0.77),
    ],
    perVillainCombo: [
      villainCombo(CARD(14, "c"), CARD(13, "c"), 0.44), // fd_nut no flop 9c 8c 2h
      villainCombo(CARD(12, "d"), CARD(9, "s"), 0.51),
      villainCombo(CARD(11, "d"), CARD(11, "s"), 0.63),
      villainCombo(CARD(5, "d"), CARD(4, "s"), 0.19),
    ],
    callThresholdIndex: 2,
    runoutsPerPair: 990,
    totalShowdowns: 100_000,
    emptyHeroEntries: [],
    emptyVillainEntries: [],
    ...overrides,
  };
}

function engineState(overrides: Record<string, unknown> = {}) {
  return { result: okExact(), progress: 1, running: false, cancel: vi.fn(), ...overrides };
}

/** Monta o flop `9c 8c 2h` pela superficie real (BoardPicker), como o jogador faria. */
async function montarFlop(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("board-card-9c"));
  await user.click(screen.getByTestId("board-card-8c"));
  await user.click(screen.getByTestId("board-card-2h"));
}

function contagemQuePassa(): number {
  return Number(screen.getByTestId("range-lab-filter-passing").textContent?.replace(/\D/g, ""));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRangeEngineMock.mockReturnValue(engineState());
});

// ── 1. o painel de leitura sai do vazio ──────────────────────

describe("F3a RF-03.1 — o terceiro painel passa a responder 'de onde vem a equity'", () => {
  it("com bordo e resultado, mostra textura, categorias e a tabela por combo", async () => {
    const user = userEvent.setup();
    await renderPage();
    await montarFlop(user);

    const leitura = screen.getByTestId("range-lab-panel-read");
    expect(within(leitura).getByTestId("range-lab-board-texture")).toBeInTheDocument();
    expect(within(leitura).getByTestId("range-lab-category-panel")).toBeInTheDocument();
    expect(within(leitura).getByTestId("range-lab-combo-table")).toBeInTheDocument();
  });

  it("o texto de 'chega na proxima frente' deu lugar ao painel de verdade", async () => {
    const user = userEvent.setup();
    await renderPage();
    await montarFlop(user);

    // A presenca do painel vem ANTES da ausencia do placeholder: sozinha, a
    // ausencia ja e verdade hoje (o placeholder so aparece sem resultado), e o
    // teste passaria em verde sem nada ter sido ligado.
    expect(screen.getByTestId("range-lab-category-panel")).toBeInTheDocument();
    expect(
      screen.queryByText(/proxima frente|próxima frente/i),
      "o placeholder da F1 continua na tela: o painel nao foi ligado",
    ).toBeNull();
  });

  it("sem bordo montado, o painel nao inventa categoria nenhuma", async () => {
    await renderPage();
    expect(
      screen.queryByTestId("range-lab-category-panel"),
      "sem bordo nao ha mao feita: categoria aqui seria numero inventado",
    ).toBeNull();
  });

  it("resultado degradado nao produz painel de categorias com equity", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: {
          status: "degraded",
          reason: "empty_villain_range",
          mode: "exact",
          requiredEquity: 0.276553106212,
        },
      }),
    );
    await renderPage();
    await montarFlop(user);

    expect(screen.queryByText(/^0[.,]0\s*%$/)).toBeNull();
    expect(screen.queryByTestId("range-lab-combo-table-villain")).toBeNull();
  });
});

// ── 2. o seletor de lado decide QUAL matriz o filtro pinta ───

describe("F3a D-F3-22 — o lado ativo decide o range agrupado e a matriz pintada", () => {
  it("o padrao e o VILAO: a matriz do vilao recebe highlight, a do heroi nao", async () => {
    const user = userEvent.setup();
    await renderPage();
    await montarFlop(user);

    expect(screen.getByTestId("range-lab-category-side-villain").getAttribute("aria-pressed")).toBe(
      "true",
    );

    const celulaVilao = within(screen.getByTestId("range-lab-villain-matrix")).getByTestId(
      "range-cell-AKs",
    );
    const celulaHeroi = within(screen.getByTestId("range-lab-hero-matrix")).getByTestId(
      "range-cell-AKs",
    );
    expect(celulaVilao.getAttribute("data-highlighted")).not.toBeNull();
    expect(
      celulaHeroi.getAttribute("data-highlighted"),
      "as duas matrizes acesas ao mesmo tempo tornam o filtro ilegivel",
    ).toBeNull();
  });

  it("trocar para heroi inverte qual matriz recebe o highlight", async () => {
    const user = userEvent.setup();
    await renderPage();
    await montarFlop(user);
    await user.click(screen.getByTestId("range-lab-category-side-hero"));

    const celulaVilao = within(screen.getByTestId("range-lab-villain-matrix")).getByTestId(
      "range-cell-AKs",
    );
    const celulaHeroi = within(screen.getByTestId("range-lab-hero-matrix")).getByTestId(
      "range-cell-AKs",
    );
    expect(celulaHeroi.getAttribute("data-highlighted")).not.toBeNull();
    expect(celulaVilao.getAttribute("data-highlighted")).toBeNull();
  });
});

// ── 3. o Reset cumpre o que o RESET_TITLE promete desde a F1 ──

describe("F3a — o Reset limpa tambem os filtros", () => {
  it("o filtro marcado antes do Reset nao sobrevive a ele", async () => {
    const user = userEvent.setup();
    await renderPage();
    await montarFlop(user);

    const total = contagemQuePassa();
    await user.click(screen.getByTestId("range-lab-filter-draw-fd_nut"));
    expect(
      contagemQuePassa(),
      "premissa do caso: marcar um draw precisa reduzir a contagem",
    ).toBeLessThan(total);

    await user.click(screen.getByTestId("range-lab-reset"));
    await montarFlop(user);

    expect(
      contagemQuePassa(),
      "o filtro sobreviveu ao Reset — o tooltip promete limpar os filtros desde a F1",
    ).toBe(total);
  });

  it("o aviso do Reset continua mencionando os filtros antes do clique", async () => {
    await renderPage();
    const aviso = (screen.getByTestId("range-lab-reset").getAttribute("title") ?? "").toLowerCase();
    expect(aviso).toContain("filtro");
  });
});
