// =============================================================================
// Sprint AI-2B / RF-05 (ADR-170) — cgameAggregator heurística determinística (Q-D)
//
// Cobre:
//   - classifyWarmupGame:
//     - A-game: score >= 8 + !overrideUsed + decisionToPlay=true.
//     - C-game: score <= 4 + overrideUsed=true + decisionToPlay=true.
//     - B-game: resto (incluindo decisionToPlay=false).
//   - Thresholds env CGAME_A_THRESHOLD / CGAME_C_THRESHOLD.
//   - aggregateCgameForPeriod: %A/%B/%C somam 100 (round1).
//   - sample < 8 → confidence='low'; 8-19 → 'medium'; >= 20 → 'high'.
//   - sample=0 → { aPct:0, bPct:0, cPct:0, sampleSize:0, confidence:'low' }.
//   - getInchwormSeries(months=6) → 6 entries, preenche zero quando sem dados.
//   - getCgameMovement narrative determinística (template, sem LLM).
//   - safe-deny: erro em storage → retorna empty snapshot (lesson #9).
//
// Status esperado: TODOS FALHAM.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_A = process.env.CGAME_A_THRESHOLD;
const ORIGINAL_C = process.env.CGAME_C_THRESHOLD;

beforeEach(() => {
  vi.resetModules();
  delete process.env.CGAME_A_THRESHOLD;
  delete process.env.CGAME_C_THRESHOLD;
});

afterEach(() => {
  if (ORIGINAL_A === undefined) delete process.env.CGAME_A_THRESHOLD;
  else process.env.CGAME_A_THRESHOLD = ORIGINAL_A;
  if (ORIGINAL_C === undefined) delete process.env.CGAME_C_THRESHOLD;
  else process.env.CGAME_C_THRESHOLD = ORIGINAL_C;
  vi.restoreAllMocks();
});

describe("classifyWarmupGame — heurística Q-D", () => {
  it("score=9 + !override + decisionToPlay=true → A", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 9,
        overrideUsed: false,
        decisionToPlay: true,
      } as any),
    ).toBe("A");
  });

  it("score=8 + !override + decisionToPlay=true → A (boundary)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 8,
        overrideUsed: false,
        decisionToPlay: true,
      } as any),
    ).toBe("A");
  });

  it("score=3 + override=true + decisionToPlay=true → C", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 3,
        overrideUsed: true,
        decisionToPlay: true,
      } as any),
    ).toBe("C");
  });

  it("score=4 + override=true + decisionToPlay=true → C (boundary)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 4,
        overrideUsed: true,
        decisionToPlay: true,
      } as any),
    ).toBe("C");
  });

  it("score=3 + override=false + decisionToPlay=true → B (sem override, score baixo mas decidiu)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 3,
        overrideUsed: false,
        decisionToPlay: true,
      } as any),
    ).toBe("B");
  });

  it("score=3 + override=true + decisionToPlay=false → B (decidiu não jogar)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 3,
        overrideUsed: true,
        decisionToPlay: false,
      } as any),
    ).toBe("B");
  });

  it("score=6 + !override + decisionToPlay=true → B (intermediário)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 6,
        overrideUsed: false,
        decisionToPlay: true,
      } as any),
    ).toBe("B");
  });

  it("score=9 + override=true + decisionToPlay=true → B (override mesmo com score alto descalifica A)", async () => {
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 9,
        overrideUsed: true,
        decisionToPlay: true,
      } as any),
    ).toBe("B");
  });
});

describe("classifyWarmupGame — env thresholds", () => {
  it("CGAME_A_THRESHOLD=7 → score=7 vira A", async () => {
    process.env.CGAME_A_THRESHOLD = "7";
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 7,
        overrideUsed: false,
        decisionToPlay: true,
      } as any),
    ).toBe("A");
  });

  it("CGAME_C_THRESHOLD=3 → score=4 + override → B (não mais C)", async () => {
    process.env.CGAME_C_THRESHOLD = "3";
    const { classifyWarmupGame } = await import(
      "../../../../server/services/cgameAggregator"
    );
    expect(
      classifyWarmupGame({
        emotionalCheckScore: 4,
        overrideUsed: true,
        decisionToPlay: true,
      } as any),
    ).toBe("B");
  });
});

describe("aggregateCgameForPeriod — %A/%B/%C soma 100", () => {
  it("mix 2A 1B 1C de 4 warm-ups → aPct=50 bPct=25 cPct=25 confidence='low' (sample < 8)", async () => {
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => [
        { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 8, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 6, overrideUsed: false, decisionToPlay: true },
        { emotionalCheckScore: 3, overrideUsed: true, decisionToPlay: true },
      ]),
    };
    const { aggregateCgameForPeriod } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const snap = await aggregateCgameForPeriod(
      "USER-1",
      { start: "2026-01-01", end: "2026-03-31" },
      storage,
    );
    expect(snap.sampleSize).toBe(4);
    expect(snap.aPct).toBe(50);
    expect(snap.bPct).toBe(25);
    expect(snap.cPct).toBe(25);
    expect(snap.aPct + snap.bPct + snap.cPct).toBe(100);
    expect(snap.confidence).toBe("low");
  });

  it("sample >= 8 < 20 → confidence='medium'", async () => {
    const rituals = Array.from({ length: 10 }, () => ({
      emotionalCheckScore: 9,
      overrideUsed: false,
      decisionToPlay: true,
    }));
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => rituals),
    };
    const { aggregateCgameForPeriod } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const snap = await aggregateCgameForPeriod(
      "USER-1",
      { start: "2026-01-01", end: "2026-03-31" },
      storage,
    );
    expect(snap.sampleSize).toBe(10);
    expect(snap.confidence).toBe("medium");
  });

  it("sample >= 20 → confidence='high'", async () => {
    const rituals = Array.from({ length: 25 }, () => ({
      emotionalCheckScore: 9,
      overrideUsed: false,
      decisionToPlay: true,
    }));
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => rituals),
    };
    const { aggregateCgameForPeriod } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const snap = await aggregateCgameForPeriod(
      "USER-1",
      { start: "2026-01-01", end: "2026-03-31" },
      storage,
    );
    expect(snap.confidence).toBe("high");
  });

  it("sampleSize=0 → snapshot empty", async () => {
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => []),
    };
    const { aggregateCgameForPeriod } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const snap = await aggregateCgameForPeriod(
      "USER-1",
      { start: "2026-01-01", end: "2026-03-31" },
      storage,
    );
    expect(snap.sampleSize).toBe(0);
    expect(snap.aPct).toBe(0);
    expect(snap.bPct).toBe(0);
    expect(snap.cPct).toBe(0);
    expect(snap.confidence).toBe("low");
  });

  it("storage erro → safe-deny snapshot empty + log (lesson #9)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => {
        throw new Error("db down");
      }),
    };
    const { aggregateCgameForPeriod } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const snap = await aggregateCgameForPeriod(
      "USER-1",
      { start: "2026-01-01", end: "2026-03-31" },
      storage,
    );
    expect(snap.sampleSize).toBe(0);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("getInchwormSeries — série mensal", () => {
  it("months=6 → retorna 6 entries", async () => {
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => []),
    };
    const { getInchwormSeries } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const series = await getInchwormSeries("USER-1", 6, storage);
    expect(series).toHaveLength(6);
    series.forEach((entry: any) => {
      expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof entry.aPct).toBe("number");
      expect(typeof entry.bPct).toBe("number");
      expect(typeof entry.cPct).toBe("number");
    });
  });
});

describe("getCgameMovement — narrative determinística", () => {
  it("aPctDelta >= 5 → narrative 'A-game subiu Xpp...'", async () => {
    const storage: any = {
      listWarmupRitualsForRange: vi.fn()
        .mockResolvedValueOnce([
          { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
          { emotionalCheckScore: 9, overrideUsed: false, decisionToPlay: true },
        ])
        .mockResolvedValueOnce([
          { emotionalCheckScore: 6, overrideUsed: false, decisionToPlay: true },
          { emotionalCheckScore: 6, overrideUsed: false, decisionToPlay: true },
        ]),
    };
    const { getCgameMovement } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const m = await getCgameMovement(
      "USER-1",
      { start: new Date("2026-04-01"), end: new Date("2026-06-30") },
      { start: new Date("2026-01-01"), end: new Date("2026-03-31") },
      storage,
    );
    expect(m.aPctDelta).toBeGreaterThanOrEqual(5);
    expect(m.narrative).toMatch(/A-game.*subiu/i);
  });

  it("aPctDelta e cPctDelta < 5 → narrative 'estável'", async () => {
    const sameRituals = [
      { emotionalCheckScore: 6, overrideUsed: false, decisionToPlay: true },
    ];
    const storage: any = {
      listWarmupRitualsForRange: vi.fn(async () => sameRituals),
    };
    const { getCgameMovement } = await import(
      "../../../../server/services/cgameAggregator"
    );
    const m = await getCgameMovement(
      "USER-1",
      { start: new Date("2026-04-01"), end: new Date("2026-06-30") },
      { start: new Date("2026-01-01"), end: new Date("2026-03-31") },
      storage,
    );
    expect(m.narrative).toMatch(/estável|estavel|stable/i);
  });
});
