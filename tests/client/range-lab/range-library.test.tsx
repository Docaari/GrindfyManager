// F2 — RF-02.5, RangeLibrary.tsx: salvar/aplicar/duplicar + export/import
// colapsado (ADR-247 D-F2-3, emenda A12).
// LICOES: #14/#26/#38 (SO `await import`), #2 (data-testid).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

async function loadComponent() {
  const mod: any = await import(/* @vite-ignore */ "../../../client/src/components/range-lab/RangeLibrary");
  return mod.default ?? mod.RangeLibrary;
}

const ENTRIES = [
  { notation: "AA", kind: "pair", frequency: 1 },
  { notation: "KK", kind: "pair", frequency: 1 },
];

beforeEach(() => {
  localStorage.clear();
});

describe("F2 RF-02.5 — RangeLibrary", () => {
  it("salva o range corrente com um nome e ele aparece na lista", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={ENTRIES} onApply={() => {}} />);

    fireEvent.change(screen.getByTestId("range-library-name"), { target: { value: "3bet vs BTN" } });
    fireEvent.click(screen.getByTestId("range-library-save"));

    expect(await screen.findByText("3bet vs BTN")).toBeInTheDocument();
  });

  it("Salvar fica desabilitado quando nao ha entries para salvar", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={[]} onApply={() => {}} />);
    expect(screen.getByTestId("range-library-save")).toBeDisabled();
  });

  it("aplicar um range salvo chama onApply com as entries dele", async () => {
    const RangeLibrary = await loadComponent();
    const onApply = vi.fn();
    const { rerender } = render(<RangeLibrary entries={ENTRIES} onApply={onApply} />);
    fireEvent.click(screen.getByTestId("range-library-save"));

    const label = await screen.findByText("Range 1");
    const applyBtn = label.closest("button");
    expect(applyBtn).not.toBeNull();
    fireEvent.click(applyBtn as HTMLButtonElement);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual(ENTRIES);
    rerender(<RangeLibrary entries={ENTRIES} onApply={onApply} />);
  });

  it("duplicar cria uma copia com sufixo '(copia)', sem afetar o original", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={ENTRIES} onApply={() => {}} />);
    fireEvent.change(screen.getByTestId("range-library-name"), { target: { value: "Original" } });
    fireEvent.click(screen.getByTestId("range-library-save"));

    const dupBtn = await screen.findByLabelText("Duplicar Original");
    fireEvent.click(dupBtn);

    expect(await screen.findByText("Original (copia)")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("excluir remove o range da lista", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={ENTRIES} onApply={() => {}} />);
    fireEvent.change(screen.getByTestId("range-library-name"), { target: { value: "Descartavel" } });
    fireEvent.click(screen.getByTestId("range-library-save"));

    const delBtn = await screen.findByLabelText("Apagar Descartavel");
    fireEvent.click(delBtn);

    expect(screen.queryByText("Descartavel")).not.toBeInTheDocument();
  });

  it("export mostra a notacao colapsada ('KK, AA' vira 'KK+', alcanca o topo)", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={ENTRIES} onApply={() => {}} />);
    const exportBox = screen.getByTestId("range-library-export") as HTMLTextAreaElement;
    expect(exportBox.value).toBe("KK+");
  });

  it("importar texto colado substitui o range via onApply", async () => {
    const RangeLibrary = await loadComponent();
    const onApply = vi.fn();
    render(<RangeLibrary entries={[]} onApply={onApply} />);

    fireEvent.change(screen.getByTestId("range-library-import-text"), { target: { value: "99+" } });
    fireEvent.click(screen.getByTestId("range-library-import"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied.some((e: any) => e.notation === "99")).toBe(true);
    expect(applied.some((e: any) => e.notation === "AA")).toBe(true);
  });

  it("importar token ilegivel mostra o aviso em vez de falhar em silencio", async () => {
    const RangeLibrary = await loadComponent();
    render(<RangeLibrary entries={[]} onApply={() => {}} />);

    fireEvent.change(screen.getByTestId("range-library-import-text"), { target: { value: "99+, ZZZ" } });
    fireEvent.click(screen.getByTestId("range-library-import"));

    const warnings = await screen.findByTestId("range-library-import-warnings");
    expect(warnings.textContent).toContain("ZZZ");
  });
});
