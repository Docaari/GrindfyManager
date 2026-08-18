// F2 — RF-02.2, selecao de naipe em grade (D-F2-1, emenda A8).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.2)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-1, "forma validada")
//
// Forma VALIDADA pelo founder (emenda A8, supera o rascunho anterior de
// "todos/nenhum/inverter/flush do bordo" da spec — este teste segue a forma
// final): um BOTAO por combo com o simbolo do naipe colorido, slider por
// combo (RF-02.3, escreve em `comboFreqOverrides`), presets de frequencia
// 25/50/75/100 e "Limpar" no rodape. Combo impossivel pelo bordo (ja
// filtrado por quem monta a prop `combos`) NAO aparece — some, nao fica
// desabilitado.
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/components/range-lab/SuitPickerPopover.tsx):
//
//   export interface SuitPickerPopoverProps {
//     notation: string;
//     combos: [Card, Card][];   // JA filtrados por card removal — quem chama decide
//     entry: RangeEntry;
//     onChange: (next: RangeEntry) => void;
//   }
//
// Testids assumidos: `suit-picker-popover`, `suit-picker-combo-<comboKey>`,
// `suit-picker-preset-25|50|75|100`, `suit-picker-clear`,
// `suit-picker-slider-<comboKey>` (input[type=range]).
//
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { parseCard, comboKey } from "@/lib/combo-calc/cards";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";

const POPOVER_PATH = "../../../client/src/components/range-lab/SuitPickerPopover";

async function loadPopover() {
  const mod: any = await import(/* @vite-ignore */ POPOVER_PATH);
  return mod.SuitPickerPopover ?? mod.default;
}

function card(spec: string): Card {
  const c = parseCard(spec);
  if (!c) throw new Error(`carta invalida na fixture: ${spec}`);
  return c;
}

/** Os 4 combos suited de AKs, sem card removal nenhum. */
const AKs_COMBOS: [Card, Card][] = [
  [card("Ac"), card("Kc")],
  [card("Ad"), card("Kd")],
  [card("Ah"), card("Kh")],
  [card("As"), card("Ks")],
];

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
});

function baseEntry(overrides: Partial<RangeEntry> = {}): RangeEntry {
  return { notation: "AKs", kind: "suited", frequency: 1, ...overrides };
}

async function renderPopover(props: Record<string, unknown> = {}) {
  const SuitPickerPopover = await loadPopover();
  return render(
    <SuitPickerPopover
      notation="AKs"
      combos={AKs_COMBOS}
      entry={baseEntry()}
      onChange={onChange}
      {...props}
    />,
  );
}

describe("F2 RF-02.2 — um botao por combo, com o simbolo do naipe", () => {
  it("renderiza um botao para cada combo recebido", async () => {
    await renderPopover();
    for (const [a, b] of AKs_COMBOS) {
      expect(screen.getByTestId(`suit-picker-combo-${comboKey(a, b)}`)).toBeInTheDocument();
    }
  });

  it("combo impossivel pelo bordo (ausente de `combos`) NAO aparece no popover", async () => {
    // So 2 dos 4 combos de AKs sobrevivem ao card removal simulado.
    const partial: [Card, Card][] = [AKs_COMBOS[0], AKs_COMBOS[2]];
    await renderPopover({ combos: partial });

    expect(screen.getByTestId(`suit-picker-combo-${comboKey(...AKs_COMBOS[0])}`)).toBeInTheDocument();
    expect(screen.getByTestId(`suit-picker-combo-${comboKey(...AKs_COMBOS[2])}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`suit-picker-combo-${comboKey(...AKs_COMBOS[1])}`)).toBeNull();
    expect(screen.queryByTestId(`suit-picker-combo-${comboKey(...AKs_COMBOS[3])}`)).toBeNull();
  });
});

describe("F2 RF-02.2 — presets de frequencia 25/50/75/100", () => {
  it.each([
    ["suit-picker-preset-25", 0.25],
    ["suit-picker-preset-50", 0.5],
    ["suit-picker-preset-75", 0.75],
    ["suit-picker-preset-100", 1],
  ])("clicar em %s ajusta a frequencia da classe para %s", async (testId, expected) => {
    const user = userEvent.setup();
    await renderPopover({ entry: baseEntry({ frequency: 0.1 }) });

    await user.click(screen.getByTestId(testId));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next: RangeEntry = onChange.mock.calls[0][0];
    expect(next.frequency).toBeCloseTo(expected as number, 9);
  });
});

describe("F2 RF-02.3 — Limpar volta o override para a frequencia da classe", () => {
  it("Limpar remove comboFreqOverrides e o filtro de naipe, sem mexer na frequencia da classe", async () => {
    const user = userEvent.setup();
    const entryComKey = comboKey(...AKs_COMBOS[0]);
    await renderPopover({
      entry: baseEntry({
        frequency: 0.7,
        suits: [entryComKey],
        comboFreqOverrides: { [entryComKey]: 0.2 },
      }),
    });

    await user.click(screen.getByTestId("suit-picker-clear"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next: RangeEntry = onChange.mock.calls[0][0];
    expect(next.comboFreqOverrides ?? {}).toEqual({});
    expect(next.suits ?? []).toEqual([]);
    expect(next.frequency).toBeCloseTo(0.7, 9);
  });
});

describe("F2 RF-02.3 — slider por combo escreve em comboFreqOverrides, so daquele combo", () => {
  it("ajustar o slider de UM combo nao mexe nos outros nem na frequencia da classe", async () => {
    await renderPopover({ entry: baseEntry({ frequency: 1 }) });
    const targetKey = comboKey(...AKs_COMBOS[0]);
    const slider = screen.getByTestId(`suit-picker-slider-${targetKey}`) as HTMLInputElement;

    // input[type=range]: dispara via evento nativo de mudanca (fireEvent cobre
    // isso melhor que userEvent para range inputs, que nao tem "type" de texto).
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(slider, { target: { value: "30" } });

    expect(onChange).toHaveBeenCalled();
    const next: RangeEntry = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(next.comboFreqOverrides?.[targetKey]).toBeCloseTo(0.3, 9);
    expect(next.frequency).toBeCloseTo(1, 9);
    for (let i = 1; i < AKs_COMBOS.length; i++) {
      const otherKey = comboKey(...AKs_COMBOS[i]);
      expect(next.comboFreqOverrides?.[otherKey]).toBeUndefined();
    }
  });
});
