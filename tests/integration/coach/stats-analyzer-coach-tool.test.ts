// =============================================================================
// Sprint F3 — Coach tool integration test
//
// ADR-052: read_user_hud_stats expoe ultimo snapshot + delta vs media + benchmark.
//
// Lesson 04-23 #3: mocks idealizados escondem bugs CRITICAL. Testamos:
//   - shape REAL do storage (HudLayout do schema)
//   - builder puro (buildHudStatsPayload) com fixture
//   - handler chama storage corretamente + erros mapeados
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildHudStatsPayload,
  readUserHudStatsTool,
} from "../../../server/coach/tools/readUserHudStats";
import {
  HUD_STATS_BENCHMARK,
  classifyVsBenchmark,
} from "../../../server/coach/tools/hudStatsBenchmark";

const fixtureLayout = {
  id: "lyt-1",
  name: "Padrao PT4",
  sections: [
    {
      stats: [
        { key: "vpip", label: "VPIP" },
        { key: "pfr", label: "PFR" },
        { key: "three_bet", label: "3Bet" },
      ],
    },
  ],
};

const fixtureSnapshots = [
  {
    capturedAt: new Date("2026-04-29T12:00:00Z"),
    sampleSize: 1500,
    values: { vpip: 22.5, pfr: 18.0, three_bet: 7.2 },
  },
  {
    capturedAt: new Date("2026-04-22T12:00:00Z"),
    sampleSize: 1000,
    values: { vpip: 20.0, pfr: 17.0, three_bet: 6.5 },
  },
  {
    capturedAt: new Date("2026-04-15T12:00:00Z"),
    sampleSize: 800,
    values: { vpip: 20.5, pfr: 17.5, three_bet: 7.0 },
  },
];

describe("classifyVsBenchmark", () => {
  it("retorna in_range para VPIP=22 (range [18, 26])", () => {
    expect(classifyVsBenchmark("vpip", 22)).toBe("in_range");
  });

  it("retorna below_range para VPIP=15", () => {
    expect(classifyVsBenchmark("vpip", 15)).toBe("below_range");
  });

  it("retorna above_range para VPIP=30", () => {
    expect(classifyVsBenchmark("vpip", 30)).toBe("above_range");
  });

  it("retorna null para key sem benchmark", () => {
    expect(classifyVsBenchmark("desconhecido_key", 50)).toBeNull();
  });

  it("retorna null para value null", () => {
    expect(classifyVsBenchmark("vpip", null)).toBeNull();
  });
});

describe("buildHudStatsPayload", () => {
  it("retorna ultimo snapshot ordenado por data desc", () => {
    const payload = buildHudStatsPayload(fixtureLayout, fixtureSnapshots);
    expect(payload.latestSnapshot?.values?.vpip).toBe(22.5);
    expect(payload.latestSnapshot?.sampleSize).toBe(1500);
  });

  it("calcula delta vs media historica", () => {
    const payload = buildHudStatsPayload(fixtureLayout, fixtureSnapshots);
    const vpipDelta = payload.deltaVsAverage.vpip;
    expect(vpipDelta.current).toBe(22.5);
    expect(vpipDelta.average).toBeCloseTo((22.5 + 20.0 + 20.5) / 3, 1);
    expect(vpipDelta.delta).toBeGreaterThan(0);
  });

  it("benchmark com status correto", () => {
    const payload = buildHudStatsPayload(fixtureLayout, fixtureSnapshots);
    expect(payload.populationBenchmark.vpip.status).toBe("in_range");
    expect(payload.populationBenchmark.pfr.status).toBe("in_range");
  });

  it("filtra por statKeys quando informado", () => {
    const payload = buildHudStatsPayload(fixtureLayout, fixtureSnapshots, [
      "vpip",
    ]);
    expect(payload.deltaVsAverage.vpip).toBeDefined();
    expect(payload.deltaVsAverage.pfr).toBeUndefined();
    expect(payload.latestSnapshot?.values?.vpip).toBe(22.5);
    expect(payload.latestSnapshot?.values?.pfr).toBeUndefined();
  });

  it("statKeys que nao existem no layout sao ignoradas", () => {
    const payload = buildHudStatsPayload(fixtureLayout, fixtureSnapshots, [
      "vpip",
      "fake_key",
    ]);
    expect(payload.deltaVsAverage.fake_key).toBeUndefined();
  });

  it("snapshots vazios retorna latestSnapshot null", () => {
    const payload = buildHudStatsPayload(fixtureLayout, []);
    expect(payload.latestSnapshot).toBeNull();
    expect(payload.deltaVsAverage).toEqual({});
    expect(payload.populationBenchmark).toEqual({});
  });

  it("benchmark omitido para keys sem range definido", () => {
    const layout = {
      ...fixtureLayout,
      sections: [
        {
          stats: [{ key: "custom_unknown", label: "Custom" }],
        },
      ],
    };
    const snaps = [
      {
        capturedAt: new Date(),
        sampleSize: 100,
        values: { custom_unknown: 50 },
      },
    ];
    const payload = buildHudStatsPayload(layout, snaps);
    expect(payload.populationBenchmark.custom_unknown).toBeUndefined();
  });
});

describe("readUserHudStatsTool descriptor", () => {
  it("nome correto + tier gate pro+", () => {
    expect(readUserHudStatsTool.name).toBe("read_user_hud_stats");
    expect(readUserHudStatsTool.gateByTier).toEqual([
      "pro",
      "premium",
      "admin",
    ]);
  });

  it("audit level log + nao requer confirmacao", () => {
    expect(readUserHudStatsTool.auditLevel).toBe("log");
    expect(readUserHudStatsTool.requiresConfirmation).toBe(false);
  });
});

describe("readUserHudStatsTool handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retorna no_layouts quando usuario nao tem layouts", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([]),
        getHudStatSnapshots: vi.fn(),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../../server/coach/tools/readUserHudStats"
    );
    const result = await freshTool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("no_layouts");
  });

  it("retorna mensagem informativa quando layout existe sem snapshots", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([
          { id: "lyt-1", name: "PT4", isDefault: true, sections: [] },
        ]),
        getHudStatSnapshots: vi.fn().mockResolvedValue([]),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../../server/coach/tools/readUserHudStats"
    );
    const result = await freshTool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    expect(result.data.latestSnapshot).toBeNull();
    expect(result.data.message).toContain("nenhum snapshot");
  });

  it("retorna data completa quando layout + snapshots existem", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([
          {
            id: "lyt-1",
            name: "Padrao PT4",
            isDefault: true,
            sections: fixtureLayout.sections,
          },
        ]),
        getHudStatSnapshots: vi.fn().mockResolvedValue(fixtureSnapshots),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../../server/coach/tools/readUserHudStats"
    );
    const result = await freshTool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    expect(result.data.layoutName).toBe("Padrao PT4");
    expect(result.data.latestSnapshot.values.vpip).toBe(22.5);
    expect(result.data.deltaVsAverage.vpip).toBeDefined();
    expect(result.data.populationBenchmark.vpip.status).toBe("in_range");
  });

  it("layoutName case-insensitive selection", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([
          { id: "lyt-pt4", name: "Padrao PT4", isDefault: true, sections: [] },
          { id: "lyt-hm3", name: "Padrao HM3", isDefault: false, sections: [] },
        ]),
        getHudStatSnapshots: vi.fn().mockResolvedValue([]),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../../server/coach/tools/readUserHudStats"
    );
    const result = await freshTool.handler(
      { layoutName: "padrao hm3" },
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    expect(result.data.layoutId).toBe("lyt-hm3");
  });

  it("storage error retorna ok=false com codigo storage_error", async () => {
    vi.doMock("../../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockRejectedValue(new Error("db down")),
        getHudStatSnapshots: vi.fn(),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../../server/coach/tools/readUserHudStats"
    );
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await freshTool.handler(
      {},
      { userId: "USER-0001", chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("storage_error");
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });
});

describe("HUD_STATS_BENCHMARK fixture parity", () => {
  it("contem keys esperadas dos templates", () => {
    expect(HUD_STATS_BENCHMARK.vpip).toBeDefined();
    expect(HUD_STATS_BENCHMARK.pfr).toBeDefined();
    expect(HUD_STATS_BENCHMARK.three_bet).toBeDefined();
    expect(HUD_STATS_BENCHMARK.cbet_flop).toBeDefined();
    expect(HUD_STATS_BENCHMARK.fold_to_three_bet).toBeDefined();
  });
});
