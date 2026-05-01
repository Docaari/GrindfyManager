// =============================================================================
// Sprint F3 — Stats Analyzer integration tests
//
// Spec: Docs/specs/sprint-f3-stats-analyzer.md
//
// Cobertura W1:
//   - Schema validation (insertHudLayoutSchema, insertHudStatSnapshotSchema)
//   - Pure compare helper (buildSnapshotDiff)
//
// Tests do CRUD via storage (mock db) sao cobertos em tests/unit/stats-analyzer.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  insertHudLayoutSchema,
  insertHudStatSnapshotSchema,
  updateHudLayoutSchema,
  hudLayoutSectionsZodSchema,
} from "../../../shared/schema";
import {
  buildSnapshotDiff,
  collectLayoutKeys,
} from "../../../server/services/hudStatsCompare";

const baseSection = {
  label: "Pre-flop",
  sortOrder: 0,
  stats: [
    { key: "vpip", label: "VPIP", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" as const },
    { key: "pfr", label: "PFR", decimals: 1, suffix: "%", min: 0, max: 100, group: "preflop" as const },
  ],
};

describe("insertHudLayoutSchema", () => {
  it("aceita layout valido com 1 section + 2 stats", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Padrao PT4",
      sections: [baseSection],
    });
    expect(parsed.userId).toBe("USER-0001");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.isDefault).toBe(false);
  });

  it("rejeita key duplicada entre stats no mesmo layout", () => {
    expect(() =>
      insertHudLayoutSchema.parse({
        userId: "USER-0001",
        name: "Bad",
        sections: [
          baseSection,
          {
            label: "Flop",
            sortOrder: 1,
            stats: [
              { key: "vpip", label: "VPIP dup", decimals: 1 },
            ],
          },
        ],
      })
    ).toThrow();
  });

  it("rejeita key fora do padrao snake_case", () => {
    expect(() =>
      insertHudLayoutSchema.parse({
        userId: "USER-0001",
        name: "Bad",
        sections: [
          {
            label: "X",
            sortOrder: 0,
            stats: [{ key: "VPIP", label: "VPIP", decimals: 1 }],
          },
        ],
      })
    ).toThrow();
  });

  it("rejeita section sem stats", () => {
    expect(() =>
      hudLayoutSectionsZodSchema.parse([{ label: "Empty", sortOrder: 0, stats: [] }])
    ).toThrow();
  });

  it("rejeita lista vazia de sections", () => {
    expect(() => hudLayoutSectionsZodSchema.parse([])).toThrow();
  });
});

describe("insertHudStatSnapshotSchema", () => {
  it("aceita snapshot com values + sampleSize opcional", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: { vpip: 22.5, pfr: 18.0 },
      sampleSize: 1500,
    });
    expect(parsed.values.vpip).toBe(22.5);
    expect(parsed.source).toBe("manual");
    expect(parsed.sampleSize).toBe(1500);
  });

  it("default source = manual", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: { vpip: 22.5 },
    });
    expect(parsed.source).toBe("manual");
  });

  it("aceita value nullable (stat omitida)", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: { vpip: 22.5, pfr: null },
    });
    expect(parsed.values.pfr).toBeNull();
  });

  it("rejeita values vazio", () => {
    expect(() =>
      insertHudStatSnapshotSchema.parse({
        userId: "USER-0001",
        layoutId: "lyt-1",
        values: {},
      })
    ).toThrow();
  });

  it("rejeita source desconhecido", () => {
    expect(() =>
      insertHudStatSnapshotSchema.parse({
        userId: "USER-0001",
        layoutId: "lyt-1",
        values: { vpip: 1 },
        source: "scrape",
      })
    ).toThrow();
  });
});

describe("updateHudLayoutSchema", () => {
  it("aceita patch parcial (so name)", () => {
    const parsed = updateHudLayoutSchema.parse({ name: "Novo Nome" });
    expect(parsed.name).toBe("Novo Nome");
  });

  it("aceita patch isDefault sozinho", () => {
    const parsed = updateHudLayoutSchema.parse({ isDefault: true });
    expect(parsed.isDefault).toBe(true);
  });
});

describe("collectLayoutKeys", () => {
  it("retorna keys em ordem dos sections + stats", () => {
    const keys = collectLayoutKeys([
      baseSection,
      {
        label: "Flop",
        sortOrder: 1,
        stats: [{ key: "cbet_flop", label: "CBet Flop", decimals: 1 }],
      },
    ]);
    expect(keys).toEqual(["vpip", "pfr", "cbet_flop"]);
  });

  it("aceita sections null/undefined", () => {
    expect(collectLayoutKeys(undefined)).toEqual([]);
    expect(collectLayoutKeys(null as any)).toEqual([]);
  });
});

describe("buildSnapshotDiff", () => {
  const layout = {
    id: "lyt-1",
    name: "PT4",
    sections: [baseSection],
  };
  const baseSnapshot = (overrides: any) => ({
    id: "snap-x",
    userId: "USER-0001",
    layoutId: "lyt-1",
    capturedAt: new Date("2026-04-01T12:00:00Z"),
    source: "manual",
    values: {} as Record<string, number | null>,
    sampleSize: null,
    sessionId: null,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  });

  it("calcula delta numerico correto", () => {
    const a = baseSnapshot({ id: "a", values: { vpip: 22.5, pfr: 18.0 } });
    const b = baseSnapshot({ id: "b", values: { vpip: 24.0, pfr: 19.5 } });
    const out = buildSnapshotDiff(layout, a, b);
    const vpip = out.diffs.find((d) => d.key === "vpip")!;
    expect(vpip.a).toBe(22.5);
    expect(vpip.b).toBe(24.0);
    expect(vpip.delta).toBe(1.5);
  });

  it("delta null quando uma das pontas nao tem valor", () => {
    const a = baseSnapshot({ id: "a", values: { vpip: 22.5 } });
    const b = baseSnapshot({ id: "b", values: { vpip: null, pfr: 19.5 } });
    const out = buildSnapshotDiff(layout, a, b);
    const vpip = out.diffs.find((d) => d.key === "vpip")!;
    expect(vpip.delta).toBeNull();
    const pfr = out.diffs.find((d) => d.key === "pfr")!;
    expect(pfr.a).toBeNull();
    expect(pfr.b).toBe(19.5);
    expect(pfr.delta).toBeNull();
  });

  it("inclui todos os keys do layout mesmo se snapshot nao tem o stat", () => {
    const a = baseSnapshot({ id: "a", values: { vpip: 22.5 } });
    const b = baseSnapshot({ id: "b", values: { vpip: 24.0 } });
    const out = buildSnapshotDiff(layout, a, b);
    const keys = out.diffs.map((d) => d.key);
    expect(keys).toContain("vpip");
    expect(keys).toContain("pfr");
  });

  it("inclui keys orfas presentes em snapshot mas nao no layout", () => {
    const a = baseSnapshot({ id: "a", values: { vpip: 22.5, legacy_stat: 10 } });
    const b = baseSnapshot({ id: "b", values: { vpip: 24.0, legacy_stat: 11 } });
    const out = buildSnapshotDiff(layout, a, b);
    const keys = out.diffs.map((d) => d.key);
    expect(keys).toContain("legacy_stat");
  });

  it("metadata snapshot retorna correto", () => {
    const a = baseSnapshot({
      id: "a",
      sampleSize: 1500,
      values: { vpip: 22 },
    });
    const b = baseSnapshot({
      id: "b",
      sampleSize: 2000,
      values: { vpip: 24 },
    });
    const out = buildSnapshotDiff(layout, a, b);
    expect(out.layoutId).toBe("lyt-1");
    expect(out.layoutName).toBe("PT4");
    expect(out.a.sampleSize).toBe(1500);
    expect(out.b.sampleSize).toBe(2000);
  });
});
