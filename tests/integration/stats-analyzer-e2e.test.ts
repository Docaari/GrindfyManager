// =============================================================================
// Sprint F3 W5 — End-to-end test (load-bearing)
//
// Lesson 2026-04-27 (TTS wiring): unit pass + zero integration = feature
// broken em prod. Este test cobre TODA cadeia:
//   1. Cria layout via storage
//   2. Salva 2 snapshots
//   3. Compara via buildSnapshotDiff (route handler logic)
//   4. Coach tool read_user_hud_stats retorna citacao correta
//
// Storage e mocked com Map em memoria — shape REAL alinhado a hud_layouts /
// hud_stat_snapshots schema.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSnapshotDiff } from "../../server/services/hudStatsCompare";
import {
  insertHudLayoutSchema,
  insertHudStatSnapshotSchema,
} from "../../shared/schema";

interface FakeLayout {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  sections: any[];
  createdAt: Date;
  updatedAt: Date;
}

interface FakeSnapshot {
  id: string;
  userId: string;
  layoutId: string;
  capturedAt: Date;
  source: string;
  values: Record<string, number | null>;
  sampleSize: number | null;
  sessionId: string | null;
  notes: string | null;
  createdAt: Date;
}

const layoutsStore = new Map<string, FakeLayout>();
const snapshotsStore = new Map<string, FakeSnapshot>();
let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

const fakeStorage = {
  getHudLayouts: vi.fn(async (userId: string) => {
    return Array.from(layoutsStore.values())
      .filter((l) => l.userId === userId)
      .sort(
        (a, b) =>
          (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) ||
          a.name.localeCompare(b.name),
      );
  }),
  getHudLayout: vi.fn(async (id: string, userId: string) => {
    const l = layoutsStore.get(id);
    return l && l.userId === userId ? l : undefined;
  }),
  createHudLayout: vi.fn(async (input: any) => {
    const id = nextId();
    const layout: FakeLayout = {
      id,
      userId: input.userId,
      name: input.name,
      isDefault: input.isDefault ?? false,
      sections: input.sections,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (layout.isDefault) {
      for (const l of layoutsStore.values()) {
        if (l.userId === input.userId) l.isDefault = false;
      }
    }
    layoutsStore.set(id, layout);
    return layout;
  }),
  getHudStatSnapshots: vi.fn(
    async (userId: string, opts?: { layoutId?: string; limit?: number }) => {
      const all = Array.from(snapshotsStore.values()).filter(
        (s) =>
          s.userId === userId &&
          (!opts?.layoutId || s.layoutId === opts.layoutId),
      );
      all.sort(
        (a, b) =>
          new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
      );
      return all.slice(0, opts?.limit ?? 100);
    },
  ),
  getHudStatSnapshot: vi.fn(async (id: string, userId: string) => {
    const s = snapshotsStore.get(id);
    return s && s.userId === userId ? s : undefined;
  }),
  createHudStatSnapshot: vi.fn(async (input: any) => {
    const id = nextId();
    const snap: FakeSnapshot = {
      id,
      userId: input.userId,
      layoutId: input.layoutId,
      capturedAt: input.capturedAt ?? new Date(),
      source: input.source ?? "manual",
      values: input.values,
      sampleSize: input.sampleSize ?? null,
      sessionId: input.sessionId ?? null,
      notes: input.notes ?? null,
      createdAt: new Date(),
    };
    snapshotsStore.set(id, snap);
    return snap;
  }),
};

vi.mock("../../server/storage", () => ({
  storage: fakeStorage,
}));

beforeEach(() => {
  layoutsStore.clear();
  snapshotsStore.clear();
  idCounter = 0;
  vi.clearAllMocks();
});

const userId = "USER-E2E";

const baseTemplate = {
  name: "Padrao PT4 E2E",
  isDefault: true,
  sections: [
    {
      label: "Pre-flop",
      sortOrder: 0,
      stats: [
        { key: "vpip", label: "VPIP", decimals: 1, suffix: "%", min: 0, max: 100 },
        { key: "pfr", label: "PFR", decimals: 1, suffix: "%", min: 0, max: 100 },
      ],
    },
  ],
};

describe("F3 E2E — full Stats Analyzer chain", () => {
  it("create layout → save 2 snapshots → compare → Coach cita stat", async () => {
    // STEP 1: cria layout via schema validation + storage
    const layoutPayload = insertHudLayoutSchema.parse({
      ...baseTemplate,
      userId,
    });
    const layout = await fakeStorage.createHudLayout(layoutPayload);
    expect(layout.id).toBeTruthy();
    expect(layout.isDefault).toBe(true);

    // STEP 2: salva snapshot A (mais antigo)
    const snapAPayload = insertHudStatSnapshotSchema.parse({
      userId,
      layoutId: layout.id,
      capturedAt: "2026-04-15T12:00:00Z",
      values: { vpip: 20.0, pfr: 16.5 },
      sampleSize: 1000,
    });
    const snapA = await fakeStorage.createHudStatSnapshot(snapAPayload);

    // Snapshot B (mais recente)
    const snapBPayload = insertHudStatSnapshotSchema.parse({
      userId,
      layoutId: layout.id,
      capturedAt: "2026-04-29T12:00:00Z",
      values: { vpip: 23.5, pfr: 19.0 },
      sampleSize: 1500,
    });
    const snapB = await fakeStorage.createHudStatSnapshot(snapBPayload);

    expect(snapA.id).not.toBe(snapB.id);

    // STEP 3: compare logic (route handler chama getHudStatSnapshot 2x +
    // getHudLayout, depois delega para buildSnapshotDiff)
    const a = await fakeStorage.getHudStatSnapshot(snapA.id, userId);
    const b = await fakeStorage.getHudStatSnapshot(snapB.id, userId);
    const layoutForCmp = await fakeStorage.getHudLayout(layout.id, userId);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(layoutForCmp).toBeDefined();

    const diff = buildSnapshotDiff(layoutForCmp!, a!, b!);
    expect(diff.layoutName).toBe("Padrao PT4 E2E");
    const vpipDiff = diff.diffs.find((d) => d.key === "vpip")!;
    expect(vpipDiff.a).toBe(20.0);
    expect(vpipDiff.b).toBe(23.5);
    expect(vpipDiff.delta).toBe(3.5);

    // STEP 4: Coach tool read_user_hud_stats retorna citacao correta.
    // Re-mock storage para o coach tool path (importa dynamicamente storage).
    vi.resetModules();
    const layoutForCoach = layoutForCmp!;
    const snapsForCoach = [snapB, snapA]; // ordenado desc por capturedAt
    vi.doMock("../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([layoutForCoach]),
        getHudStatSnapshots: vi.fn().mockResolvedValue(snapsForCoach),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../server/coach/tools/readUserHudStats"
    );
    const coachResult: any = await freshTool.handler(
      {},
      { userId, chatSessionId: "chat-1", messageId: "msg-1" },
    );

    expect(coachResult.ok).toBe(true);
    expect(coachResult.data.layoutName).toBe("Padrao PT4 E2E");
    expect(coachResult.data.latestSnapshot.values.vpip).toBe(23.5);
    expect(coachResult.data.latestSnapshot.values.pfr).toBe(19.0);

    // delta vs media historica (mais recente vs media de 2 snapshots)
    expect(coachResult.data.deltaVsAverage.vpip).toBeDefined();
    expect(coachResult.data.deltaVsAverage.vpip.current).toBe(23.5);
    // average = (20.0 + 23.5) / 2 = 21.75
    expect(coachResult.data.deltaVsAverage.vpip.average).toBeCloseTo(21.75, 1);

    // benchmark VPIP=23.5 esta in_range [18, 26]
    expect(coachResult.data.populationBenchmark.vpip.status).toBe("in_range");
  });

  it("E2E: layout sem snapshots → Coach retorna mensagem informativa", async () => {
    const layout = await fakeStorage.createHudLayout({
      ...baseTemplate,
      userId,
    });

    vi.resetModules();
    vi.doMock("../../server/storage", () => ({
      storage: {
        getHudLayouts: vi.fn().mockResolvedValue([layout]),
        getHudStatSnapshots: vi.fn().mockResolvedValue([]),
      },
    }));
    const { readUserHudStatsTool: freshTool } = await import(
      "../../server/coach/tools/readUserHudStats"
    );
    const result: any = await freshTool.handler(
      {},
      { userId, chatSessionId: "x", messageId: "y" },
    );
    expect(result.ok).toBe(true);
    expect(result.data.latestSnapshot).toBeNull();
    expect(result.data.message).toContain("nenhum snapshot");
  });
});
