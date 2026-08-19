// F3b — os tres paineis ligados de verdade em /range-lab.
// Spec  : Docs/specs/range-lab/F3b-decisao.md (RF-03.2, RF-03.3, RF-03.4)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-13 o botao, D-F3-34 onde cada painel entra e o que aparece sem
//          resultado)
// Diagrama: Docs/architecture/diagrams/range-lab-f3b/paineis-fluxo-de-dados.mermaid
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Os quatro modulos puros podem estar todos verdes e a pagina continuar sem
// mostrar nada — o projeto ja pagou uma vez por unit verde com zero integracao
// (memory/session_2026-04-27-tts-wiring: quebrado em producao). Aqui se trava
// APENAS a fiacao:
//   1. onde cada painel mora (D-F3-34: MDF e cascata no centro, bloqueador na
//      direita, acima das categorias);
//   2. o que aparece SEM resultado — e o MdfPanel e o caso interessante, porque
//      as tres porcentagens nao dependem do motor;
//   3. o portao: nenhum dos tres aparece antes de o jogador ter posto algum range;
//   4. o delta automatico no river contra o botao fora dele (D-F3-13).
//
// LICOES: #14/#26/#38 (SO `await import`), #28 (vi.mock casa o caminho EXATO —
// a pagina PRECISA importar de `@/hooks/useRangeEngine`), #29
// (QueryClientProvider em volta), #2 (data-testid), #27 (userEvent).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// ── resultado de mentira com o shape REAL do motor (licao #3) ──

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

function villainCombo(a: any, b: any, equity: number | null, pairMass = 9) {
  return {
    combo: [a, b],
    weight: 1,
    pairMass: equity === null ? 0 : pairMass,
    equity,
    confidenceHalfWidth: null,
    sampleCount: null,
    degradedReason: equity === null ? "no_valid_villain_combo" : null,
  };
}

/** Heroi de MAO UNICA (`As Kd`) — o unico modo em que o bloqueador existe. */
function okExact(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    mode: "exact",
    seed: null,
    samples: null,
    heroRangeEquity: 0.5,
    villainRangeEquity: 0.5,
    requiredEquity: 0.25,
    evCall: 11.2,
    decision: "call",
    confidence: null,
    perHeroCombo: [heroCombo(CARD(14, "s"), CARD(13, "d"), 0.5)],
    perVillainCombo: [
      villainCombo(CARD(12, "h"), CARD(12, "d"), 0),
      villainCombo(CARD(7, "h"), CARD(7, "s"), 1),
      villainCombo(CARD(14, "d"), CARD(13, "h"), 0.5),
      // bloqueado pelo As do heroi — chega em `perVillainCombo` com pairMass 0
      villainCombo(CARD(14, "s"), CARD(12, "s"), null),
    ],
    callThresholdIndex: 1,
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

/** Pinta uma classe no range do oponente — o portao dos tres paineis. */
async function pintarRangeDoVilao(user: ReturnType<typeof userEvent.setup>) {
  const matriz = screen.getByTestId("range-lab-villain-matrix");
  await user.click(within(matriz).getByTestId("range-cell-AA"));
}

async function montarFlop(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("board-card-9c"));
  await user.click(screen.getByTestId("board-card-8c"));
  await user.click(screen.getByTestId("board-card-2h"));
}

/**
 * Turn e river escolhidos para NAO colidir com a mao do heroi (`As Kd`) nem com
 * nenhum combo do range de mentira: um bordo que repete carta da mao seria um
 * estado impossivel e o teste passaria a medir outra coisa.
 */
async function montarRiver(user: ReturnType<typeof userEvent.setup>) {
  await montarFlop(user);
  await user.click(screen.getByTestId("board-card-Td"));
  await user.click(screen.getByTestId("board-card-3s"));
}

/** true quando `a` vem ANTES de `b` no documento. */
function vemAntes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useRangeEngineMock.mockReturnValue(engineState());
});

// ── o portao ─────────────────────────────────────────────────

describe("F3b D-F3-34 — nenhum dos tres aparece antes de haver algum range", () => {
  it("pagina recem-aberta nao mostra nada; com range mostra; e o Limpar tudo desfaz", async () => {
    // O portao e o mesmo de hoje: o painel de leitura ja tem a sua mensagem de
    // estado e ela continua valendo. As tres assercoes juntas num teste so de
    // proposito — a ausencia sozinha e verdade numa arvore em que nada foi
    // ligado, e passaria em verde sem nada existir.
    const user = userEvent.setup();
    await renderPage();
    expect(screen.queryByTestId("range-lab-mdf-panel")).toBeNull();
    expect(screen.queryByTestId("range-lab-cascade")).toBeNull();
    expect(screen.queryByTestId("range-lab-blocker-panel")).toBeNull();

    await pintarRangeDoVilao(user);
    expect(screen.getByTestId("range-lab-mdf-panel")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-cascade")).toBeInTheDocument();

    await user.click(screen.getByTestId("range-lab-reset"));
    expect(
      screen.queryByTestId("range-lab-mdf-panel"),
      "o Limpar tudo apagou o range mas deixou o cartao de MDF na tela",
    ).toBeNull();
    expect(screen.queryByTestId("range-lab-cascade")).toBeNull();
  });
});

// ── onde cada painel mora ────────────────────────────────────

describe("F3b D-F3-34 — cada painel entra na secao que responde a pergunta dele", () => {
  it("MdfPanel e CascadeBar ficam no painel do centro (bordo + veredito)", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);

    const centro = screen.getByTestId("range-lab-panel-board");
    expect(
      within(centro).getByTestId("range-lab-mdf-panel"),
      "o MDF le pote e call, que sao os campos do proprio painel",
    ).toBeInTheDocument();
    expect(
      within(centro).getByTestId("range-lab-cascade"),
      "a cascata explica o numero do VerdictPanel, que esta logo acima",
    ).toBeInTheDocument();
  });

  it("a ordem no centro e veredito, depois MDF, depois cascata", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    const veredito = screen.getByTestId("range-lab-verdict-banner");
    const mdf = screen.getByTestId("range-lab-mdf-panel");
    const cascata = screen.getByTestId("range-lab-cascade");
    expect(vemAntes(veredito, mdf), "o MDF subiu acima do veredito").toBe(true);
    expect(vemAntes(mdf, cascata), "a cascata subiu acima do MDF").toBe(true);
  });

  it("BlockerPanel fica na direita, ACIMA do painel de categorias", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    const leitura = screen.getByTestId("range-lab-panel-read");
    const bloqueador = within(leitura).getByTestId("range-lab-blocker-panel");
    const categorias = within(leitura).getByTestId("range-lab-category-panel");
    expect(
      vemAntes(bloqueador, categorias),
      "o bloqueador fala do range do vilao carta a carta; as categorias detalham em seguida",
    ).toBe(true);
  });
});

// ── degradacao painel a painel ───────────────────────────────

describe("F3b D-F3-34 — o que cada painel faz quando nao ha corrida", () => {
  it("sem resultado, o MdfPanel continua respondendo as tres perguntas", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(engineState({ result: null }));
    await renderPage();
    await pintarRangeDoVilao(user);

    const mdf = screen.getByTestId("range-lab-mdf-panel");
    expect(within(mdf).getByTestId("range-lab-mdf-line-hero")).toBeInTheDocument();
    expect(within(mdf).getByTestId("range-lab-mdf-line-defense")).toBeInTheDocument();
    expect(within(mdf).getByTestId("range-lab-mdf-line-mdf")).toBeInTheDocument();
    expect(
      within(mdf).queryByTestId("range-lab-mdf-balance"),
      "o bloco de value/blefe nao pode existir sem a corrida",
    ).toBeNull();
  });

  it("sem resultado, a cascata mostra os degraus locais e marca os dois ultimos", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(engineState({ result: null }));
    await renderPage();
    await pintarRangeDoVilao(user);

    for (const id of ["nominal", "declared", "after_board_removal"]) {
      expect(
        screen.getByTestId(`range-lab-cascade-step-${id}`).getAttribute("data-status"),
        `degrau ${id} deveria existir sem o motor`,
      ).toBe("ok");
    }
    for (const id of ["after_mutual_removal", "loses_to_hero"]) {
      expect(screen.getByTestId(`range-lab-cascade-step-${id}`).getAttribute("data-status")).toBe(
        "unavailable",
      );
    }
  });

  it("resultado degradado nao apaga a cascata local", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: {
          status: "degraded",
          reason: "empty_hero_range",
          mode: "exact",
          requiredEquity: 0.25,
        },
      }),
    );
    await renderPage();
    await pintarRangeDoVilao(user);

    expect(screen.getByTestId("range-lab-cascade-step-declared").getAttribute("data-status")).toBe(
      "ok",
    );
    expect(
      screen.getByTestId("range-lab-cascade-step-after_mutual_removal").getAttribute("data-status"),
    ).toBe("unavailable");
  });
});

// ── o bloqueador em modo range ───────────────────────────────

describe("F3b criterio 5 — com heroi como range o bloqueador desabilita e diz por que", () => {
  it("dois combos do heroi: o painel mostra o motivo e nenhum numero de bloqueio", async () => {
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: okExact({
          perHeroCombo: [
            heroCombo(CARD(14, "s"), CARD(13, "d"), 0.5),
            heroCombo(CARD(12, "c"), CARD(11, "c"), 0.4),
          ],
        }),
      }),
    );
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    const bloqueador = screen.getByTestId("range-lab-blocker-panel");
    expect(within(bloqueador).getByTestId("range-lab-blocker-unavailable")).toBeInTheDocument();
    expect(within(bloqueador).queryByTestId("range-lab-blocker-card-0")).toBeNull();
    expect(within(bloqueador).queryByTestId("range-lab-blocker-delta")).toBeNull();
  });

  it("o painel le o resultado, nao o toggle 'Meu range' da tela", async () => {
    // Com "Minha mao" selecionado o jogador ainda pode pintar `AKs` e ter varios
    // combos. Quem manda e `perHeroCombo`.
    const user = userEvent.setup();
    useRangeEngineMock.mockReturnValue(
      engineState({
        result: okExact({
          perHeroCombo: [
            heroCombo(CARD(14, "s"), CARD(13, "s"), 0.5),
            heroCombo(CARD(14, "h"), CARD(13, "h"), 0.5),
          ],
        }),
      }),
    );
    await renderPage();
    await user.click(screen.getByTestId("range-lab-hero-mode-hand"));
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    expect(screen.getByTestId("range-lab-blocker-unavailable")).toBeInTheDocument();
  });
});

// ── o botao da D-F3-13 ───────────────────────────────────────

describe("F3b D-F3-13 — no river o efeito sai sozinho; fora dele, so sob o botao", () => {
  it("no flop, o painel oferece o botao 'calcular efeito'", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    expect(
      screen.getByTestId("range-lab-blocker-compute-delta"),
      "duas enumeracoes escondidas atras de cada tecla matariam a pagina",
    ).toBeInTheDocument();
  });

  it("clicar no botao faz o efeito aparecer", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarFlop(user);

    await user.click(screen.getByTestId("range-lab-blocker-compute-delta"));
    expect(screen.getByTestId("range-lab-blocker-delta")).toBeInTheDocument();
  });

  it("no river o efeito ja vem pronto, sem botao", async () => {
    const user = userEvent.setup();
    await renderPage();
    await pintarRangeDoVilao(user);
    await montarRiver(user);

    expect(screen.getByTestId("range-lab-blocker-delta")).toBeInTheDocument();
    expect(
      screen.queryByTestId("range-lab-blocker-compute-delta"),
      "no river a conta e analitica e barata: botao seria atrito sem motivo",
    ).toBeNull();
  });
});
