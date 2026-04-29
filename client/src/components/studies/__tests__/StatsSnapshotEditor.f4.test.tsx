import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsSnapshotEditor, {
  getInputRange,
  getInlineTarget,
  classifyVsInlineTarget,
  type HudLayout,
} from "../StatsSnapshotEditor";

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

const layoutWithTargets: HudLayout = {
  id: "lyt-1",
  name: "PT4",
  isDefault: true,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        {
          key: "vpip",
          label: "VPIP",
          decimals: 1,
          suffix: "%",
          targetMin: 28,
          targetMax: 30,
          inputMin: 0,
          inputMax: 100,
        },
        {
          key: "pfr",
          label: "PFR",
          decimals: 1,
          suffix: "%",
          targetMin: 20,
          targetMax: 23,
        },
        {
          key: "wwsf",
          label: "WWSF%",
          decimals: 1,
        },
      ],
    },
  ],
};

function renderWith(layout: HudLayout | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StatsSnapshotEditor open onOpenChange={vi.fn()} layout={layout} />
    </QueryClientProvider>,
  );
}

describe("getInputRange (F4 helper)", () => {
  it("usa inputMin/inputMax quando presentes", () => {
    expect(getInputRange({ key: "x", label: "X", decimals: 1, inputMin: 5, inputMax: 95 })).toEqual({ min: 5, max: 95 });
  });
  it("fallback min/max legado", () => {
    expect(getInputRange({ key: "x", label: "X", decimals: 1, min: 1, max: 99 })).toEqual({ min: 1, max: 99 });
  });
  it("default 0-100 quando nada", () => {
    expect(getInputRange({ key: "x", label: "X", decimals: 1 })).toEqual({ min: 0, max: 100 });
  });
});

describe("getInlineTarget (F4 helper)", () => {
  it("retorna target quando inline presente", () => {
    expect(getInlineTarget({ key: "x", label: "X", decimals: 1, targetMin: 18, targetMax: 26 })).toEqual({ min: 18, max: 26 });
  });
  it("retorna null quando ausente", () => {
    expect(getInlineTarget({ key: "x", label: "X", decimals: 1 })).toBeNull();
  });
});

describe("classifyVsInlineTarget (F4 helper)", () => {
  const field = { key: "vpip", label: "VPIP", decimals: 1, targetMin: 18, targetMax: 26 };
  it("below_range", () => expect(classifyVsInlineTarget(15, field)).toBe("below_range"));
  it("in_range", () => expect(classifyVsInlineTarget(22, field)).toBe("in_range"));
  it("above_range", () => expect(classifyVsInlineTarget(30, field)).toBe("above_range"));
  it("null sem target", () => expect(classifyVsInlineTarget(22, { key: "x", label: "X", decimals: 1 })).toBeNull());
});

describe("<StatsSnapshotEditor> F4", () => {
  it("renderiza target inline ao lado do label", () => {
    renderWith(layoutWithTargets);
    expect(screen.getByTestId("stat-target-vpip").textContent).toContain("28-30");
    expect(screen.getByTestId("stat-target-pfr").textContent).toContain("20-23");
  });

  it("nao renderiza target quando ausente no field", () => {
    renderWith(layoutWithTargets);
    expect(screen.queryByTestId("stat-target-wwsf")).toBeNull();
  });

  it("input de sample size por stat existe", () => {
    renderWith(layoutWithTargets);
    expect(screen.getByTestId("stat-sample-vpip")).toBeTruthy();
    expect(screen.getByTestId("stat-sample-pfr")).toBeTruthy();
  });

  it("save com sampleSize por stat envia formato V2 {value, sampleSize}", async () => {
    renderWith(layoutWithTargets);
    fireEvent.change(screen.getByTestId("stat-input-vpip"), { target: { value: "22.5" } });
    fireEvent.change(screen.getByTestId("stat-sample-vpip"), { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("snapshot-save"));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
      const payload = apiRequestMock.mock.calls[0][2];
      expect(payload.values.vpip).toEqual({ value: 22.5, sampleSize: 5000 });
    });
  });

  it("save sem sampleSize por stat envia number puro (V1)", async () => {
    renderWith(layoutWithTargets);
    fireEvent.change(screen.getByTestId("stat-input-vpip"), { target: { value: "22.5" } });
    fireEvent.click(screen.getByTestId("snapshot-save"));
    await waitFor(() => {
      const payload = apiRequestMock.mock.calls[0][2];
      expect(payload.values.vpip).toBe(22.5);
    });
  });

  it("save mixto V1 + V2 numa snapshot", async () => {
    renderWith(layoutWithTargets);
    fireEvent.change(screen.getByTestId("stat-input-vpip"), { target: { value: "22.5" } });
    fireEvent.change(screen.getByTestId("stat-sample-vpip"), { target: { value: "5000" } });
    fireEvent.change(screen.getByTestId("stat-input-pfr"), { target: { value: "18" } });
    // sem sampleSize pra pfr
    fireEvent.click(screen.getByTestId("snapshot-save"));
    await waitFor(() => {
      const payload = apiRequestMock.mock.calls[0][2];
      expect(payload.values.vpip).toEqual({ value: 22.5, sampleSize: 5000 });
      expect(payload.values.pfr).toBe(18);
    });
  });

  it("rejeita sample size negativo", async () => {
    renderWith(layoutWithTargets);
    fireEvent.change(screen.getByTestId("stat-input-vpip"), { target: { value: "22.5" } });
    fireEvent.change(screen.getByTestId("stat-sample-vpip"), { target: { value: "-5" } });
    fireEvent.click(screen.getByTestId("snapshot-save"));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Sample size invalido/i) }),
    );
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
