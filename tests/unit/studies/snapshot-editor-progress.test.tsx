// =============================================================================
// Sprint Stats-V2 — UX polish: SnapshotEditor progress + search + Ctrl+S
//
// Cobertura HIGH-3:
//   - Progress bar reflete count de stats reportados
//   - Search bar filtra inputs por id/label
//   - Ctrl+S forca save imediato (bypassa debounce 1s)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsSnapshotEditorV2 from "../../../client/src/components/studies/StatsSnapshotEditorV2";

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
  apiRequestMock.mockResolvedValue({ id: "snap-1", layoutId: "lyt-1" });
});

const layout = {
  id: "lyt-1",
  name: "MTT Default",
  isCustom: false,
  fields: [
    {
      id: "vpip",
      label: "VPIP",
      group: "basics",
      direction: "context",
      unit: "pct",
      targetMin: 20,
      targetMax: 25,
    },
    {
      id: "pfr",
      label: "PFR",
      group: "basics",
      direction: "context",
      unit: "pct",
      targetMin: 16,
      targetMax: 20,
    },
    {
      id: "rfi_btn",
      label: "RFI BTN",
      group: "rfi",
      direction: "higher_better",
      unit: "pct",
      targetMin: 35,
      targetMax: 45,
    },
  ],
};

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StatsSnapshotEditorV2 open onOpenChange={vi.fn()} layout={layout} />
    </QueryClientProvider>,
  );
}

describe("<StatsSnapshotEditorV2> — HIGH-3 progress bar", () => {
  it("progress label mostra 0 de N quando aberto sem valores", () => {
    renderEditor();
    const label = screen.getByTestId("snapshot-progress-label");
    expect(label.textContent).toMatch(/0\s+de\s+3/);
  });

  it("progress label atualiza ao preencher input", async () => {
    renderEditor();
    const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "22" } });
    await waitFor(() => {
      const label = screen.getByTestId("snapshot-progress-label");
      expect(label.textContent).toMatch(/1\s+de\s+3/);
    });
  });

  it("progress bar tem aria-label e data-testid", () => {
    renderEditor();
    const bar = screen.getByTestId("snapshot-progress-bar");
    expect(bar).toBeTruthy();
    expect(bar.getAttribute("aria-label")).toMatch(/progresso/i);
  });
});

describe("<StatsSnapshotEditorV2> — HIGH-3 search filter", () => {
  it("search filtra inputs por label", async () => {
    renderEditor();
    const search = screen.getByTestId("editor-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "rfi" } });
    await waitFor(() => {
      // VPIP/PFR (basics) ficam ocultos
      expect(screen.queryByTestId("snapshot-input-vpip")).toBeNull();
      // rfi_btn (grupo rfi) permanece
      expect(screen.queryByTestId("snapshot-input-rfi_btn")).toBeTruthy();
    });
  });

  it("search vazia mostra empty state quando nada bate", async () => {
    renderEditor();
    const search = screen.getByTestId("editor-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "xyz_nao_existe" } });
    await waitFor(() => {
      expect(screen.queryByTestId("snapshot-empty-search")).toBeTruthy();
    });
  });
});

describe("<StatsSnapshotEditorV2> — HIGH-3 Ctrl+S bypass debounce", () => {
  it("Ctrl+S dispara save sem esperar 1s de debounce", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "22.5" } });
      // Antes do debounce — sem POST
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(apiRequestMock).not.toHaveBeenCalled();
      // Ctrl+S forca save imediato
      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
      });
      vi.useRealTimers();
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalled();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
