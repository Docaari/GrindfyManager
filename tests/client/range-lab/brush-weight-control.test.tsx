// Emenda A9 — BrushWeightControl.tsx: peso rapido global do proximo pincel.
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

async function loadComponent() {
  const mod: any = await import(/* @vite-ignore */ "../../../client/src/components/range-lab/BrushWeightControl");
  return mod.default ?? mod.BrushWeightControl;
}

describe("emenda A9 — BrushWeightControl", () => {
  it("mostra o valor atual como percentual inteiro", async () => {
    const BrushWeightControl = await loadComponent();
    render(<BrushWeightControl value={0.5} onChange={() => {}} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("mudar o slider chama onChange com fracao 0..1, passo de 5%", async () => {
    const BrushWeightControl = await loadComponent();
    const onChange = vi.fn();
    render(<BrushWeightControl value={1} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("brush-weight-control-input"), { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith(0.25);
  });
});
