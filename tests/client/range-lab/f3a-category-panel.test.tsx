// F3a / RF-03.1 + RF-03.7 — o painel de leitura: dois blocos, dois rodapes,
// um seletor de lado e o filtro que pinta a matriz.
// Spec  : Docs/specs/range-lab/F3a-leitura-categorias.md (criterios 1, 6 e "A tela")
// Porque: Docs/specs/range-lab/F3-detalhamento.md (secoes 4.3 e 5)
// ADR   : Docs/architecture/decisions/248-...-f3a-leitura-categorias.md
//         (D-F3-1, D-F3-4, D-F3-18/D-F3-22)
//
// DUAS REGRAS DE PRODUTO QUE ESTE PAINEL CARREGA SOZINHO
//
// 1. A frase entre parenteses no cabecalho do bloco de draws — "um combo pode
//    aparecer em mais de uma linha, nao somam 100%" — e REQUISITO, nao decoracao.
//    O tipo protege o codigo; essa frase e a unica coisa que impede o jogador de
//    somar as duas colunas com os olhos.
// 2. A leitura e a equity chegam por CAMINHOS DIFERENTES (D-F3-1): a classificacao
//    e local e instantanea, a equity vem da corrida. "Categoria com contagem e
//    massa, coluna de equity em branco" e estado LEGITIMO, e nao erro.
//
// Contrato assumido (o implementer cria exatamente isto):
//   client/src/components/range-lab/CategoryPanel.tsx
//   <CategoryPanel board side onSideChange filter onFilterChange
//                  heroCombos villainCombos />
//   client/src/components/range-lab/BoardTextureLine.tsx
//   <BoardTextureLine board={Card[]} />
//
// LICOES: #14/#26/#38 (SO `await import`, nunca `require`, e nunca os dois no
// mesmo arquivo), #2 (data-testid estavel), #27 (userEvent cobre mousedown).
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const PANEL_PATH = "../../../client/src/components/range-lab/CategoryPanel";
const TEXTURE_PATH = "../../../client/src/components/range-lab/BoardTextureLine";

async function loadPanel() {
  const mod: any = await import(/* @vite-ignore */ PANEL_PATH);
  return mod.CategoryPanel ?? mod.default;
}

async function loadTexture() {
  const mod: any = await import(/* @vite-ignore */ TEXTURE_PATH);
  return mod.BoardTextureLine ?? mod.default;
}

// ── dados de mentira com o shape REAL (licao #3) ─────────────

const CARD = (rank: number, suit: string) => ({ rank, suit }) as any;

/** Flop `9c 8c 2h`: 2 paus na mesa, entao combos de paus pegam flush draw. */
const BOARD = [CARD(9, "c"), CARD(8, "c"), CARD(2, "h")];
/** River `K Q 9 7 3`: nenhum draw pode existir (D-F3-5). */
const RIVER = [CARD(13, "h"), CARD(12, "c"), CARD(9, "d"), CARD(7, "s"), CARD(3, "c")];

function readCombo(a: any, b: any, weight: number, equity: number | null) {
  return { combo: [a, b], weight, equity };
}

/** Range do vilao: top par, flush draw nut, overcards e um par de bolso. */
const VILLAIN_COMBOS = [
  readCombo(CARD(14, "c"), CARD(13, "c"), 1, 0.62), // fd_nut + overcards2 (ace_high)
  readCombo(CARD(14, "d"), CARD(9, "s"), 1, 0.71), // top par, kicker A
  readCombo(CARD(12, "d"), CARD(9, "s"), 0.5, 0.55), // top par, kicker Q
  readCombo(CARD(11, "d"), CARD(11, "s"), 1, 0.8), // overpair
  readCombo(CARD(5, "d"), CARD(4, "s"), 0.25, 0.18), // no_pair
];

/** Range do heroi: deliberadamente com OUTRO tamanho, para o seletor de lado ser visivel. */
const HERO_COMBOS = [
  readCombo(CARD(14, "s"), CARD(9, "h"), 1, 0.68), // top par
  readCombo(CARD(13, "s"), CARD(13, "d"), 1, 0.77), // overpair
];

function emptyFilter() {
  return { made: new Set<string>(), draws: new Set<string>() } as any;
}

/**
 * Harness controlado: `side` e `filter` sao estado do DONO (a pagina), porque o
 * `highlight` precisa chegar na matriz que vive fora deste painel. O harness so
 * fecha o ciclo para o teste conseguir clicar.
 */
function Harness({ Panel, board = BOARD, initialSide = "villain" as "hero" | "villain" }: any) {
  const [side, setSide] = React.useState<"hero" | "villain">(initialSide);
  const [filter, setFilter] = React.useState<any>(emptyFilter());
  return (
    <Panel
      board={board}
      heroCombos={HERO_COMBOS}
      villainCombos={VILLAIN_COMBOS}
      side={side}
      onSideChange={setSide}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}

async function renderPanel(props: Record<string, unknown> = {}) {
  const Panel = await loadPanel();
  return render(<Harness Panel={Panel} {...props} />);
}

// ── estrutura: dois blocos separados ─────────────────────────

describe("F3a RF-03.1 — o painel tem dois blocos com rodapes diferentes", () => {
  it("renderiza o bloco de maos feitas e o bloco de draws", async () => {
    await renderPanel();
    expect(screen.getByTestId("range-lab-category-panel")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-made-block")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-draws-block")).toBeInTheDocument();
  });

  it("uma linha de mao feita traz contagem, massa e equity JUNTAS (emenda A17)", async () => {
    await renderPanel();
    const linha = screen.getByTestId("range-lab-made-row-top_pair");
    expect(within(linha).getByTestId("range-lab-made-row-top_pair-combos").textContent).toMatch(/\d/);
    expect(within(linha).getByTestId("range-lab-made-row-top_pair-mass").textContent).toMatch(/\d/);
    expect(within(linha).getByTestId("range-lab-made-row-top_pair-equity").textContent).toMatch(/\d/);
  });

  it("categoria ausente do range nao ganha linha na tela", async () => {
    await renderPanel();
    expect(
      screen.queryByTestId("range-lab-made-row-quads"),
      "linha zerada polui o painel e some com a linha que importa",
    ).toBeNull();
  });

  it("o rodape do bloco de maos feitas fecha em 100% do range", async () => {
    await renderPanel();
    const total = screen.getByTestId("range-lab-made-total");
    expect(total.textContent).toMatch(/100\s*%/);
  });
});

// ── a frase que impede a soma com os olhos ───────────────────

describe("F3a D-F3-4 — o aviso de sobreposicao e requisito, nao decoracao", () => {
  it("o cabecalho do bloco de draws diz que um combo aparece em mais de uma linha", async () => {
    await renderPanel();
    const aviso = screen.getByTestId("range-lab-draws-overlap-notice");
    const texto = (aviso.textContent ?? "").toLowerCase();
    expect(texto, `veio "${texto}"`).toMatch(/mais de uma linha/);
    expect(
      texto,
      "sem a frase 'nao somam 100%' o jogador soma as duas colunas com os olhos",
    ).toMatch(/n[ãa]o somam 100/);
  });

  it("o rodape do bloco de draws conta 'combos com pelo menos um draw', nunca uma porcentagem do range", async () => {
    await renderPanel();
    const rodape = screen.getByTestId("range-lab-draws-total");
    const texto = (rodape.textContent ?? "").toLowerCase();
    expect(texto).toMatch(/pelo menos um/);
    expect(texto).toMatch(/\d/);
    expect(
      texto,
      "'100% do range' no bloco de draws afirma uma particao que nao existe",
    ).not.toMatch(/100\s*%/);
  });

  it("no river o bloco de draws aparece vazio, e nao some da tela", async () => {
    await renderPanel({ board: RIVER });
    const bloco = screen.getByTestId("range-lab-draws-block");
    expect(bloco, "sumir o bloco esconde a informacao de que nao HA draw").toBeInTheDocument();
    expect(within(bloco).queryByTestId("range-lab-draw-row-fd")).toBeNull();
    expect(screen.getByTestId("range-lab-draws-total").textContent).toMatch(/0/);
  });
});

// ── equity ausente nunca vira 0% (D-F3-1 + regra da frente) ──

describe("F3a — categoria sem equity mostra travessao, nunca 0%", () => {
  it("a coluna de equity fica em branco enquanto a corrida nao chegou", async () => {
    const Panel = await loadPanel();
    render(
      <Panel
        board={BOARD}
        heroCombos={HERO_COMBOS.map((c) => ({ ...c, equity: null }))}
        villainCombos={VILLAIN_COMBOS.map((c) => ({ ...c, equity: null }))}
        side="villain"
        onSideChange={() => {}}
        filter={emptyFilter()}
        onFilterChange={() => {}}
      />,
    );

    const linha = screen.getByTestId("range-lab-made-row-top_pair");
    expect(
      within(linha).getByTestId("range-lab-made-row-top_pair-combos").textContent,
      "contagem e massa sao LOCAIS: elas nao dependem da corrida",
    ).toMatch(/\d/);
    expect(
      within(linha).getByTestId("range-lab-made-row-top_pair-equity").textContent,
      "'categoria com contagem e massa, equity em branco' e estado legitimo (D-F3-1)",
    ).toContain("—");
    expect(screen.queryByText(/^0[.,]0\s*%$/)).toBeNull();
  });
});

// ── seletor de lado (D-F3-18 / D-F3-22) ──────────────────────

describe("F3a D-F3-22 — o painel serve OS DOIS LADOS, com botao heroi / vilao", () => {
  it("os dois botoes existem e o lado ativo fica marcado", async () => {
    await renderPanel();
    const vilao = screen.getByTestId("range-lab-category-side-villain");
    const heroi = screen.getByTestId("range-lab-category-side-hero");
    expect(vilao).toBeInTheDocument();
    expect(heroi).toBeInTheDocument();
    expect(vilao.getAttribute("aria-pressed")).toBe("true");
    expect(heroi.getAttribute("aria-pressed")).toBe("false");
  });

  it("trocar de lado troca o RANGE agrupado, nao so o rotulo", async () => {
    const user = userEvent.setup();
    await renderPanel();

    // Range do vilao: 5 combos, com no_pair entre eles. Range do heroi: 2, sem.
    expect(screen.getByTestId("range-lab-made-row-no_pair")).toBeInTheDocument();

    await user.click(screen.getByTestId("range-lab-category-side-hero"));

    expect(
      screen.queryByTestId("range-lab-made-row-no_pair"),
      "o range do heroi nao tem no_pair: o painel continuou agrupando o vilao",
    ).toBeNull();
    expect(screen.getByTestId("range-lab-made-row-overpair")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-category-side-hero").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

// ── filtro (criterio 6 / RF-03.7) ────────────────────────────

describe("F3a criterio 6 — o filtro marca categoria e o rodape conta combos", () => {
  it("marcar 'flush draw' muda o rodape de combos que passam", async () => {
    const user = userEvent.setup();
    await renderPanel();

    const rodape = screen.getByTestId("range-lab-filter-footer");
    const antes = screen.getByTestId("range-lab-filter-passing").textContent;

    await user.click(screen.getByTestId("range-lab-filter-draw-fd_nut"));

    expect(rodape).toBeInTheDocument();
    expect(
      screen.getByTestId("range-lab-filter-passing").textContent,
      `rodape nao mudou (${antes}): o filtro nao chegou na contagem`,
    ).not.toBe(antes);
    expect(screen.getByTestId("range-lab-filter-total").textContent).toMatch(/\d/);
  });

  it("sem nenhum filtro marcado, os combos que passam sao TODOS", async () => {
    await renderPanel();
    const passam = screen.getByTestId("range-lab-filter-passing").textContent ?? "";
    const total = screen.getByTestId("range-lab-filter-total").textContent ?? "";
    expect(
      passam.replace(/\D/g, ""),
      "filtro vazio significa 'sem restricao', nao 'nada selecionado'",
    ).toBe(total.replace(/\D/g, ""));
  });

  it("'desmarcar tudo' volta ao estado de tudo aceso", async () => {
    const user = userEvent.setup();
    await renderPanel();

    const total = (screen.getByTestId("range-lab-filter-total").textContent ?? "").replace(/\D/g, "");
    await user.click(screen.getByTestId("range-lab-filter-draw-fd_nut"));
    expect(screen.getByTestId("range-lab-filter-passing").textContent?.replace(/\D/g, "")).not.toBe(
      total,
    );

    await user.click(screen.getByTestId("range-lab-filter-clear-all"));
    expect(screen.getByTestId("range-lab-filter-passing").textContent?.replace(/\D/g, "")).toBe(
      total,
    );
  });

  it("'marcar tudo' existe e nao apaga a matriz", async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByTestId("range-lab-filter-select-all"));
    expect(
      Number(screen.getByTestId("range-lab-filter-passing").textContent?.replace(/\D/g, "")),
      "marcar tudo com E entre grupos nao pode zerar a tela",
    ).toBeGreaterThan(0);
  });

  it("o filtro NAO filtra a tabela: as linhas de categoria continuam todas la", async () => {
    const user = userEvent.setup();
    await renderPanel();
    const antes = screen.getAllByTestId(/^range-lab-made-row-[a-z_]+$/).length;
    await user.click(screen.getByTestId("range-lab-filter-draw-fd_nut"));
    expect(
      screen.getAllByTestId(/^range-lab-made-row-[a-z_]+$/).length,
      "marcar categoria esmaece a MATRIZ; a tabela nao encolhe (emenda A16)",
    ).toBe(antes);
  });
});

// ── textura do bordo (emenda A15) ────────────────────────────

describe("F3a A15 — BoardTextureLine sai numa linha so, com as duas dimensoes", () => {
  it("declara naipe e pareamento", async () => {
    const Texture = await loadTexture();
    render(<Texture board={BOARD} />);
    const linha = screen.getByTestId("range-lab-board-texture");
    const texto = (linha.textContent ?? "").toLowerCase();
    expect(texto, `veio "${texto}"`).toMatch(/naipe|flush|rainbow|monotone/);
    expect(texto).toMatch(/pareado|par|unpaired/);
  });

  it("bordo pareado e bordo sem par nao produzem o mesmo texto", async () => {
    const Texture = await loadTexture();
    const { unmount } = render(<Texture board={BOARD} />);
    const semPar = screen.getByTestId("range-lab-board-texture").textContent;
    unmount();

    render(<Texture board={[CARD(12, "h"), CARD(7, "s"), CARD(7, "d")]} />);
    expect(
      screen.getByTestId("range-lab-board-texture").textContent,
      "a linha de textura precisa reagir ao bordo",
    ).not.toBe(semPar);
  });

  it("bordo incompleto nao quebra a linha nem inventa textura", async () => {
    const Texture = await loadTexture();
    expect(() => render(<Texture board={[]} />)).not.toThrow();
  });
});
