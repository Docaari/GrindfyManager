// F1 / RF-01.5 — wiring da pagina /range-lab.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.5)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-10)
//
// A superficie e a unica parte da F1 que NAO tem oraculo: nao ha golden test,
// nao ha avaliador antigo para comparar. A F0 fechou com a pendencia declarada
// de "zero teste de wiring" e o projeto ja pagou por isso uma vez
// (memory/session_2026-04-27-tts-wiring: unit verde, zero integracao, quebrado
// em producao). Este arquivo e a divida sendo paga na F1.
//
// Contrato assumido (o implementer cria exatamente isto):
//   client/src/pages/RangeLab.tsx            — default export
//   client/src/hooks/useRangeEngine.ts       — `useRangeEngine(spot, options?)`
//     devolve { result: EngineResult | null; progress: number; running: boolean;
//               cancel(): void }
//   data-testid: range-lab-page,
//                range-lab-panel-range | range-lab-panel-board | range-lab-panel-read,
//                range-lab-hero-mode-hand | range-lab-hero-mode-range,
//                range-lab-call-threshold, range-lab-reset,
//                board-card-<cardKey>  (ex.: board-card-Ah)
//
// LICOES aplicadas: #14/#26/#38 (SO `await import`, nunca `require`, e nunca os
// dois no mesmo arquivo), #28 (vi.mock casa o caminho EXATO do import — a pagina
// PRECISA importar de `@/hooks/useRangeEngine`), #29 (QueryClientProvider em
// volta), #2 (data-testid estavel), #27 (userEvent.click cobre Radix, que reage
// a mousedown).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// ── resultados de mentira, com o shape REAL do motor (licao #3) ──

const CARD = (rank: number, suit: string) => ({ rank, suit }) as any;

function heroCombo(overrides: Record<string, unknown> = {}) {
  return {
    combo: [CARD(14, "s"), CARD(6, "s")],
    weight: 1,
    pairMass: 11,
    equity: 0.725849403122,
    evCall: 22.419885215794,
    decision: "call",
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: null,
    ...overrides,
  };
}

function okExact(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    mode: "exact",
    seed: null,
    samples: null,
    heroRangeEquity: 0.725849403122,
    requiredEquity: 0.276553106212,
    evCall: 22.419885215794,
    decision: "call",
    confidence: null,
    perHeroCombo: [heroCombo()],
    callThresholdIndex: 1,
    runoutsPerPair: 990,
    totalShowdowns: 10_890,
    emptyHeroEntries: [],
    emptyVillainEntries: [],
    ...overrides,
  };
}

function engineState(overrides: Record<string, unknown> = {}) {
  return {
    result: okExact(),
    progress: 1,
    running: false,
    cancel: vi.fn(),
    ...overrides,
  };
}

/** Ultimo spot que a pagina mandou para o motor. */
function lastSpot(): any {
  const calls = useRangeEngineMock.mock.calls;
  if (calls.length === 0) throw new Error("a pagina nunca chamou useRangeEngine");
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRangeEngineMock.mockReturnValue(engineState());
});

// ── layout de tres paineis ───────────────────────────────────

describe("F1 RF-01.5 — /range-lab tem tres paineis", () => {
  it("renderiza a pagina", async () => {
    await renderPage();
    expect(screen.getByTestId("range-lab-page")).toBeInTheDocument();
  });

  it("mostra o painel de range, o de bordo e o de leitura", async () => {
    await renderPage();
    expect(screen.getByTestId("range-lab-panel-range")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-panel-board")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-panel-read")).toBeInTheDocument();
  });

  it("o painel de leitura existe mesmo vazio (a F3 o preenche)", async () => {
    await renderPage();
    const leitura = screen.getByTestId("range-lab-panel-read");
    expect(leitura).toBeInTheDocument();
  });
});

// ── Minha mao / Meu range ────────────────────────────────────

describe("F1 RF-01.2 — 'Minha mao' e 'Meu range' produzem os dois heroRange", () => {
  it("o motor sempre recebe heroRange, nunca um campo `hero`", async () => {
    const user = userEvent.setup();
    await renderPage();

    const noModoMao = lastSpot();
    expect(Array.isArray(noModoMao.heroRange), "modo mao: heroRange nao e array").toBe(true);
    expect(
      noModoMao.hero,
      "um campo `hero` separado significa dois caminhos de codigo (RF-01.2 proibe)",
    ).toBeUndefined();

    await user.click(screen.getByTestId("range-lab-hero-mode-range"));

    const noModoRange = lastSpot();
    expect(Array.isArray(noModoRange.heroRange), "modo range: heroRange nao e array").toBe(true);
    expect(noModoRange.hero).toBeUndefined();
  });

  it("os dois botoes de modo estao visiveis", async () => {
    await renderPage();
    expect(screen.getByTestId("range-lab-hero-mode-hand")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-hero-mode-range")).toBeInTheDocument();
  });

  it("a contagem 'quantas das minhas maos pagam' aparece no modo range", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: okExact({
          callThresholdIndex: 3,
          perHeroCombo: [heroCombo(), heroCombo(), heroCombo(), heroCombo()],
        }),
      }),
    );
    await renderPage();

    expect(
      screen.queryByTestId("range-lab-call-threshold"),
      "no modo 'Minha mao' a contagem nao tem o que contar",
    ).toBeNull();

    await user.click(screen.getByTestId("range-lab-hero-mode-range"));

    const contagem = screen.getByTestId("range-lab-call-threshold");
    expect(contagem).toBeInTheDocument();
    expect(contagem.textContent, "a contagem precisa mostrar o numero 3").toMatch(/3/);
  });
});

// ── degradado nunca vira FOLD de 0% ──────────────────────────

describe("F1 D-F1-8 — resultado degradado vira empty state, nao banner vermelho", () => {
  for (const reason of ["empty_hero_range", "empty_villain_range", "no_valid_pairs"] as const) {
    it(`${reason}: mostra empty state e nenhum veredito`, async () => {
      useRangeEngineMock.mockReturnValue(
        engineState({
          result: {
            status: "degraded",
            reason,
            mode: "exact",
            requiredEquity: 0.276553106212,
          },
        }),
      );
      await renderPage();

      expect(screen.getByTestId("range-lab-empty-state")).toBeInTheDocument();
      expect(
        screen.queryByTestId("range-lab-verdict-banner"),
        `${reason}: o banner de veredito apareceu com um resultado degradado`,
      ).toBeNull();
      expect(
        screen.queryByText(/fold/i),
        `${reason}: FOLD com massa zero e o "-13,8 fichas" fantasma voltando`,
      ).toBeNull();
      expect(screen.queryByText(/0[.,]0\s*%/)).toBeNull();
    });
  }

  it("sem resultado ainda (primeira renderizacao) tambem nao inventa veredito", async () => {
    useRangeEngineMock.mockReturnValue(engineState({ result: null, running: true, progress: 0.4 }));
    await renderPage();
    expect(screen.queryByTestId("range-lab-verdict-banner")).toBeNull();
    expect(screen.queryByText(/fold/i)).toBeNull();
  });
});

// ── Monte Carlo nunca aparece sem margem ─────────────────────

describe("F1 criterio 4 — numero de Monte Carlo nunca aparece sozinho", () => {
  it("a margem de erro esta DENTRO do bloco do numero", async () => {
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: okExact({
          mode: "monte_carlo",
          seed: 20240815,
          samples: 15_000,
          confidence: { level: 0.95, halfWidth: 0.0071 },
          perHeroCombo: [heroCombo({ confidenceHalfWidth: 0.0071, sampleCount: 15_000 })],
        }),
      }),
    );
    await renderPage();

    const bloco = screen.getByTestId("range-lab-equity");
    // A margem tem que ser FILHA do bloco do numero: assim, renderizar so o
    // numero (em qualquer outro lugar da tela) falha aqui.
    const margem = within(bloco).getByTestId("range-lab-mc-margin");
    expect(margem).toBeInTheDocument();
    expect(
      margem.textContent,
      `a margem "${margem.textContent}" precisa mostrar um numero`,
    ).toMatch(/\d/);
    expect(bloco.textContent, "o bloco precisa mostrar a equity").toMatch(/\d/);
  });

  it("no modo exato nao ha margem nenhuma na tela", async () => {
    await renderPage();
    expect(screen.getByTestId("range-lab-equity")).toBeInTheDocument();
    expect(
      screen.queryByTestId("range-lab-mc-margin"),
      "exato com margem sugere incerteza que nao existe",
    ).toBeNull();
  });
});

// ── Reset (emenda A19) ───────────────────────────────────────

describe("F1 A19 — Reset limpa tudo e avisa ANTES do clique", () => {
  it("o tooltip diz o que sera apagado antes de qualquer clique", async () => {
    await renderPage();
    const botao = screen.getByTestId("range-lab-reset");
    const aviso = (botao.getAttribute("title") ?? "").toLowerCase();
    expect(
      aviso,
      `o botao Reset precisa de um atributo title descrevendo a acao destrutiva; veio "${aviso}"`,
    ).not.toBe("");
    for (const termo of ["range", "bordo", "filtro"]) {
      expect(aviso, `o aviso "${aviso}" nao menciona "${termo}"`).toContain(termo);
    }
  });

  it("clicar limpa bordo e ranges", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByTestId("board-card-Ad"));
    await user.click(screen.getByTestId("board-card-8h"));
    await user.click(screen.getByTestId("board-card-4h"));
    expect(lastSpot().board, "os tres cliques deveriam montar o flop").toHaveLength(3);

    await user.click(screen.getByTestId("range-lab-reset"));

    const depois = lastSpot();
    expect(depois.board, "o Reset nao limpou o bordo").toHaveLength(0);
    expect(depois.heroRange, "o Reset nao limpou o range do heroi").toHaveLength(0);
    expect(depois.villainRange, "o Reset nao limpou o range do vilao").toHaveLength(0);
  });
});
