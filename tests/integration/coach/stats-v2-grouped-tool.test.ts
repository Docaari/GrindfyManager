// =============================================================================
// Sprint Stats-V2 — Coach tool grouped response (RF-07, ADR-062)
//
// Red phase. Builder/handler V2 ainda nao expoe shape grouped.
//
// Espec (ADR-062):
//   {
//     groups: [
//       { id, name, stats: [{ id, label, value, target_min, target_max,
//                             delta, direction, off_target, not_reported }] }
//     ],
//     summary: {
//       total_off_target, total_on_target, total_null,
//       biggest_leak: { id, label, group, delta, direction } | null
//     }
//   }
//
// Storage shape (lesson #3): mockar com shape REAL extraido de:
//   - storage.getHudLayouts: HudLayout[] (id, name, isDefault, sections, isCustom?)
//   - storage.getHudStatSnapshots: HudStatSnapshot[] (id, layoutId, capturedAt,
//     values: Record<string, number|null>, sampleSize, source, ...)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildHudStatsPayloadV2,
  readUserHudStatsToolV2,
} from "../../../server/coach/tools/readUserHudStatsV2";

const VALID_DIRECTIONS = [
  "higher_better",
  "lower_better",
  "context",
  "neutral",
];

const sampleLayoutV2 = {
  id: "lyt-v2-1",
  name: "MTT Default V2",
  isDefault: true,
  isCustom: false,
  // V2 layout: fields agrupados por group (em vez de sections planas)
  fields: [
    {
      id: "vpip",
      label: "VPIP",
      group: "basics",
      targetMin: 20,
      targetMax: 25,
      direction: "context",
      unit: "pct",
    },
    {
      id: "pfr",
      label: "PFR",
      group: "basics",
      targetMin: 16,
      targetMax: 20,
      direction: "context",
      unit: "pct",
    },
    {
      id: "wwsf_pct",
      label: "WWSF",
      group: "basics",
      targetMin: 45,
      targetMax: 55,
      direction: "higher_better",
      unit: "pct",
    },
    {
      id: "fold_vs_3bet",
      label: "Fold vs 3Bet",
      group: "threebet",
      targetMin: 50,
      targetMax: 60,
      direction: "lower_better",
      unit: "pct",
    },
    {
      id: "rfi_btn",
      label: "RFI BTN",
      group: "rfi",
      targetMin: 40,
      targetMax: 50,
      direction: "context",
      unit: "pct",
    },
  ],
};

const sampleSnapshot = {
  id: "snap-1",
  layoutId: "lyt-v2-1",
  capturedAt: new Date("2026-04-29T12:00:00Z"),
  source: "manual",
  sampleSize: 1500,
  values: {
    vpip: 22, // on-target context
    pfr: 18, // on-target context
    wwsf_pct: 40, // off-target higher_better delta- => leak
    fold_vs_3bet: 70, // off-target lower_better delta+ => leak (delta=15)
    rfi_btn: null, // not reported
  },
  notes: null,
};

describe("buildHudStatsPayloadV2() — shape", () => {
  it("retorna { groups, summary }", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    expect(payload).toHaveProperty("groups");
    expect(payload).toHaveProperty("summary");
    expect(Array.isArray(payload.groups)).toBe(true);
  });

  it("groups respeitam ordem do catalogo (16 grupos)", () => {
    // Layout tem stats apenas de basics, threebet, rfi — grupos vazios sao
    // excluidos OU incluidos com stats=[]. Spec aceita ambos. Testamos so
    // que ordem resulta como sequencia plausivel.
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const ids = payload.groups.map((g: any) => g.id);
    // basics aparece antes de threebet (ordem do catalogo)
    expect(ids.indexOf("basics")).toBeLessThan(ids.indexOf("threebet"));
  });

  it("cada stat inclui campos esperados ADR-062", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const basics = payload.groups.find((g: any) => g.id === "basics");
    expect(basics).toBeDefined();
    const vpipStat = basics?.stats.find((s: any) => s.id === "vpip");
    expect(vpipStat).toMatchObject({
      id: "vpip",
      label: "VPIP",
      value: 22,
      target_min: 20,
      target_max: 25,
      direction: "context",
    });
    expect(typeof vpipStat?.delta).toBe("number");
    expect(typeof vpipStat?.off_target).toBe("boolean");
    expect(typeof vpipStat?.not_reported).toBe("boolean");
  });
});

describe("buildHudStatsPayloadV2() — null handling", () => {
  it("stat com value=null tem flag not_reported=true", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const rfi = payload.groups.find((g: any) => g.id === "rfi");
    const rfiBtn = rfi?.stats.find((s: any) => s.id === "rfi_btn");
    expect(rfiBtn?.not_reported).toBe(true);
    expect(rfiBtn?.value).toBeNull();
    expect(rfiBtn?.delta).toBeNull();
  });

  it("stat com value=null tem off_target=false (nao conta como leak)", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const rfi = payload.groups.find((g: any) => g.id === "rfi");
    const rfiBtn = rfi?.stats.find((s: any) => s.id === "rfi_btn");
    expect(rfiBtn?.off_target).toBe(false);
  });
});

describe("buildHudStatsPayloadV2() — delta math", () => {
  it("delta = value - midpoint(target) — signed", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const basics = payload.groups.find((g: any) => g.id === "basics");
    const vpip = basics?.stats.find((s: any) => s.id === "vpip");
    // midpoint(20,25) = 22.5; value=22 => delta = -0.5
    expect(vpip?.delta).toBeCloseTo(-0.5, 1);
  });

  it("delta positivo para value acima do max", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const threebet = payload.groups.find((g: any) => g.id === "threebet");
    const fold = threebet?.stats.find((s: any) => s.id === "fold_vs_3bet");
    // midpoint(50,60) = 55; value=70 => delta = +15
    expect(fold?.delta).toBeCloseTo(15, 1);
  });

  it("delta negativo para value abaixo do min", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    const basics = payload.groups.find((g: any) => g.id === "basics");
    const wwsf = basics?.stats.find((s: any) => s.id === "wwsf_pct");
    // midpoint(45,55) = 50; value=40 => delta = -10
    expect(wwsf?.delta).toBeCloseTo(-10, 1);
  });
});

describe("buildHudStatsPayloadV2() — summary", () => {
  it("summary.total_off_target nao conta nulls", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    // off_target esperados: wwsf_pct (delta-10), fold_vs_3bet (delta+15)
    // vpip + pfr on-target. rfi_btn null nao conta.
    expect(payload.summary.total_off_target).toBe(2);
    expect(payload.summary.total_null).toBe(1);
    expect(payload.summary.total_on_target).toBe(2);
  });

  it("summary.biggest_leak ignora stats null", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    expect(payload.summary.biggest_leak).not.toBeNull();
    // rfi_btn null nao deve aparecer como biggest_leak
    expect(payload.summary.biggest_leak?.id).not.toBe("rfi_btn");
  });

  it("summary.biggest_leak escolhe maior |delta| ponderando direction", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    // fold_vs_3bet delta=+15 (lower_better, leak grave)
    // wwsf_pct delta=-10 (higher_better, leak)
    // |15| > |10| => biggest_leak = fold_vs_3bet
    expect(payload.summary.biggest_leak?.id).toBe("fold_vs_3bet");
  });

  it("biggest_leak inclui group id", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    expect(payload.summary.biggest_leak?.group).toBe("threebet");
  });
});

describe("readUserHudStatsToolV2 descriptor", () => {
  it("nome correto + tier gate pro+", () => {
    expect(readUserHudStatsToolV2.name).toBe("read_user_hud_stats");
    expect(readUserHudStatsToolV2.gateByTier).toEqual([
      "pro",
      "premium",
      "admin",
    ]);
  });
});

describe("readUserHudStatsToolV2 handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retorna data com shape grouped quando snapshots existem", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([sampleLayoutV2]),
        getHudStatSnapshots: vi.fn().mockResolvedValue([sampleSnapshot]),
      },
    }));
    const { readUserHudStatsToolV2: tool } = await import(
      "../../../server/coach/tools/readUserHudStatsV2"
    );
    const result = await tool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty("groups");
    expect(result.data).toHaveProperty("summary");
  });

  it("retorna empty groups + summary zero quando sem snapshots", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([sampleLayoutV2]),
        getHudStatSnapshots: vi.fn().mockResolvedValue([]),
      },
    }));
    const { readUserHudStatsToolV2: tool } = await import(
      "../../../server/coach/tools/readUserHudStatsV2"
    );
    const result = await tool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    // MAJOR-5 reviewer: short-circuit garante groups=[] em vez de stats
    // not_reported para todo o catalogo. Coach economiza tokens.
    expect(result.data.groups).toEqual([]);
    expect(result.data.summary.total_off_target).toBe(0);
    expect(result.data.summary.total_on_target).toBe(0);
    expect(result.data.summary.total_null).toBe(0);
    expect(result.data.summary.biggest_leak).toBeNull();
  });
});

describe("Coach tool registry — V2 descriptor", () => {
  it("readUserHudStatsToolV2 declarada com direction enum nas stats output", () => {
    const payload = buildHudStatsPayloadV2(sampleLayoutV2, [sampleSnapshot]);
    for (const group of payload.groups) {
      for (const stat of group.stats) {
        expect(VALID_DIRECTIONS).toContain(stat.direction);
      }
    }
  });
});
