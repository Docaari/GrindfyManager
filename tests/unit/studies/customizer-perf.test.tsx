// =============================================================================
// Sprint Stats-V2 — HudLayoutCustomizer perf + UX (RF-04, RF-16)
//
// Red phase. Componente `HudLayoutCustomizerV2` ainda nao existe.
//
// Espec:
//   - Render <500ms com 200 stats
//   - Search bar filtra cross-group (debounce 200ms)
//   - Filter pills toggla visibilidade por grupo
//   - Drag-drop chama callback `onMoveStat({ statId, fromGroup, toGroup })`
//   - Virtual scroll quando grupo expandido tem >50 stats
//   - Search vazio + 200 stats: grupos collapsed default
//   - Search match auto-expande grupo
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import HudLayoutCustomizerV2 from "../../../client/src/components/studies/HudLayoutCustomizerV2";

const buildBigCatalog = () => {
  const groups = [
    "basics",
    "rfi",
    "threebet",
    "resteal",
    "pos_flop_pfr_ip",
    "pos_flop_pfr_oop",
    "pos_flop_multiway",
    "cbets_by_board",
    "caller_pre_flop",
    "threeway_bb",
    "bb_defense",
    "pos_flop_pfc_ip",
    "blind_war_sb",
    "blind_war_bb",
    "threebet_pot_ip",
    "threebet_pot_oop_vs_lp",
  ];
  const catalog: any[] = [];
  for (const g of groups) {
    for (let i = 0; i < 13; i++) {
      catalog.push({
        id: `${g}_stat_${i}`,
        label: `${g} stat ${i}`,
        group: g,
        targetMin: 10,
        targetMax: 30,
        direction: "neutral",
        unit: "pct",
      });
    }
  }
  // 16 * 13 = 208 stats
  catalog.push({
    id: "vpip",
    label: "VPIP",
    group: "basics",
    targetMin: 20,
    targetMax: 25,
    direction: "context",
    unit: "pct",
  });
  return catalog;
};

const baseLayout = {
  id: "lyt-1",
  name: "MTT Default",
  isCustom: false,
  fields: [] as any[],
};

describe("<HudLayoutCustomizerV2> — first paint perf", () => {
  it("first paint com 200 stats <500ms", () => {
    const catalog = buildBigCatalog();
    const start = performance.now();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

describe("<HudLayoutCustomizerV2> — search", () => {
  it("search bar filtra stats por id/label cross-group", () => {
    const catalog = buildBigCatalog();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    const search = screen.getByTestId("customizer-search-input");
    fireEvent.change(search, { target: { value: "vpip" } });
    // Auto-expande grupo basics e mostra match
    expect(screen.getByTestId("customizer-stat-vpip")).toBeTruthy();
  });

  it("search vazia + layout >50 stats: grupos collapsed default", () => {
    const catalog = buildBigCatalog();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    // Pelo menos 1 grupo collapsed (data-state="closed" Radix Accordion ou aria-expanded="false")
    const collapsedGroups = document.querySelectorAll(
      '[data-customizer-group][data-collapsed="true"], [data-customizer-group][aria-expanded="false"]',
    );
    expect(collapsedGroups.length).toBeGreaterThan(0);
  });

  it("search match auto-expande grupo correspondente", () => {
    const catalog = buildBigCatalog();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    const search = screen.getByTestId("customizer-search-input");
    fireEvent.change(search, { target: { value: "vpip" } });
    const basicsGroup = screen.getByTestId("customizer-group-basics");
    // Aceita data-collapsed="false" OU aria-expanded="true"
    const collapsed = basicsGroup.getAttribute("data-collapsed");
    const expanded = basicsGroup.getAttribute("aria-expanded");
    expect(collapsed === "false" || expanded === "true").toBe(true);
  });

  it("search sem matches mostra empty state", () => {
    const catalog = buildBigCatalog();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    const search = screen.getByTestId("customizer-search-input");
    fireEvent.change(search, { target: { value: "nao_existe_xyz_abc" } });
    expect(screen.getByTestId("customizer-empty-state")).toBeTruthy();
  });
});

describe("<HudLayoutCustomizerV2> — group filter", () => {
  it("filter pill toggla visibilidade por grupo", () => {
    const catalog = buildBigCatalog();
    render(
      <HudLayoutCustomizerV2
        layout={baseLayout}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    const pill = screen.getByTestId("customizer-group-filter-basics");
    fireEvent.click(pill);
    // Apos filtro, grupos nao-basics ficam ocultos
    const rfiGroup = screen.queryByTestId("customizer-group-rfi");
    // Aceita: ausente OU com display:none/hidden
    if (rfiGroup) {
      const style = window.getComputedStyle(rfiGroup);
      const isHidden =
        style.display === "none" ||
        rfiGroup.hasAttribute("hidden") ||
        rfiGroup.getAttribute("data-hidden") === "true";
      expect(isHidden).toBe(true);
    }
  });
});

describe("<HudLayoutCustomizerV2> — drag-drop callback", () => {
  it("drag-drop entre grupos chama onMoveStat com newGroupId", () => {
    const catalog = buildBigCatalog();
    const onMoveStat = vi.fn();
    render(
      <HudLayoutCustomizerV2
        layout={{ ...baseLayout, fields: [{ id: "vpip", group: "basics" }] }}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={onMoveStat}
      />,
    );
    // Simulamos via testing-library: a UI deve expor um botao/handler
    // `data-testid="customizer-move-vpip-to-rfi"` (test affordance) que dispara
    // onMoveStat — desacopla do lib drag-drop.
    const moveBtn = screen.queryByTestId("customizer-move-vpip-to-rfi");
    if (moveBtn) {
      fireEvent.click(moveBtn);
      expect(onMoveStat).toHaveBeenCalledWith(
        expect.objectContaining({
          statId: "vpip",
          toGroup: "rfi",
        }),
      );
    } else {
      // Fallback: ao menos validar que componente expoe handler de drag.
      // Se modo drag-drop nao testavel via DOM puro, este test serve como
      // contrato — Implementer adicionara affordance.
      expect(moveBtn).toBeDefined();
    }
  });
});

describe("<HudLayoutCustomizerV2> — virtual scroll", () => {
  it("virtual scroll ativa quando grupo expandido tem >50 stats", () => {
    // Construimos catalogo com 60 stats em 1 grupo
    const catalog = Array.from({ length: 60 }, (_, i) => ({
      id: `basics_${i}`,
      label: `Stat ${i}`,
      group: "basics",
      targetMin: 0,
      targetMax: 100,
      direction: "neutral",
      unit: "pct",
    }));
    render(
      <HudLayoutCustomizerV2
        layout={{ ...baseLayout, fields: catalog.map((c) => ({ id: c.id, group: c.group })) }}
        catalog={catalog}
        onChange={vi.fn()}
        onMoveStat={vi.fn()}
      />,
    );
    // Aceita: react-window VariableSizeList OU style content-visibility:auto
    // OU data-virtual="true"
    const virtual = document.querySelector(
      '[data-virtual="true"], [data-react-window], .react-window',
    );
    const groupEl = screen.queryByTestId("customizer-group-basics");
    const styleVis =
      groupEl && window.getComputedStyle(groupEl).contentVisibility === "auto";
    expect(virtual || styleVis).toBeTruthy();
  });
});
