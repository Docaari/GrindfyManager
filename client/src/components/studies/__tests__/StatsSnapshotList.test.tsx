import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatsSnapshotList, {
  type HudStatSnapshot,
} from "../StatsSnapshotList";
import type { HudLayout } from "../StatsSnapshotEditor";

const layout: HudLayout = {
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
        { key: "3bet", label: "3Bet", decimals: 1, suffix: "%" },
        { key: "fold_to_3bet", label: "Fold to 3Bet", decimals: 1, suffix: "%" },
      ],
    },
  ],
};

const snap = (id: string, values: Record<string, number | null>): HudStatSnapshot => ({
  id,
  layoutId: "lyt-1",
  capturedAt: "2026-04-29T12:00:00Z",
  source: "manual",
  values,
  sampleSize: 1500,
  notes: null,
});

describe("<StatsSnapshotList>", () => {
  it("empty state quando lista vazia", () => {
    render(<StatsSnapshotList snapshots={[]} layouts={[layout]} />);
    expect(screen.getByTestId("snapshots-empty")).toBeTruthy();
  });

  it("renderiza item por snapshot", () => {
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 }), snap("b", { vpip: 24.0 })]}
        layouts={[layout]}
      />,
    );
    expect(screen.getByTestId("snapshot-a")).toBeTruthy();
    expect(screen.getByTestId("snapshot-b")).toBeTruthy();
  });

  it("preview mostra 4 stats principais do layout", () => {
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5, pfr: 18.0, "3bet": 7.0, fold_to_3bet: 60.0 })]}
        layouts={[layout]}
      />,
    );
    const item = screen.getByTestId("snapshot-a");
    expect(item.textContent).toContain("vpip");
    expect(item.textContent).toContain("pfr");
    expect(item.textContent).toContain("3bet");
  });

  it("onDelete callback invocado", () => {
    const onDelete = vi.fn();
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 })]}
        layouts={[layout]}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId("snapshot-delete-a"));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("onCompare callback invocado", () => {
    const onCompare = vi.fn();
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 })]}
        layouts={[layout]}
        onCompare={onCompare}
      />,
    );
    fireEvent.click(screen.getByTestId("snapshot-compare-a"));
    expect(onCompare).toHaveBeenCalledWith("a");
  });

  it("badge sample size", () => {
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 })]}
        layouts={[layout]}
      />,
    );
    expect(screen.getByTestId("snapshot-a").textContent).toContain("1500 maos");
  });

  it("layout removido fallback label", () => {
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 })]}
        layouts={[]}
      />,
    );
    expect(screen.getByTestId("snapshot-a").textContent).toContain("Layout removido");
  });

  it("selectedForCompare destaca o item selecionado", () => {
    render(
      <StatsSnapshotList
        snapshots={[snap("a", { vpip: 22.5 }), snap("b", { vpip: 24.0 })]}
        layouts={[layout]}
        onCompare={vi.fn()}
        selectedForCompare={["a"]}
      />,
    );
    expect(screen.getByTestId("snapshot-compare-a").textContent).toContain("Selecionado");
    expect(screen.getByTestId("snapshot-compare-b").textContent).toContain("Comparar");
  });
});
