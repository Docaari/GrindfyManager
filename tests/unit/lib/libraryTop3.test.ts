/**
 * Tests for client/src/lib/libraryTop3.ts (Sprint torneios-library-grouping).
 */
import { describe, it, expect } from "vitest";
import { computeTop3, flattenSpecifics, type Top3Input } from "../../../client/src/lib/libraryTop3";

function fam(over: Partial<Top3Input> = {}): Top3Input {
  return {
    id: Math.random().toString(36).slice(2),
    groupName: "Bounty Builder",
    site: "PokerStars",
    buyInTier: "$20-29",
    avgBuyin: 22,
    timeBin: "12-14",
    volume: 50,
    roi: 10,
    avgProfit: 5,
    totalProfit: 250,
    profitPerTableHour: 12,
    durationCoverage: 0.8,
    ...over,
  };
}

describe("flattenSpecifics", () => {
  it("achata specifics e herda tier/timeBin da familia", () => {
    const groups = [
      fam({ buyInTier: "$50-70", timeBin: "20-22", specifics: [
        { ...fam(), groupName: "A", buyInTier: undefined, timeBin: undefined },
        { ...fam(), groupName: "B", buyInTier: undefined, timeBin: undefined },
      ] }),
    ];
    const flat = flattenSpecifics(groups);
    expect(flat).toHaveLength(2);
    expect(flat[0].buyInTier).toBe("$50-70");
    expect(flat[0].timeBin).toBe("20-22");
  });
  it("familia sem specifics entra como ela mesma", () => {
    expect(flattenSpecifics([fam({ groupName: "Solo" })])).toHaveLength(1);
  });
});

describe("computeTop3", () => {
  it("retorna no maximo 3 ordenados por blend", () => {
    const groups = [
      fam({ groupName: "HighVol", volume: 200, roi: 8, totalProfit: 400 }),
      fam({ groupName: "HighRoi", volume: 60, roi: 80, totalProfit: 600 }),
      fam({ groupName: "Mid", volume: 40, roi: 20, totalProfit: 200 }),
      fam({ groupName: "Low", volume: 10, roi: 2, totalProfit: 30 }),
    ];
    const top = computeTop3(groups);
    expect(top).toHaveLength(3);
    expect(top[0].blendScore).toBeGreaterThanOrEqual(top[1].blendScore);
    expect(top[1].blendScore).toBeGreaterThanOrEqual(top[2].blendScore);
  });

  it("guard de amostra: ignora volume<5 quando ha >=3 qualificados", () => {
    const groups = [
      fam({ groupName: "Q1", volume: 50 }),
      fam({ groupName: "Q2", volume: 40 }),
      fam({ groupName: "Q3", volume: 30 }),
      fam({ groupName: "Noise", volume: 1, roi: 999, totalProfit: 99999 }),
    ];
    const top = computeTop3(groups);
    expect(top.map((t) => t.groupName)).not.toContain("Noise");
  });

  it("relaxa guard quando <3 qualificados (nunca vazio com dados)", () => {
    const groups = [fam({ volume: 2 }), fam({ volume: 1 })];
    const top = computeTop3(groups);
    expect(top.length).toBe(2);
  });

  it("exclui outlier lowConfidence (poucos jogos) quando ha >=3 confiantes", () => {
    const groups = [
      fam({ groupName: "Grind1", volume: 2000, roi: 15 }),
      fam({ groupName: "Grind2", volume: 900, roi: 30 }),
      fam({ groupName: "Grind3", volume: 500, roi: 12 }),
      fam({ groupName: "Outlier", volume: 24, roi: 1477, totalProfit: 99999, lowConfidence: true }),
    ];
    const top = computeTop3(groups);
    expect(top.map((t) => t.groupName)).not.toContain("Outlier");
  });

  it("vazio -> []", () => {
    expect(computeTop3([])).toEqual([]);
  });

  it("freq domina entre ROIs iguais", () => {
    const groups = [
      fam({ groupName: "Big", volume: 300, roi: 10, totalProfit: 300 }),
      fam({ groupName: "Small", volume: 10, roi: 10, totalProfit: 300 }),
    ];
    const top = computeTop3(groups);
    expect(top[0].groupName).toBe("Big");
  });
});
