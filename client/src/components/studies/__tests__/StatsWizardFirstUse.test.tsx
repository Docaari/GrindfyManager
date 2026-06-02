import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsWizardFirstUse from "../StatsWizardFirstUse";

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

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatsWizardFirstUse open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("<StatsWizardFirstUse>", () => {
  it("renderiza 3 templates", () => {
    renderWizard();
    expect(screen.getByTestId("wizard-template-pt4")).toBeTruthy();
    expect(screen.getByTestId("wizard-template-hm3")).toBeTruthy();
    expect(screen.getByTestId("wizard-template-mtt")).toBeTruthy();
  });

  it("default selecionado = pt4", () => {
    renderWizard();
    const card = screen.getByTestId("wizard-template-pt4");
    expect(card.className).toMatch(/border-primary|bg-primary/);
  });

  it("clicar troca selecao", () => {
    renderWizard();
    fireEvent.click(screen.getByTestId("wizard-template-hm3"));
    const card = screen.getByTestId("wizard-template-hm3");
    expect(card.className).toMatch(/border-primary|bg-primary/);
  });

  it("confirm POST cria layout com payload do template selecionado", async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId("wizard-template-mtt"));
    fireEvent.click(screen.getByTestId("wizard-confirm"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/hud-layouts",
        expect.objectContaining({
          name: "MTT Generico",
          isDefault: true,
        }),
      );
    });
  });

  it("payload contem sections com stats validas", async () => {
    renderWizard();
    fireEvent.click(screen.getByTestId("wizard-confirm"));
    await waitFor(() => {
      const call = apiRequestMock.mock.calls[0];
      const payload = call[2];
      expect(payload.sections).toBeInstanceOf(Array);
      expect(payload.sections[0].stats).toBeInstanceOf(Array);
      expect(payload.sections[0].stats[0].key).toBeTruthy();
    });
  });
});
