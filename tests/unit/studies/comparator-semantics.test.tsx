// =============================================================================
// Sprint Stats-V2 — SnapshotComparator com direction semantics (RF-06)
//
// Red phase. Componente `SnapshotComparator` (V2) recebe 2 snapshots + layout
// e renderiza cells com:
//   - data-testid `comparator-cell-{statId}`
//   - aria-label incluindo direction
//   - className inclui `bg-green-*`|`bg-red-*`|`bg-gray-*`|`bg-orange-*`
//   - tooltip on hover (mouseenter) com direction text
//   - cells null mostram '—' + cinza + tooltip "Nao reportado"
//
// Importa `SnapshotComparatorV2` (componente V2) que ainda NAO existe.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SnapshotComparatorV2 from "../../../client/src/components/studies/SnapshotComparatorV2";

const sampleLayout = {
  id: "lyt-1",
  name: "MTT Default",
  groups: [
    {
      id: "basics",
      label: "Basicos",
      stats: [
        {
          id: "vpip",
          label: "VPIP",
          targetMin: 20,
          targetMax: 25,
          direction: "context",
          unit: "pct",
        },
        {
          id: "pfr",
          label: "PFR",
          targetMin: 16,
          targetMax: 20,
          direction: "context",
          unit: "pct",
        },
        {
          id: "wwsf_pct",
          label: "WWSF",
          targetMin: 45,
          targetMax: 55,
          direction: "higher_better",
          unit: "pct",
        },
        {
          id: "fold_vs_3bet",
          label: "Fold vs 3Bet",
          targetMin: 50,
          targetMax: 60,
          direction: "lower_better",
          unit: "pct",
        },
      ],
    },
  ],
};

const snapshotA = {
  id: "snap-a",
  capturedAt: "2026-04-01",
  values: {
    vpip: 22, // on-target
    pfr: 18, // on-target
    wwsf_pct: 50,
    fold_vs_3bet: 55,
  },
};

const snapshotB = {
  id: "snap-b",
  capturedAt: "2026-04-15",
  values: {
    vpip: 28, // off-target (context, delta+) => orange
    pfr: 30, // off-target (context, delta+) => orange
    wwsf_pct: 40, // off-target (higher_better, delta-) => red
    fold_vs_3bet: 70, // off-target (lower_better, delta+) => red
  },
};

describe("<SnapshotComparatorV2> — cell rendering", () => {
  it("renderiza cell com data-testid `comparator-cell-{statId}` para cada stat", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotA}
        snapshotB={snapshotB}
      />,
    );
    expect(screen.getByTestId("comparator-cell-vpip")).toBeTruthy();
    expect(screen.getByTestId("comparator-cell-pfr")).toBeTruthy();
    expect(screen.getByTestId("comparator-cell-wwsf_pct")).toBeTruthy();
    expect(screen.getByTestId("comparator-cell-fold_vs_3bet")).toBeTruthy();
  });

  it("aria-label de cada cell inclui direction", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotA}
        snapshotB={snapshotB}
      />,
    );
    const vpipCell = screen.getByTestId("comparator-cell-vpip");
    const ariaLabel = vpipCell.getAttribute("aria-label") || "";
    expect(ariaLabel.toLowerCase()).toMatch(/context|estilo/);
  });
});

describe("<SnapshotComparatorV2> — color semantics", () => {
  it("on-target stat (vpip A=22 alvo 20-25) renderiza green", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotA}
        snapshotB={snapshotA}
      />,
    );
    const vpipCell = screen.getByTestId("comparator-cell-vpip");
    expect(vpipCell.className).toMatch(/green/);
  });

  it("off-target context (vpip B=28 alvo 20-25) renderiza orange", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotB}
        snapshotB={snapshotB}
      />,
    );
    const vpipCell = screen.getByTestId("comparator-cell-vpip");
    expect(vpipCell.className).toMatch(/orange/);
  });

  it("off-target higher_better (wwsf_pct B=40 alvo 45-55) renderiza red", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotB}
        snapshotB={snapshotB}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-wwsf_pct");
    expect(cell.className).toMatch(/red/);
  });

  it("off-target lower_better (fold_vs_3bet B=70 alvo 50-60) renderiza red", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotB}
        snapshotB={snapshotB}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-fold_vs_3bet");
    expect(cell.className).toMatch(/red/);
  });
});

describe("<SnapshotComparatorV2> — null values", () => {
  const snapshotWithNull = {
    id: "snap-null",
    capturedAt: "2026-04-15",
    values: { vpip: null, pfr: 18 },
  };

  it("value=null renderiza '—' no cell", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotWithNull}
        snapshotB={snapshotWithNull}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-vpip");
    expect(cell.textContent).toMatch(/—|-/);
  });

  it("value=null renderiza cinza (gray)", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotWithNull}
        snapshotB={snapshotWithNull}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-vpip");
    expect(cell.className).toMatch(/gray/);
  });

  it("value=null tem aria-label/title 'Nao reportado'", () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotWithNull}
        snapshotB={snapshotWithNull}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-vpip");
    const aria = cell.getAttribute("aria-label") || "";
    const title = cell.getAttribute("title") || "";
    expect(`${aria} ${title}`.toLowerCase()).toMatch(/nao reportado|não reportado/);
  });
});

describe("<SnapshotComparatorV2> — tooltip on hover", () => {
  it("hover em context stat mostra tooltip mencionando 'estilo'", async () => {
    render(
      <SnapshotComparatorV2
        layout={sampleLayout}
        snapshotA={snapshotA}
        snapshotB={snapshotB}
      />,
    );
    const cell = screen.getByTestId("comparator-cell-vpip");
    fireEvent.mouseEnter(cell);
    // Tooltip pode aparecer como portal (Radix) ou como title attribute.
    const tooltipText = await screen.findByText(/estilo|context/i, {}, { timeout: 1500 });
    expect(tooltipText).toBeTruthy();
  });
});

describe("<SnapshotComparatorV2> — performance smoke", () => {
  it("renderiza 200 stats em <500ms (perf benchmark)", () => {
    // Build sintetico: 200 stats em 16 grupos
    const groups = Array.from({ length: 16 }, (_, gIdx) => ({
      id: `group_${gIdx}`,
      label: `Grupo ${gIdx}`,
      stats: Array.from({ length: 13 }, (_, sIdx) => ({
        id: `stat_${gIdx}_${sIdx}`,
        label: `Stat ${gIdx}.${sIdx}`,
        targetMin: 10,
        targetMax: 30,
        direction: "neutral",
        unit: "pct",
      })),
    }));
    const bigLayout = { id: "lyt-big", name: "Big", groups };
    const valuesA: Record<string, number> = {};
    const valuesB: Record<string, number> = {};
    for (const g of groups) {
      for (const s of g.stats) {
        valuesA[s.id] = 20;
        valuesB[s.id] = 22;
      }
    }
    const snapA = { id: "a", capturedAt: "x", values: valuesA };
    const snapB = { id: "b", capturedAt: "y", values: valuesB };

    const start = performance.now();
    render(
      <SnapshotComparatorV2
        layout={bigLayout}
        snapshotA={snapA}
        snapshotB={snapB}
      />,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
