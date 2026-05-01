// =============================================================================
// Sprint Stats-V2 — StatsWizardPostImport (RF-08)
//
// Red phase. Componente `StatsWizardPostImport` ainda nao existe.
//
// Espec (RF-08 + lesson #11):
//   - Mostrado quando user importa CSV pela primeira vez OU sem snapshots
//   - Default: mttDefault highlight com badge "Recomendado"
//   - NAO auto-submit (lesson #11 — componentes decorativos NAO ganham
//     acoes default)
//   - Botao explicito "aplicar template" e "customizar"
//   - Click "customizar" abre customizer pre-seeded com mttDefault
//   - Skip flow: nao mostra wizard se user ja tem snapshot OU ja escolheu
//     template
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsWizardPostImport from "../../../client/src/components/studies/StatsWizardPostImport";

const { apiRequestMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: toastMock,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

beforeEach(() => {
  apiRequestMock.mockReset();
  toastMock.mockReset();
  apiRequestMock.mockResolvedValue({});
});

function renderWizard(props: Partial<any> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StatsWizardPostImport
        open
        onOpenChange={vi.fn()}
        existingSnapshotsCount={0}
        existingLayoutsCount={0}
        onApplyTemplate={vi.fn()}
        onCustomize={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("<StatsWizardPostImport> — render", () => {
  it("renderiza 4 templates V2 (mttDefault, mttCashCompact, tournamentEarly, tournamentLate)", () => {
    renderWizard();
    expect(screen.getByTestId("wizard-template-mttDefault")).toBeTruthy();
    expect(screen.getByTestId("wizard-template-mttCashCompact")).toBeTruthy();
    expect(screen.getByTestId("wizard-template-tournamentEarly")).toBeTruthy();
    expect(screen.getByTestId("wizard-template-tournamentLate")).toBeTruthy();
  });

  it("mttDefault tem badge 'Recomendado'", () => {
    renderWizard();
    const card = screen.getByTestId("wizard-template-mttDefault");
    expect(card.textContent?.toLowerCase()).toMatch(/recomendado/);
  });

  it("mttDefault tem highlight visual (ring-2 OU border-poker-accent OU data-default='true')", () => {
    renderWizard();
    const card = screen.getByTestId("wizard-template-mttDefault");
    const className = card.className;
    const isHighlighted =
      /ring-2|border-poker-accent|poker-accent/.test(className) ||
      card.getAttribute("data-default") === "true";
    expect(isHighlighted).toBe(true);
  });
});

describe("<StatsWizardPostImport> — no auto-submit (lesson #11)", () => {
  it("highlight do mttDefault NAO dispara onApplyTemplate ao montar", () => {
    const onApplyTemplate = vi.fn();
    renderWizard({ onApplyTemplate });
    expect(onApplyTemplate).not.toHaveBeenCalled();
  });

  it("click no card mttDefault NAO submete sozinho — exige botao explicito", () => {
    const onApplyTemplate = vi.fn();
    renderWizard({ onApplyTemplate });
    fireEvent.click(screen.getByTestId("wizard-template-mttDefault"));
    expect(onApplyTemplate).not.toHaveBeenCalled();
  });

  it("click em 'aplicar template' chama onApplyTemplate com template selecionado", () => {
    const onApplyTemplate = vi.fn();
    renderWizard({ onApplyTemplate });
    fireEvent.click(screen.getByTestId("wizard-template-mttDefault"));
    fireEvent.click(screen.getByTestId("wizard-confirm"));
    expect(onApplyTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mttDefault" }),
    );
  });
});

describe("<StatsWizardPostImport> — customizar flow", () => {
  it("click 'customizar' chama onCustomize com template seeded", () => {
    const onCustomize = vi.fn();
    renderWizard({ onCustomize });
    fireEvent.click(screen.getByTestId("wizard-template-mttDefault"));
    fireEvent.click(screen.getByTestId("wizard-customize"));
    expect(onCustomize).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mttDefault" }),
    );
  });
});

describe("<StatsWizardPostImport> — skip conditions", () => {
  it("nao monta wizard se ja tem snapshot (existingSnapshotsCount > 0)", () => {
    const { container } = renderWizard({ existingSnapshotsCount: 5 });
    // Wizard renderiza nada OU `open=false` (testar via testid root ausente)
    const root = screen.queryByTestId("stats-wizard-post-import");
    expect(root).toBeNull();
  });

  it("nao monta wizard se ja tem layout custom (existingLayoutsCount > 0 com is_custom=true)", () => {
    const { container } = renderWizard({
      existingLayoutsCount: 3,
      hasCustomLayout: true,
    });
    const root = screen.queryByTestId("stats-wizard-post-import");
    expect(root).toBeNull();
  });
});
