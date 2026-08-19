// F3b — os tres paineis novos, isolados: MdfPanel, CascadeBar e BlockerPanel.
// Spec  : Docs/specs/range-lab/F3b-decisao.md ("A tela (D-F3-16)", criterios 3 e 5)
// ADR   : Docs/architecture/decisions/249-range-lab-f3b-decisao.md
//         (D-F3-30 sem `if` no JSX, D-F3-32 copy fora do JSX, D-F3-34 degradacao)
//
// O QUE ESTE ARQUIVO VERIFICA — E O QUE ELE NAO VERIFICA
//
// Ele verifica FIACAO: que o componente renderiza o que a funcao pura devolveu,
// nos `data-testid` combinados, e que ele NAO decide nada por conta propria. A
// COPY em si e testada em `tests/unit/combo-calc/f3b-copy.test.ts`, sem DOM —
// cacar frase no DOM e o anti-padrao da licao #2, e e justamente para nao
// precisar disso que as frases nascem de funcao pura.
//
// CONTRATO dos componentes (o implementer cria exatamente isto):
//   <MdfPanel potCurrent={number} callAmount={number} balance={BluffBalance | null} />
//   <CascadeBar cascade={Cascade} />
//   <BlockerPanel availability={BlockerAvailability}
//                 report={BlockerReport | null}
//                 onComputeDelta={() => void} />
//
// testids:
//   range-lab-mdf-panel · -mdf-line-hero · -mdf-line-defense · -mdf-line-mdf
//   range-lab-mdf-balance · range-lab-mdf-action · range-lab-mdf-formula
//   range-lab-mdf-degraded
//   range-lab-cascade · range-lab-cascade-step-<id>  (data-status no elemento)
//   range-lab-blocker-panel · range-lab-blocker-unavailable
//   range-lab-blocker-card-0 · range-lab-blocker-card-1
//   range-lab-blocker-total · range-lab-blocker-overlap-note
//   range-lab-blocker-delta · range-lab-blocker-compute-delta
//
// LICOES: #14/#26/#38 (SO `await import`, nunca `require`, e nunca os dois no
// mesmo arquivo), #2 (data-testid estavel), #27 (userEvent cobre mousedown).
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const MDF_PATH = "../../../client/src/components/range-lab/MdfPanel";
const CASCADE_PATH = "../../../client/src/components/range-lab/CascadeBar";
const BLOCKER_PATH = "../../../client/src/components/range-lab/BlockerPanel";

async function loadMdfPanel() {
  const mod: any = await import(/* @vite-ignore */ MDF_PATH);
  return mod.MdfPanel ?? mod.default;
}

async function loadCascadeBar() {
  const mod: any = await import(/* @vite-ignore */ CASCADE_PATH);
  return mod.CascadeBar ?? mod.default;
}

async function loadBlockerPanel() {
  const mod: any = await import(/* @vite-ignore */ BLOCKER_PATH);
  return mod.BlockerPanel ?? mod.default;
}

// ── dados de mentira com o shape REAL (licao #3) ─────────────

const CARD = (rank: number, suit: string) => ({ rank, suit }) as any;

function balance(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    valueMass: 18,
    bluffMass: 4,
    chopMass: 0,
    unknownMass: 0,
    bluffsNeeded: 9,
    bluffGap: 5,
    verdict: "bluffs_missing",
    ...overrides,
  } as any;
}

function step(id: string, mass: number, combos: number | null, basis: string | null = null) {
  return { id, status: "ok", mass, combos, basis } as any;
}

function cascade(overrides: Record<string, unknown> = {}) {
  return {
    steps: [
      step("nominal", 1326, 1326),
      step("declared", 6, 6),
      step("after_board_removal", 6, 6),
      step("after_mutual_removal", 3, 3),
      step("loses_to_hero", 1, 1, "discrete"),
    ],
    basis: "discrete",
    blockedMass: 3,
    ...overrides,
  } as any;
}

function cascadeSemCorrida() {
  return cascade({
    steps: [
      step("nominal", 1326, 1326),
      step("declared", 6, 6),
      step("after_board_removal", 6, 6),
      { id: "after_mutual_removal", status: "unavailable", reason: "no_result" },
      { id: "loses_to_hero", status: "unavailable", reason: "no_result" },
    ],
    basis: null,
    blockedMass: null,
  });
}

function split(overrides: Record<string, unknown> = {}) {
  return {
    method: "showdown_now",
    basis: "discrete",
    value: { combos: 0, mass: 0 },
    bluff: { combos: 1, mass: 1 },
    chop: { combos: 1, mass: 1 },
    unknown: { combos: 0, mass: 0 },
    totalMass: 2,
    ...overrides,
  } as any;
}

function blockerReport(overrides: Record<string, unknown> = {}) {
  return {
    hero: [CARD(14, "s"), CARD(13, "d")],
    perCard: [
      { card: CARD(14, "s"), removed: split() },
      { card: CARD(13, "d"), removed: split() },
    ],
    blockedCombos: 3,
    blockedMass: 3,
    delta: {
      status: "ok",
      equityReal: 0.5,
      equityCounterfactual: 0.6666666666666666,
      delta: -0.16666666666666663,
      runoutsEnumerated: 1,
    },
    ...overrides,
  } as any;
}

const DISPONIVEL = { available: true, hero: [CARD(14, "s"), CARD(13, "d")] } as any;

// ── MdfPanel ─────────────────────────────────────────────────

describe("F3b D-F3-34 — o MdfPanel responde ANTES de existir spot", () => {
  it("renderiza as tres frases so com pote e call, sem resultado do motor", async () => {
    // As tres porcentagens nao dependem do motor: saem de `potCurrent` e
    // `callAmount`. Esconder o cartao atras do resultado seria perda gratuita.
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={30} callAmount={10} balance={null} />);

    const painel = screen.getByTestId("range-lab-mdf-panel");
    expect(within(painel).getByTestId("range-lab-mdf-line-hero")).toBeInTheDocument();
    expect(within(painel).getByTestId("range-lab-mdf-line-defense")).toBeInTheDocument();
    expect(within(painel).getByTestId("range-lab-mdf-line-mdf")).toBeInTheDocument();
  });

  it("sem balanco, o bloco de value/blefe nao aparece — e o cartao continua de pe", async () => {
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={30} callAmount={10} balance={null} />);
    expect(screen.queryByTestId("range-lab-mdf-balance")).toBeNull();
    expect(screen.getByTestId("range-lab-mdf-line-mdf")).toBeInTheDocument();
  });

  it("com balanco, mostra o bloco e o veredito de acao", async () => {
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={30} callAmount={10} balance={balance()} />);
    expect(screen.getByTestId("range-lab-mdf-balance")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-mdf-action").textContent?.trim().length).toBeGreaterThan(0);
  });

  it("a formula nao esta na face do cartao: ela viaja em atributo de tooltip", async () => {
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={30} callAmount={10} balance={balance()} />);
    const painel = screen.getByTestId("range-lab-mdf-panel");
    expect(
      /B\s*\/\s*\(\s*P\s*\+\s*B\s*\)/.test(painel.textContent ?? ""),
      "a formula esta escrita no corpo do cartao; o lugar dela e o tooltip",
    ).toBe(false);

    const tooltip = screen.getByTestId("range-lab-mdf-formula");
    const titulo = tooltip.getAttribute("title") ?? tooltip.getAttribute("aria-label") ?? "";
    expect(titulo).toMatch(/B\s*\/\s*\(\s*P\s*\+\s*B\s*\)/);
  });

  it("criterio 3: com P <= 0 o cartao vira frase de estado, sem NENHUM digito", async () => {
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={10} callAmount={100} balance={null} />);

    const painel = screen.getByTestId("range-lab-mdf-panel");
    expect(within(painel).getByTestId("range-lab-mdf-degraded")).toBeInTheDocument();
    expect(
      /\d/.test(painel.textContent ?? ""),
      `o cartao degradado escreveu numero: "${painel.textContent}". ` +
        "Zero seria pior que vazio (criterio 3 + D-F3-16).",
    ).toBe(false);
    expect(screen.queryByTestId("range-lab-mdf-line-mdf")).toBeNull();
  });

  it("pote sendo digitado (NaN) nao pinta cartao de tracinhos", async () => {
    const MdfPanel = await loadMdfPanel();
    render(<MdfPanel potCurrent={NaN} callAmount={10} balance={null} />);
    const painel = screen.getByTestId("range-lab-mdf-panel");
    expect(painel.textContent ?? "").not.toContain("NaN");
    expect(screen.getByTestId("range-lab-mdf-degraded")).toBeInTheDocument();
  });
});

// ── CascadeBar ───────────────────────────────────────────────

describe("F3b RF-03.2 — a CascadeBar mostra os cinco degraus, na ordem", () => {
  it("os cinco degraus estao na tela", async () => {
    const CascadeBar = await loadCascadeBar();
    render(<CascadeBar cascade={cascade()} />);
    const barra = screen.getByTestId("range-lab-cascade");
    for (const id of [
      "nominal",
      "declared",
      "after_board_removal",
      "after_mutual_removal",
      "loses_to_hero",
    ]) {
      expect(
        within(barra).getByTestId(`range-lab-cascade-step-${id}`),
        `degrau ${id} nao chegou na tela`,
      ).toBeInTheDocument();
    }
  });

  it("degrau indisponivel e marcado como tal, e nao desenha massa zero", async () => {
    // Barra vazia esconderia que o range declarado ja perdeu massa para o bordo;
    // massa zero seria lida como "as suas cartas mataram o range inteiro".
    const CascadeBar = await loadCascadeBar();
    render(<CascadeBar cascade={cascadeSemCorrida()} />);

    for (const id of ["nominal", "declared", "after_board_removal"]) {
      expect(
        screen.getByTestId(`range-lab-cascade-step-${id}`).getAttribute("data-status"),
        `degrau ${id} sumiu sem a corrida`,
      ).toBe("ok");
    }
    for (const id of ["after_mutual_removal", "loses_to_hero"]) {
      const el = screen.getByTestId(`range-lab-cascade-step-${id}`);
      expect(el.getAttribute("data-status")).toBe("unavailable");
      expect(
        /\b0\b/.test(el.textContent ?? ""),
        `degrau ${id} escreveu zero onde nao ha dado`,
      ).toBe(false);
    }
  });

  it("o componente nao recalcula nada: ele desenha os degraus recebidos", async () => {
    // Numero inventado a partir de outra fonte e como os dois paineis divergem.
    const CascadeBar = await loadCascadeBar();
    const custom = cascade({
      steps: [
        step("nominal", 1326, 1326),
        step("declared", 42, 42),
        step("after_board_removal", 41, 41),
        step("after_mutual_removal", 40, 40),
        step("loses_to_hero", 12.5, null, "effective"),
      ],
      basis: "effective",
      blockedMass: 1,
    });
    render(<CascadeBar cascade={custom} />);
    expect(screen.getByTestId("range-lab-cascade").textContent).toContain("42");
  });
});

// ── BlockerPanel ─────────────────────────────────────────────

describe("F3b D-F3-30 — o BlockerPanel nao decide se existe: quem decide e a funcao pura", () => {
  it("criterio 5: modo range renderiza o motivo e NENHUM numero de bloqueio", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel
        availability={{ available: false, reason: "hero_is_range", heroCombos: 4 } as any}
        report={null}
        onComputeDelta={vi.fn()}
      />,
    );
    expect(screen.getByTestId("range-lab-blocker-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("range-lab-blocker-card-0")).toBeNull();
    expect(screen.queryByTestId("range-lab-blocker-delta")).toBeNull();
  });

  it("sem resultado, o painel diz por que — nao some em silencio", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel
        availability={{ available: false, reason: "no_result", heroCombos: 0 } as any}
        report={null}
        onComputeDelta={vi.fn()}
      />,
    );
    const aviso = screen.getByTestId("range-lab-blocker-unavailable");
    expect((aviso.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("disponivel: duas colunas por carta e o total da UNIAO", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel availability={DISPONIVEL} report={blockerReport()} onComputeDelta={vi.fn()} />,
    );
    expect(screen.getByTestId("range-lab-blocker-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-blocker-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-blocker-total").textContent).toContain("3");
  });

  it("a frase de rodape impede o jogador de somar as colunas com os olhos", async () => {
    // As duas colunas somam mais que o total, do mesmo jeito e pelo mesmo motivo
    // que o bloco de draws da F3a (D-F3-4). O tipo protege o codigo; essa frase e
    // a unica coisa que protege a leitura.
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel availability={DISPONIVEL} report={blockerReport()} onComputeDelta={vi.fn()} />,
    );
    const rodape = screen.getByTestId("range-lab-blocker-overlap-note");
    expect((rodape.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("Monte Carlo: sem delta em pontos, com a saida escrita e a contagem de pe", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel
        availability={DISPONIVEL}
        report={blockerReport({
          delta: { status: "unavailable", reason: "monte_carlo_mode" },
        })}
        onComputeDelta={vi.fn()}
      />,
    );
    const delta = screen.getByTestId("range-lab-blocker-delta");
    expect(
      /\d+[.,]\d+/.test(delta.textContent ?? ""),
      "o delta apareceu com casa decimal num modo em que ele e menor que o proprio erro",
    ).toBe(false);
    expect(screen.getByTestId("range-lab-blocker-total").textContent).toContain("3");
    expect(screen.queryByTestId("range-lab-blocker-compute-delta")).toBeNull();
  });

  it("fora do river sem pedido: o botao aparece e chama onComputeDelta (D-F3-13)", async () => {
    const BlockerPanel = await loadBlockerPanel();
    const onComputeDelta = vi.fn();
    const user = userEvent.setup();
    render(
      <BlockerPanel
        availability={DISPONIVEL}
        report={blockerReport({ delta: { status: "unavailable", reason: "not_requested" } })}
        onComputeDelta={onComputeDelta}
      />,
    );
    const botao = screen.getByTestId("range-lab-blocker-compute-delta");
    await user.click(botao);
    expect(onComputeDelta).toHaveBeenCalledTimes(1);
  });

  it("sem combo bloqueado, nao ha botao para calcular efeito nenhum", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel
        availability={DISPONIVEL}
        report={blockerReport({
          blockedCombos: 0,
          blockedMass: 0,
          perCard: [
            { card: CARD(14, "s"), removed: split({ bluff: { combos: 0, mass: 0 }, chop: { combos: 0, mass: 0 }, totalMass: 0 }) },
            { card: CARD(13, "d"), removed: split({ bluff: { combos: 0, mass: 0 }, chop: { combos: 0, mass: 0 }, totalMass: 0 }) },
          ],
          delta: { status: "unavailable", reason: "no_blocked_combos" },
        })}
        onComputeDelta={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("range-lab-blocker-compute-delta")).toBeNull();
    expect(screen.getByTestId("range-lab-blocker-total").textContent).toContain("0");
  });

  it("delta pronto: o painel mostra o efeito em pontos", async () => {
    const BlockerPanel = await loadBlockerPanel();
    render(
      <BlockerPanel availability={DISPONIVEL} report={blockerReport()} onComputeDelta={vi.fn()} />,
    );
    const delta = screen.getByTestId("range-lab-blocker-delta");
    expect(delta.textContent ?? "").toMatch(/1[67][.,]\d/);
    expect(screen.queryByTestId("range-lab-blocker-compute-delta")).toBeNull();
  });
});
