// F1 — divida da F0 sendo paga: primeiro teste de wiring do CombosCalculator.
// Spec: Docs/specs/range-lab/F0-verdade.md (pendencias ao fechar a F0)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-10)
//
// D13 desta frente: o `CombosCalculator.tsx` NAO e tocado na F1. Este arquivo
// so exercita os `data-testid` que a F0 ja plantou e que ninguem nunca usou:
//   combos-empty-state, combos-empty-range, combos-duplicate-card,
//   combos-import-warnings
//
// Ele existe porque a F0 fechou com "unit verde, zero integracao" — o mesmo
// padrao de `memory/session_2026-04-27-tts-wiring`, que ja chegou quebrado em
// producao uma vez. O componente serve o popup `/calculadora-popup/combos` e
// continua vivo depois da F1, entao a rede de seguranca vale.
//
// NAO COBERTO aqui: `combos-card-notice`. Ele so aparece depois de um clique na
// grade de 52 cartas, e aqueles botoes nao tem `data-testid` — acha-los por
// texto seria a heuristica de DOM que a licao #2 proibe, e por a testid neles
// significaria tocar o componente, o que a D13 veta nesta frente.
//
// LICOES: #14/#26/#38 (SO `await import` neste arquivo), #2 (data-testid).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const DRAFT_KEY_V1 = "grindfy.comboCalc.draft.v1";
const CALC_PATH = "../../../client/src/components/calculators/CombosCalculator";

async function loadCalculator() {
  const mod: any = await import(/* @vite-ignore */ CALC_PATH);
  return mod.default ?? mod.CombosCalculator;
}

function seedDraft(draft: Record<string, unknown>): void {
  localStorage.setItem(DRAFT_KEY_V1, JSON.stringify(draft));
}

async function renderCalculator() {
  const CombosCalculator = await loadCalculator();
  return render(<CombosCalculator />);
}

const READY_DRAFT = {
  board: ["Ad", "8h", "4h", "2c", "5d"],
  hero: ["As", "6s"],
  entries: [{ notation: "KK", kind: "pair", frequency: 1 }],
  potInput: "36.1",
  callInput: "13.8",
  bbInput: "",
};

beforeEach(() => {
  localStorage.clear();
});

describe("F0 (divida) — CombosCalculator monta e fala quando nao pode calcular", () => {
  it("sem bordo, mostra o empty state em vez de um veredito vazio", async () => {
    await renderCalculator();
    await waitFor(() =>
      expect(screen.getByTestId("combos-empty-state")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("combos-empty-state").textContent).toMatch(/bordo/i);
  });

  it("range morto por card removal mostra 'combos-empty-range', nao FOLD de 0%", async () => {
    // `AdAs` e impossivel: as duas cartas estao no bordo/heroi.
    seedDraft({ ...READY_DRAFT, entries: [{ notation: "AdAs", kind: "specific", frequency: 1 }] });
    await renderCalculator();

    await waitFor(() =>
      expect(screen.getByTestId("combos-empty-range")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/0[.,]0\s*%/),
      "range sem massa exibindo 0,0% e o numero fantasma da F0",
    ).toBeNull();
  });

  it("carta repetida entre bordo e heroi diz QUAL carta esta repetida", async () => {
    seedDraft({ ...READY_DRAFT, hero: ["Ad", "6s"] });
    await renderCalculator();

    await waitFor(() =>
      expect(screen.getByTestId("combos-duplicate-card")).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("combos-duplicate-card").textContent,
      "o aviso precisa nomear a carta duplicada",
    ).toContain("Ad");
  });

  it("import com token ilegivel avisa em vez de engolir a mao", async () => {
    const user = userEvent.setup();
    await renderCalculator();

    const textarea = await screen.findByPlaceholderText(
      "99+, ATs+, KQs, A5s-A2s:0.5, QhJh",
    );
    await user.clear(textarea);
    await user.type(textarea, "99+, ZZZ");
    await user.click(screen.getByText("Adicionar ao range"));

    await waitFor(() =>
      expect(screen.getByTestId("combos-import-warnings")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("combos-import-warnings").textContent).toContain("ZZZ");
  });
});
