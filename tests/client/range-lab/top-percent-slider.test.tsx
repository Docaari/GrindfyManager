// F2 — RF-02.4, TopPercentSlider.tsx: declara metodo+amostras, aplica
// substituindo o range do lado (ADR-247 D-F2-3).
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

async function loadComponent() {
  const mod: any = await import(/* @vite-ignore */ "../../../client/src/components/range-lab/TopPercentSlider");
  return mod.default ?? mod.TopPercentSlider;
}

describe("F2 RF-02.4 — TopPercentSlider", () => {
  it("declara o metodo e o numero de amostras — nunca disfarca dado medido de exato", async () => {
    const TopPercentSlider = await loadComponent();
    render(<TopPercentSlider dead={new Set()} onApply={() => {}} />);
    const method = screen.getByTestId("top-percent-slider-method");
    expect(method.textContent).toMatch(/monte carlo/i);
    expect(method.textContent).toMatch(/60\.000/);
    expect(method.textContent).toMatch(/mao aleatoria/i);
  });

  it("mover o slider muda o percentual exibido", async () => {
    const TopPercentSlider = await loadComponent();
    render(<TopPercentSlider dead={new Set()} onApply={() => {}} />);
    const input = screen.getByTestId("top-percent-slider-input");
    fireEvent.change(input, { target: { value: "50" } });
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("Aplicar chama onApply com um range que soma ~1326*pct/100 combos (topo do range, top 3%)", async () => {
    const TopPercentSlider = await loadComponent();
    const onApply = vi.fn();
    render(<TopPercentSlider dead={new Set()} onApply={onApply} />);
    fireEvent.change(screen.getByTestId("top-percent-slider-input"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("top-percent-slider-apply"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const entries = onApply.mock.calls[0][0];
    expect(entries.some((e: any) => e.notation === "AA")).toBe(true);
    expect(entries.every((e: any) => e.frequency > 0 && e.frequency <= 1)).toBe(true);
  });

  it("card removal reduz 'combos totais' quando o bordo bloqueia parte do top X%", async () => {
    const TopPercentSlider = await loadComponent();
    // Bordo com dois Ases: reduz drasticamente os combos de AA disponiveis (so 1 combo sobra: AcAd/etc).
    const dead = new Set(["As", "Ah"]);
    render(<TopPercentSlider dead={dead} onApply={() => {}} />);
    fireEvent.change(screen.getByTestId("top-percent-slider-input"), { target: { value: "1" } });
    const stats = screen.getByTestId("top-percent-slider-stats");
    expect(stats.textContent).toMatch(/removeu/i);
  });
});
