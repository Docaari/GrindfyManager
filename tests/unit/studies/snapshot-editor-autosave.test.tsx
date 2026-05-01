// =============================================================================
// Sprint Stats-V2 — StatsSnapshotEditor V2 (RF-05)
//
// Red phase. Componente `StatsSnapshotEditorV2` ainda nao existe.
//
// Espec:
//   - Auto-save debounce 1s no input
//   - POST /api/hud-stat-snapshots chamado 1s apos ultimo input
//   - Multiple inputs em sequencia rapida = 1 POST so
//   - Paste handler dispara parsePastedSnapshot
//   - CSV upload dispara parseCsvSnapshot
//   - value=null preservado (input vazio)
//   - Erro 500 mostra toast, NAO perde valores
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

describe("<StatsSnapshotEditorV2> — autosave", () => {
  it("debounce 1s antes de POST", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "22.5" } });
      // Antes de 1s — sem POST
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(apiRequestMock).not.toHaveBeenCalled();
      // Apos 1.1s — POST
      act(() => {
        vi.advanceTimersByTime(200);
      });
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalled();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("multiple inputs em sequencia = 1 POST (debounce reset)", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const vpip = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      const pfr = screen.getByTestId("snapshot-input-pfr") as HTMLInputElement;
      fireEvent.change(vpip, { target: { value: "22.5" } });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.change(pfr, { target: { value: "18.0" } });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      // 1s total mas o ultimo input foi a 500ms — esperando debounce reset
      expect(apiRequestMock).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledTimes(1);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("input vazio preserva value=null no payload", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalled();
      });
      const lastCall = apiRequestMock.mock.calls.at(-1);
      const payload = lastCall?.[2] ?? {};
      // Pode ser ausencia de chave OU vpip:null
      const hasNullVpip =
        payload?.values?.vpip === null ||
        !("vpip" in (payload?.values ?? {}));
      expect(hasNullVpip).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("toast 'Salvo' apos resposta 200", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "22.5" } });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      vi.useRealTimers();
      await waitFor(() => {
        const calls = toastMock.mock.calls;
        const hasSavedToast = calls.some((c) => {
          const arg = c[0];
          const msg = (arg?.title || arg?.description || "").toLowerCase();
          return msg.includes("salvo") || msg.includes("saved");
        });
        expect(hasSavedToast).toBe(true);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("erro 500 mostra toast, mas NAO perde valores do form", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("500 server error"));
    vi.useFakeTimers();
    try {
      renderEditor();
      const input = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "22.5" } });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      vi.useRealTimers();
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalled();
      });
      // Valor preservado no input
      expect(input.value).toBe("22.5");
      // Toast erro
      const errToast = toastMock.mock.calls.some((c) => {
        const arg = c[0];
        const variant = arg?.variant;
        const msg = (arg?.title || arg?.description || "").toLowerCase();
        return variant === "destructive" || msg.includes("erro") || msg.includes("error");
      });
      expect(errToast).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("<StatsSnapshotEditorV2> — paste import", () => {
  it("paste handler chama parsePastedSnapshot e preenche inputs", () => {
    renderEditor();
    const pasteArea = screen.getByTestId("snapshot-paste-area");
    fireEvent.paste(pasteArea, {
      clipboardData: {
        getData: () => "VPIP\t22.5\nPFR\t18.0",
      },
    });
    const vpip = screen.getByTestId("snapshot-input-vpip") as HTMLInputElement;
    const pfr = screen.getByTestId("snapshot-input-pfr") as HTMLInputElement;
    expect(vpip.value).toBe("22.5");
    expect(pfr.value).toBe("18.0");
  });

  it("MAJOR-3 reviewer: applyParsedValues dispara autosave (POST 1s apos paste)", async () => {
    vi.useFakeTimers();
    try {
      renderEditor();
      const pasteArea = screen.getByTestId("snapshot-paste-area");
      fireEvent.paste(pasteArea, {
        clipboardData: {
          getData: () => "VPIP\t22.5\nPFR\t18.0",
        },
      });
      // Antes do debounce — sem POST
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(apiRequestMock).not.toHaveBeenCalled();
      // Apos debounce — POST
      act(() => {
        vi.advanceTimersByTime(200);
      });
      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalled();
      });
      const lastCall = apiRequestMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe("POST");
      expect(lastCall?.[1]).toBe("/api/hud-stat-snapshots");
      const payload = lastCall?.[2];
      expect(payload?.values?.vpip).toBe(22.5);
      expect(payload?.values?.pfr).toBe(18.0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("<StatsSnapshotEditorV2> — CSV upload", () => {
  it("CSV upload chama parseCsvSnapshot e preenche inputs", async () => {
    renderEditor();
    const fileInput = screen.getByTestId(
      "snapshot-csv-upload",
    ) as HTMLInputElement;
    const file = new File(["stat,value\nvpip,22.5\npfr,18.0"], "stats.csv", {
      type: "text/csv",
    });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => {
      const vpip = screen.getByTestId(
        "snapshot-input-vpip",
      ) as HTMLInputElement;
      expect(vpip.value).toBe("22.5");
    });
  });
});
