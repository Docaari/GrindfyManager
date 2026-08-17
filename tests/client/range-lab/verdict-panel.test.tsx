// F1 / RF-01.5 — VerdictPanel: o portao entre o resultado e a tela.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.5, criterio de aceite 4)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-4, D-F1-8)
//
// Duas regras de produto que este painel carrega sozinho:
//   1. Numero errado perde para numero ausente. Resultado degradado vira empty
//      state — nunca FOLD vermelho com 0% (o "-13,8 fichas" fantasma da F0).
//   2. Numero de Monte Carlo sem intervalo e bug. A margem tem que sair junto do
//      numero, no mesmo bloco, sem caminho de UI que a esconda.
//
// Contrato assumido (o implementer cria exatamente isto):
//   client/src/components/range-lab/VerdictPanel.tsx
//   <VerdictPanel result={EngineResult | null} progress={number} running={boolean} />
//   data-testid: range-lab-verdict-banner, range-lab-empty-state,
//                range-lab-equity, range-lab-mc-margin,
//                range-lab-degraded-combos, range-lab-progress
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid), #11 (componente nao
// ganha acao default que a spec nao pediu).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

const PANEL_PATH = "../../../client/src/components/range-lab/VerdictPanel";

async function loadPanel() {
  const mod: any = await import(/* @vite-ignore */ PANEL_PATH);
  return mod.VerdictPanel ?? mod.default;
}

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

async function renderPanel(props: Record<string, unknown>) {
  const VerdictPanel = await loadPanel();
  return render(<VerdictPanel progress={1} running={false} {...props} />);
}

beforeEach(() => {
  localStorage.clear();
});

// ── resultado saudavel ───────────────────────────────────────

describe("F1 RF-01.5 — veredito legitimo aparece inteiro", () => {
  it("mostra o banner e a equity", async () => {
    await renderPanel({ result: okExact() });
    expect(screen.getByTestId("range-lab-verdict-banner")).toBeInTheDocument();
    expect(screen.getByTestId("range-lab-equity").textContent).toMatch(/\d/);
  });

  it("decisao fold com massa real continua mostrando FOLD (isso e legitimo)", async () => {
    await renderPanel({
      result: okExact({
        decision: "fold",
        heroRangeEquity: 0.12,
        evCall: -20.156566,
        callThresholdIndex: 0,
        perHeroCombo: [heroCombo({ decision: "fold", equity: 0.12, evCall: -20.156566 })],
      }),
    });
    const banner = screen.getByTestId("range-lab-verdict-banner");
    expect(banner.textContent?.toLowerCase()).toContain("fold");
  });
});

// ── degradado nunca vira numero ──────────────────────────────

describe("F1 D-F1-8 — degradado vira empty state, nunca FOLD de 0%", () => {
  const REASONS = ["empty_hero_range", "empty_villain_range", "no_valid_pairs"] as const;

  for (const reason of REASONS) {
    it(`${reason}: empty state no lugar do veredito`, async () => {
      await renderPanel({
        result: { status: "degraded", reason, mode: "exact", requiredEquity: 0.2765 },
      });
      expect(screen.getByTestId("range-lab-empty-state")).toBeInTheDocument();
      expect(
        screen.queryByTestId("range-lab-verdict-banner"),
        `${reason}: banner de veredito num resultado sem veredito`,
      ).toBeNull();
      expect(screen.queryByTestId("range-lab-equity")).toBeNull();
      expect(
        screen.queryByText(/fold/i),
        `${reason}: FOLD sem massa e o defeito que a F0 corrigiu voltando pela porta do motor`,
      ).toBeNull();
      expect(screen.queryByText(/0[.,]0\s*%/)).toBeNull();
    });
  }

  it("o empty state explica a razao em PT-BR, nao mostra o codigo cru", async () => {
    await renderPanel({
      result: {
        status: "degraded",
        reason: "empty_villain_range",
        mode: "exact",
        requiredEquity: 0.2765,
      },
    });
    const vazio = screen.getByTestId("range-lab-empty-state");
    expect(vazio.textContent?.trim().length, "empty state mudo").toBeGreaterThan(0);
    expect(
      vazio.textContent,
      "razao tecnica crua na tela do jogador",
    ).not.toContain("empty_villain_range");
  });

  it("resultado ausente (ainda calculando) tambem nao inventa veredito", async () => {
    await renderPanel({ result: null, running: true, progress: 0.35 });
    expect(screen.queryByTestId("range-lab-verdict-banner")).toBeNull();
    expect(screen.queryByText(/fold/i)).toBeNull();
  });

  it("enquanto roda, a barra de progresso aparece", async () => {
    await renderPanel({ result: null, running: true, progress: 0.35 });
    expect(screen.getByTestId("range-lab-progress")).toBeInTheDocument();
  });

  it("terminado, a barra de progresso some", async () => {
    await renderPanel({ result: okExact(), running: false, progress: 1 });
    expect(screen.queryByTestId("range-lab-progress")).toBeNull();
  });
});

// ── Monte Carlo sempre com margem ────────────────────────────

describe("F1 criterio 4 — Monte Carlo nunca aparece sem margem", () => {
  const MC = okExact({
    mode: "monte_carlo",
    seed: 20240815,
    samples: 15_000,
    confidence: { level: 0.95, halfWidth: 0.0071 },
    perHeroCombo: [heroCombo({ confidenceHalfWidth: 0.0071, sampleCount: 15_000 })],
  });

  it("a margem sai DENTRO do bloco do numero", async () => {
    await renderPanel({ result: MC });
    const bloco = screen.getByTestId("range-lab-equity");
    const margem = within(bloco).getByTestId("range-lab-mc-margin");
    expect(margem.textContent, "a margem precisa carregar um numero").toMatch(/\d/);
  });

  it("a tela declara que o numero e aproximado", async () => {
    await renderPanel({ result: MC });
    const bloco = screen.getByTestId("range-lab-equity");
    expect(
      bloco.textContent,
      `o bloco "${bloco.textContent}" mostra a equity sem nenhum sinal de margem`,
    ).toMatch(/\d/);
    expect(within(bloco).queryByTestId("range-lab-mc-margin")).not.toBeNull();
  });

  it("no modo exato nao existe margem em lugar nenhum", async () => {
    await renderPanel({ result: okExact() });
    expect(
      screen.queryByTestId("range-lab-mc-margin"),
      "margem no exato sugere incerteza que nao existe",
    ).toBeNull();
  });
});

// ── combos que sairam da conta ───────────────────────────────

describe("F1 D-F1-4 — a UI diz quantos combos sairam do agregado e por que", () => {
  const COM_ORFAO = okExact({
    perHeroCombo: [
      heroCombo(),
      heroCombo({
        combo: [CARD(13, "s"), CARD(12, "s")],
        pairMass: 0,
        equity: null,
        evCall: null,
        decision: null,
        degradedReason: "no_valid_villain_combo",
      }),
    ],
    callThresholdIndex: 1,
  });

  it("combo sem oponente e anunciado, nao sumido em silencio", async () => {
    await renderPanel({ result: COM_ORFAO });
    const aviso = screen.getByTestId("range-lab-degraded-combos");
    expect(
      aviso.textContent,
      "o aviso precisa dizer QUANTOS combos sairam",
    ).toMatch(/1/);
  });

  it("sem combo degradado o aviso nao aparece", async () => {
    await renderPanel({ result: okExact() });
    expect(screen.queryByTestId("range-lab-degraded-combos")).toBeNull();
  });

  it("o combo degradado nunca aparece como 0%", async () => {
    await renderPanel({ result: COM_ORFAO });
    expect(
      screen.queryByText(/0[.,]0\s*%/),
      "combo sem oponente exibido como 0% e numero inventado",
    ).toBeNull();
  });
});
