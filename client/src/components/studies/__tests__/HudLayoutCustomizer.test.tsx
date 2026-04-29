import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HudLayoutCustomizer from "../HudLayoutCustomizer";
import type { HudLayout } from "../StatsSnapshotEditor";

const { toastMock, apiRequestMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  apiRequestMock: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn() }),
  toast: toastMock,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
}));

beforeEach(() => {
  toastMock.mockClear();
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({});
});

function renderWith(layout: HudLayout | null, mode: "create" | "edit") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HudLayoutCustomizer
        open
        onOpenChange={vi.fn()}
        layout={layout}
        mode={mode}
      />
    </QueryClientProvider>,
  );
}

const baseLayout: HudLayout = {
  id: "lyt-1",
  name: "PT4",
  isDefault: true,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        { key: "vpip", label: "VPIP", decimals: 1, suffix: "%" },
        { key: "pfr", label: "PFR", decimals: 1, suffix: "%" },
      ],
    },
    {
      label: "Flop",
      sortOrder: 1,
      stats: [{ key: "cbet_flop", label: "CBet Flop", decimals: 1, suffix: "%" }],
    },
  ],
};

describe("<HudLayoutCustomizer>", () => {
  it("modo edit pre-popula nome e sections", () => {
    renderWith(baseLayout, "edit");
    const input = screen.getByTestId("layout-name-input") as HTMLInputElement;
    expect(input.value).toBe("PT4");
    expect(screen.getByTestId("section-0")).toBeTruthy();
    expect(screen.getByTestId("section-1")).toBeTruthy();
  });

  it("modo create comeca com 1 secao default", () => {
    renderWith(null, "create");
    expect(screen.getByTestId("section-0")).toBeTruthy();
    expect(screen.queryByTestId("section-1")).toBeNull();
  });

  it("add section adiciona nova entrada", () => {
    renderWith(null, "create");
    fireEvent.click(screen.getByTestId("section-add"));
    expect(screen.getByTestId("section-1")).toBeTruthy();
  });

  it("remove section quando ha mais de 1", () => {
    renderWith(baseLayout, "edit");
    fireEvent.click(screen.getByTestId("section-remove-1"));
    expect(screen.queryByTestId("section-1")).toBeNull();
  });

  it("remove section bloqueado quando so resta 1", () => {
    renderWith(null, "create");
    fireEvent.click(screen.getByTestId("section-remove-0"));
    expect(toastMock).toHaveBeenCalled();
    expect(screen.getByTestId("section-0")).toBeTruthy();
  });

  it("add stat adiciona linha", () => {
    renderWith(null, "create");
    fireEvent.click(screen.getByTestId("stat-add-0"));
    expect(screen.getByTestId("stat-0-1")).toBeTruthy();
  });

  it("warn duplicate keys quando duas stats com mesma key", () => {
    renderWith(null, "create");
    fireEvent.click(screen.getByTestId("stat-add-0"));
    const k0 = screen.getByTestId("stat-key-0-0") as HTMLInputElement;
    const k1 = screen.getByTestId("stat-key-0-1") as HTMLInputElement;
    fireEvent.change(k0, { target: { value: "shared" } });
    fireEvent.change(k1, { target: { value: "shared" } });
    expect(screen.getByTestId("duplicate-keys-warn")).toBeTruthy();
  });

  it("save POST quando mode=create", async () => {
    renderWith(null, "create");
    const nameInput = screen.getByTestId("layout-name-input");
    fireEvent.change(nameInput, { target: { value: "Custom" } });
    fireEvent.click(screen.getByTestId("layout-save"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/hud-layouts",
        expect.objectContaining({ name: "Custom" }),
      );
    });
  });

  it("save PUT quando mode=edit", async () => {
    renderWith(baseLayout, "edit");
    fireEvent.click(screen.getByTestId("layout-save"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "PUT",
        "/api/hud-layouts/lyt-1",
        expect.any(Object),
      );
    });
  });

  it("save bloqueia se nome vazio", async () => {
    renderWith(null, "create");
    const nameInput = screen.getByTestId("layout-name-input");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("layout-save"));
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalled();
  });
});
