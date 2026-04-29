import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsSnapshotList, {
  type HudStatSnapshot,
  extractValue,
  extractSampleSize,
  avgSampleSize,
} from "../StatsSnapshotList";
import SnapshotComparator from "../SnapshotComparator";
import HudLayoutCustomizer from "../HudLayoutCustomizer";
import type { HudLayout } from "../StatsSnapshotEditor";

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
});

const layout: HudLayout = {
  id: "lyt-1",
  name: "PT4",
  isDefault: true,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [{ key: "vpip", label: "VPIP", decimals: 1 }],
    },
  ],
};

describe("StatsSnapshotList helpers (F4)", () => {
  it("extractValue from V1 number", () => {
    expect(extractValue(22.5)).toBe(22.5);
  });
  it("extractValue from V2 object", () => {
    expect(extractValue({ value: 22.5, sampleSize: 100 })).toBe(22.5);
  });
  it("extractValue null entry returns null", () => {
    expect(extractValue(null)).toBeNull();
  });
  it("extractSampleSize V1 number returns null", () => {
    expect(extractSampleSize(22.5)).toBeNull();
  });
  it("extractSampleSize V2 object returns sampleSize", () => {
    expect(extractSampleSize({ value: 22.5, sampleSize: 100 })).toBe(100);
  });
  it("avgSampleSize calcula media de stats com sampleSize", () => {
    const snap: HudStatSnapshot = {
      id: "s",
      layoutId: "lyt-1",
      capturedAt: "2026-04-29T12:00:00Z",
      source: "manual",
      values: {
        vpip: { value: 22, sampleSize: 1000 },
        pfr: { value: 18, sampleSize: 500 },
        wwsf: 45, // V1 sem sampleSize
      },
      sampleSize: null,
      notes: null,
    };
    expect(avgSampleSize(snap)).toBe(750);
  });
  it("avgSampleSize null quando snapshot so V1", () => {
    const snap: HudStatSnapshot = {
      id: "s",
      layoutId: "lyt-1",
      capturedAt: "2026-04-29T12:00:00Z",
      source: "manual",
      values: { vpip: 22, pfr: 18 },
      sampleSize: null,
      notes: null,
    };
    expect(avgSampleSize(snap)).toBeNull();
  });
});

describe("<StatsSnapshotList> F4", () => {
  it("badge avg n exibido quando snapshot tem sample size por stat", () => {
    const snap: HudStatSnapshot = {
      id: "s1",
      layoutId: "lyt-1",
      capturedAt: "2026-04-29T12:00:00Z",
      source: "manual",
      values: { vpip: { value: 22, sampleSize: 1000 } },
      sampleSize: null,
      notes: null,
    };
    render(<StatsSnapshotList snapshots={[snap]} layouts={[layout]} />);
    expect(screen.getByTestId("snapshot-avg-n-s1").textContent).toContain("1000");
  });

  it("badge avg n NAO exibido quando snapshot so V1 number puro", () => {
    const snap: HudStatSnapshot = {
      id: "s2",
      layoutId: "lyt-1",
      capturedAt: "2026-04-29T12:00:00Z",
      source: "manual",
      values: { vpip: 22 },
      sampleSize: 5000,
      notes: null,
    };
    render(<StatsSnapshotList snapshots={[snap]} layouts={[layout]} />);
    expect(screen.queryByTestId("snapshot-avg-n-s2")).toBeNull();
  });

  it("preview value renderiza V2 corretamente", () => {
    const snap: HudStatSnapshot = {
      id: "s3",
      layoutId: "lyt-1",
      capturedAt: "2026-04-29T12:00:00Z",
      source: "manual",
      values: { vpip: { value: 22.5, sampleSize: 100 } },
      sampleSize: null,
      notes: null,
    };
    render(<StatsSnapshotList snapshots={[snap]} layouts={[layout]} />);
    expect(screen.getByTestId("snapshot-s3").textContent).toContain("22.5");
  });
});

describe("<SnapshotComparator> F4", () => {
  function renderCmp() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SnapshotComparator open onOpenChange={vi.fn()} ids={["a", "b"]} />
      </QueryClientProvider>,
    );
  }

  const payload = {
    layoutId: "lyt-1",
    layoutName: "PT4",
    a: { id: "a", capturedAt: "2026-04-01", sampleSize: null },
    b: { id: "b", capturedAt: "2026-04-15", sampleSize: null },
    diffs: [
      {
        key: "vpip",
        a: 22.5,
        b: 24.0,
        delta: 1.5,
        aSampleSize: 1000,
        bSampleSize: 1500,
        target: { min: 28, max: 30 },
        vsTarget: "below_range" as const,
      },
      {
        key: "pfr",
        a: 18.0,
        b: 18.0,
        delta: 0,
        aSampleSize: null,
        bSampleSize: null,
        target: null,
        vsTarget: null,
      },
    ],
  };

  it("renderiza coluna Target com range", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderCmp();
    await waitFor(() => {
      expect(screen.getByTestId("compare-target-vpip").textContent).toContain("28-30");
    });
  });

  it("Target em — quando ausente", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderCmp();
    await waitFor(() => {
      expect(screen.getByTestId("compare-target-pfr").textContent).toContain("—");
    });
  });

  it("vs target below_range render arrow down + cor red", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderCmp();
    await waitFor(() => {
      const el = screen.getByTestId("compare-vs-vpip");
      expect(el.textContent).toContain("↓");
      expect(el.className).toMatch(/red/);
    });
  });

  it("vs target null exibe — em cor cinza", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderCmp();
    await waitFor(() => {
      const el = screen.getByTestId("compare-vs-pfr");
      expect(el.textContent).toContain("—");
      expect(el.className).toMatch(/gray/);
    });
  });

  it("sample sizes inline n=X exibidos quando presentes", async () => {
    apiRequestMock.mockResolvedValue(payload);
    renderCmp();
    await waitFor(() => {
      const row = screen.getByTestId("compare-row-vpip");
      expect(row.textContent).toContain("n=1000");
      expect(row.textContent).toContain("n=1500");
    });
  });
});

describe("<HudLayoutCustomizer> F4 (subGroup + targets)", () => {
  function renderCust(layout: HudLayout | null, mode: "create" | "edit") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

  it("renderiza inputs subGroup, targetMin, targetMax", () => {
    renderCust(null, "create");
    expect(screen.getByTestId("stat-subgroup-0-0")).toBeTruthy();
    expect(screen.getByTestId("stat-target-min-0-0")).toBeTruthy();
    expect(screen.getByTestId("stat-target-max-0-0")).toBeTruthy();
  });

  it("editar subGroup atualiza draft", () => {
    renderCust(null, "create");
    const sub = screen.getByTestId("stat-subgroup-0-0");
    fireEvent.change(sub, { target: { value: "limped pots" } });
    expect((sub as HTMLInputElement).value).toBe("limped pots");
  });

  it("save inclui targetMin/targetMax/subGroup no payload", async () => {
    apiRequestMock.mockResolvedValue({});
    renderCust(null, "create");
    fireEvent.change(screen.getByTestId("layout-name-input"), { target: { value: "Custom" } });
    fireEvent.change(screen.getByTestId("stat-subgroup-0-0"), { target: { value: "preflop" } });
    fireEvent.change(screen.getByTestId("stat-target-min-0-0"), { target: { value: "28" } });
    fireEvent.change(screen.getByTestId("stat-target-max-0-0"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("layout-save"));
    await waitFor(() => {
      const payload = apiRequestMock.mock.calls[0][2];
      expect(payload.sections[0].stats[0].subGroup).toBe("preflop");
      expect(payload.sections[0].stats[0].targetMin).toBe(28);
      expect(payload.sections[0].stats[0].targetMax).toBe(30);
    });
  });
});
