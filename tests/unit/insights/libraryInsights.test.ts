import { describe, it, expect } from "vitest";
import {
  computeLibraryInsights,
  type DimensionBucket,
} from "../../../server/insights/libraryInsights";

function bucket(over: Partial<DimensionBucket> = {}): DimensionBucket {
  return {
    dimension: "speed",
    bucketLabel: "Hyper",
    sample: 300,
    roi: 25,
    profit: 1000,
    sdProfit: 20, // SE pequeno -> CI estreito -> significante
    avgBuyin: 22,
    ...over,
  };
}

const baseline = { roi: 10, sample: 4000 };

describe("computeLibraryInsights", () => {
  it("+90% ROI off 35 samples com alta variancia -> NAO emite (CI larga)", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ sample: 35, roi: 90, sdProfit: 800, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(0);
  });

  it("+15pp off 300 samples com variancia controlada -> highlight high", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "fieldSize", bucketLabel: "pequeno", sample: 300, roi: 25, sdProfit: 20, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe("highlight");
    expect(res[0].confidence).toBe("high");
    expect(res[0].message).toContain("field pequeno");
    expect(res[0].delta).toBeGreaterThan(8);
  });

  it("-20pp off 120 samples -> leak medium", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "speed", bucketLabel: "Hyper", sample: 120, roi: -15, sdProfit: 20, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe("leak");
    expect(res[0].confidence).toBe("medium");
    expect(res[0].message).toContain("Atenção");
  });

  it("nada bate MIN_DELTA -> vazio", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ roi: 13, sdProfit: 40 }), // delta ~3pp apos shrink
      ],
    });
    expect(res).toHaveLength(0);
  });

  it("bucket abaixo do sample floor (29) -> ignorado", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [bucket({ sample: 29, roi: 80, sdProfit: 30 })],
    });
    expect(res).toHaveLength(0);
  });

  it("composite com sample 60 + delta grande -> emite", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "composite", bucketLabel: "PKO de field pequeno", sample: 60, roi: 35, sdProfit: 12, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0].dimension).toBe("composite");
    expect(res[0].message).toContain("PKO de field pequeno");
  });

  it("composite com sample 40 (< MIN_COMPOSITE_SAMPLE=50) -> suprimido", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "composite", bucketLabel: "PKO de field pequeno", sample: 40, roi: 35, sdProfit: 50 }),
      ],
    });
    expect(res).toHaveLength(0);
  });

  it("field pequeno destaque -> reason low_variance + dica de grade", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "fieldSize", bucketLabel: "pequeno", sample: 300, roi: 25, sdProfit: 20, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0].reason).toBe("low_variance");
    expect(res[0].message).toContain("variância");
    expect(res[0].message.toLowerCase()).toContain("grade");
  });

  it("field medio destaque -> low_variance; field grande -> roi", () => {
    const medio = computeLibraryInsights({
      baseline,
      buckets: [bucket({ dimension: "fieldSize", bucketLabel: "medio", sample: 300, roi: 25, sdProfit: 20, avgBuyin: 22 })],
    });
    expect(medio[0].reason).toBe("low_variance");
    const grande = computeLibraryInsights({
      baseline,
      buckets: [bucket({ dimension: "fieldSize", bucketLabel: "grande", sample: 300, roi: 25, sdProfit: 20, avgBuyin: 22 })],
    });
    expect(grande[0].reason).toBe("roi");
  });

  it("dimensao deepStack gera mensagem com 'deepstack'", () => {
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        bucket({ dimension: "deepStack", bucketLabel: "deep", sample: 200, roi: 30, sdProfit: 20, avgBuyin: 22 }),
      ],
    });
    expect(res).toHaveLength(1);
    expect(res[0].message).toContain("deepstack");
  });

  it("rankeia e limita a maxPerKind (3) por tipo", () => {
    const mk = (label: string, roi: number) =>
      bucket({ dimension: "site", bucketLabel: label, sample: 250, roi, sdProfit: 20, avgBuyin: 22 });
    const res = computeLibraryInsights({
      baseline,
      buckets: [
        mk("A", 40), mk("B", 35), mk("C", 30), mk("D", 28), // 4 highlights
        mk("E", -20), mk("F", -25), // 2 leaks
      ],
    });
    const highlights = res.filter((i) => i.kind === "highlight");
    const leaks = res.filter((i) => i.kind === "leak");
    expect(highlights).toHaveLength(3); // limitado
    expect(leaks).toHaveLength(2);
    // ranking highlight por maior delta primeiro
    expect(highlights[0].bucketLabel).toBe("A");
  });
});
