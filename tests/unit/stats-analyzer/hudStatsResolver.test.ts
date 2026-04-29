// =============================================================================
// Sprint F4 W1 — pure helpers tests
//
// Cobre: assignConfidence, normalizeSnapshotValues, resolveTarget,
//        classifyVsTarget, computeWeightedAverage.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  assignConfidence,
  normalizeSnapshotValues,
  resolveTarget,
  classifyVsTarget,
  computeWeightedAverage,
  HUD_SAMPLE_SIZE_THRESHOLDS,
  type KnowledgeBaseLookup,
} from "../../../server/services/hudStatsResolver";

describe("assignConfidence", () => {
  it("low quando sampleSize < 30", () => {
    expect(assignConfidence(0)).toBe("low");
    expect(assignConfidence(29)).toBe("low");
  });

  it("medium quando 30 <= sampleSize < 100", () => {
    expect(assignConfidence(30)).toBe("medium");
    expect(assignConfidence(99)).toBe("medium");
  });

  it("high quando sampleSize >= 100", () => {
    expect(assignConfidence(100)).toBe("high");
    expect(assignConfidence(5000)).toBe("high");
  });

  it("low quando sampleSize null/undefined", () => {
    expect(assignConfidence(null)).toBe("low");
    expect(assignConfidence(undefined)).toBe("low");
  });

  it("thresholds expostos como const", () => {
    expect(HUD_SAMPLE_SIZE_THRESHOLDS.highMin).toBe(100);
    expect(HUD_SAMPLE_SIZE_THRESHOLDS.mediumMin).toBe(30);
  });
});

describe("normalizeSnapshotValues", () => {
  it("V1 number puro vira { value, sampleSize: null }", () => {
    const out = normalizeSnapshotValues({ vpip: 22.5, pfr: 18.0 });
    expect(out.vpip).toEqual({ value: 22.5, sampleSize: null });
    expect(out.pfr).toEqual({ value: 18.0, sampleSize: null });
  });

  it("V2 object preservado", () => {
    const out = normalizeSnapshotValues({
      vpip: { value: 22.5, sampleSize: 5000 },
    });
    expect(out.vpip).toEqual({ value: 22.5, sampleSize: 5000 });
  });

  it("null vira { value: null, sampleSize: null }", () => {
    const out = normalizeSnapshotValues({ vpip: null });
    expect(out.vpip).toEqual({ value: null, sampleSize: null });
  });

  it("formato mixto V1 + V2 numa snapshot", () => {
    const out = normalizeSnapshotValues({
      vpip: 22.5,
      rare: { value: 99, sampleSize: 2 },
      missing: null,
    });
    expect(out.vpip.sampleSize).toBeNull();
    expect(out.rare.sampleSize).toBe(2);
    expect(out.missing.value).toBeNull();
  });

  it("sampleSize negativo virou null (defensivo)", () => {
    const out = normalizeSnapshotValues({
      vpip: { value: 22, sampleSize: -10 },
    });
    expect(out.vpip.sampleSize).toBeNull();
  });

  it("entrada null/undefined retorna {}", () => {
    expect(normalizeSnapshotValues(null)).toEqual({});
    expect(normalizeSnapshotValues(undefined)).toEqual({});
  });
});

describe("resolveTarget", () => {
  const kb: KnowledgeBaseLookup = {
    getTarget: (key, fmt, bucket) => {
      if (key === "vpip" && fmt === "mtt-6max" && bucket === "mid") {
        return { targetMin: 18, targetMax: 26 };
      }
      return null;
    },
  };

  it("inline override tem precedencia maxima", () => {
    const r = resolveTarget(
      { key: "vpip", targetMin: 28, targetMax: 30, targetRef: "mtt-6max/mid" },
      kb,
    );
    expect(r).toEqual({ min: 28, max: 30, source: "inline" });
  });

  it("targetRef quando inline ausente", () => {
    const r = resolveTarget(
      { key: "vpip", targetRef: "mtt-6max/mid" },
      kb,
    );
    expect(r?.source).toBe("knowledge-base");
    expect(r?.min).toBe(18);
    expect(r?.max).toBe(26);
  });

  it("retorna null quando sem inline e sem ref", () => {
    expect(resolveTarget({ key: "vpip" }, kb)).toBeNull();
  });

  it("retorna null quando ref existe mas knowledge base nao tem entry", () => {
    const r = resolveTarget(
      { key: "outra_stat_inexistente", targetRef: "mtt-6max/mid" },
      kb,
    );
    expect(r).toBeNull();
  });

  it("retorna null quando ref tem formato invalido", () => {
    const r = resolveTarget(
      { key: "vpip", targetRef: "formato-sem-bucket" },
      kb,
    );
    expect(r).toBeNull();
  });

  it("sem knowledgeBase passado, so inline funciona", () => {
    const r = resolveTarget(
      { key: "vpip", targetRef: "mtt-6max/mid" },
      undefined,
    );
    expect(r).toBeNull();
  });
});

describe("classifyVsTarget", () => {
  it("below_range quando value < min", () => {
    expect(classifyVsTarget(15, 18, 26)).toBe("below_range");
  });

  it("above_range quando value > max", () => {
    expect(classifyVsTarget(30, 18, 26)).toBe("above_range");
  });

  it("in_range quando min <= value <= max", () => {
    expect(classifyVsTarget(18, 18, 26)).toBe("in_range");
    expect(classifyVsTarget(22, 18, 26)).toBe("in_range");
    expect(classifyVsTarget(26, 18, 26)).toBe("in_range");
  });

  it("null quando inputs invalidos", () => {
    expect(classifyVsTarget(null, 18, 26)).toBeNull();
    expect(classifyVsTarget(22, null, 26)).toBeNull();
    expect(classifyVsTarget(22, 18, null)).toBeNull();
  });
});

describe("computeWeightedAverage", () => {
  it("media simples quando todos sem sampleSize", () => {
    const avg = computeWeightedAverage([
      { value: 20, sampleSize: null },
      { value: 22, sampleSize: null },
      { value: 24, sampleSize: null },
    ]);
    expect(avg).toBe(22);
  });

  it("weighted quando todos tem sampleSize > 0", () => {
    // weighted: (20*5000 + 30*100) / (5000+100) = 100000+3000 / 5100 = 103000/5100
    const avg = computeWeightedAverage([
      { value: 20, sampleSize: 5000 },
      { value: 30, sampleSize: 100 },
    ]);
    expect(avg).toBeCloseTo(20.196, 2);
  });

  it("media simples (fallback) quando 1 sampleSize ausente", () => {
    const avg = computeWeightedAverage([
      { value: 20, sampleSize: 5000 },
      { value: 30, sampleSize: null },
    ]);
    // simple: (20+30)/2 = 25
    expect(avg).toBe(25);
  });

  it("ignora entradas com value null", () => {
    const avg = computeWeightedAverage([
      { value: 20, sampleSize: 100 },
      { value: null, sampleSize: 50 },
    ]);
    expect(avg).toBe(20);
  });

  it("retorna null quando todas sao null", () => {
    expect(
      computeWeightedAverage([
        { value: null, sampleSize: 100 },
        { value: null, sampleSize: 200 },
      ]),
    ).toBeNull();
  });

  it("retorna null quando lista vazia", () => {
    expect(computeWeightedAverage([])).toBeNull();
  });
});
