import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SnapshotComparator from "../SnapshotComparator";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

beforeEach(() => {
  apiRequestMock.mockReset();
});

function renderWith(ids: [string, string] | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SnapshotComparator open onOpenChange={vi.fn()} ids={ids} />
    </QueryClientProvider>,
  );
}

const payload = {
  layoutId: "lyt-1",
  layoutName: "PT4",
  a: { id: "a", capturedAt: "2026-04-01", sampleSize: 1000 },
  b: { id: "b", capturedAt: "2026-04-15", sampleSize: 1500 },
  diffs: [
    { key: "vpip", a: 22.5, b: 24.0, delta: 1.5 },
    { key: "pfr", a: 18.0, b: 18.0, delta: 0 },
    { key: "3bet", a: null, b: 7.2, delta: null },
    { key: "fold_to_3bet", a: 60.0, b: 55.0, delta: -5 },
  ],
};

describe("<SnapshotComparator>", () => {
  it("chama API com ids quando open + ids fornecidos", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/hud-stat-snapshots/compare",
        { ids: ["a", "b"] },
      );
    });
  });

  it("renderiza linhas para cada diff", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      expect(screen.getByTestId("compare-row-vpip")).toBeTruthy();
      expect(screen.getByTestId("compare-row-pfr")).toBeTruthy();
      expect(screen.getByTestId("compare-row-3bet")).toBeTruthy();
    });
  });

  it("delta positivo mostra cor green", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      const delta = screen.getByTestId("compare-delta-vpip");
      expect(delta.className).toMatch(/green/);
    });
  });

  it("delta negativo mostra cor red", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      const delta = screen.getByTestId("compare-delta-fold_to_3bet");
      expect(delta.className).toMatch(/red/);
    });
  });

  it("delta zero mostra cor gray", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      const delta = screen.getByTestId("compare-delta-pfr");
      expect(delta.className).toMatch(/gray/);
    });
  });

  it("delta null exibe placeholder", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderWith(["a", "b"]);
    await waitFor(() => {
      const delta = screen.getByTestId("compare-delta-3bet");
      expect(delta.textContent).toContain("—");
    });
  });

  it("erro de API mostra mensagem", async () => {
    apiRequestMock.mockRejectedValue(new Error("rede"));
    renderWith(["a", "b"]);
    await waitFor(() => {
      expect(screen.getByTestId("compare-error")).toBeTruthy();
    });
  });
});
