import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsAnalyzerTab from "../StatsAnalyzerTab";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as any;
});

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = queryKey[0] as string;
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error("fetch error");
          return res.json();
        },
      },
    },
  });
}

function renderWith(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>,
  );
}

const layoutsResp = [
  {
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
    ],
  },
];

const snapshotsResp = [
  {
    id: "snap-a",
    layoutId: "lyt-1",
    capturedAt: "2026-04-29T12:00:00Z",
    source: "manual",
    values: { vpip: 22.5, pfr: 18.0 },
    sampleSize: 1500,
    notes: null,
  },
];

function jsonRes(payload: any) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe("<StatsAnalyzerTab>", () => {
  it("renderiza header + botao novo snapshot", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hud-layouts")) return jsonRes([]);
      if (url.startsWith("/api/hud-stat-snapshots")) return jsonRes([]);
      throw new Error("unexpected " + url);
    });
    renderWith(<StatsAnalyzerTab />);
    expect(await screen.findByTestId("stats-analyzer-tab")).toBeTruthy();
    expect(screen.getByTestId("stats-new-snapshot")).toBeTruthy();
  });

  it("estado vazio quando layouts.length=0", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hud-layouts")) return jsonRes([]);
      return jsonRes([]);
    });
    renderWith(<StatsAnalyzerTab />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-no-layouts")).toBeTruthy();
    });
  });

  it("filtro layout aparece quando layouts existem", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hud-layouts")) return jsonRes(layoutsResp);
      if (url.startsWith("/api/hud-stat-snapshots")) return jsonRes(snapshotsResp);
      return jsonRes([]);
    });
    renderWith(<StatsAnalyzerTab />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-filter-layout")).toBeTruthy();
    });
  });

  it("renderiza snapshots da query", async () => {
    // Pos Stats-V3: snapshots viraram um <Select> (data-testid=stats-active-snapshot
    // na view "grouped", default) em vez de uma lista com data-testid=snapshot-:id.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hud-layouts")) return jsonRes(layoutsResp);
      if (url.startsWith("/api/hud-stat-snapshots")) return jsonRes(snapshotsResp);
      return jsonRes([]);
    });
    renderWith(<StatsAnalyzerTab />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-active-snapshot")).toBeTruthy();
    });
    // O fetch dos snapshots aconteceu.
    expect(
      fetchMock.mock.calls.some((c: any[]) => String(c[0]).startsWith("/api/hud-stat-snapshots")),
    ).toBe(true);
  });

  it("botao Novo desabilitado se nao ha layouts", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hud-layouts")) return jsonRes([]);
      return jsonRes([]);
    });
    renderWith(<StatsAnalyzerTab />);
    await waitFor(() => {
      const btn = screen.getByTestId("stats-new-snapshot") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });
});
