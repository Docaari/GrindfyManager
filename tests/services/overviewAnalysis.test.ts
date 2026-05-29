import { describe, it, expect } from "vitest";
import { analyzeOverview } from "../../server/services/overviewAnalysis";

function mk(over: Partial<any> = {}): any {
  return {
    site: "PokerStars",
    buyIn: "22",
    type: "PKO",
    category: "PKO",
    speed: "Regular",
    name: "Bounty Builder",
    prize: "10",
    reentries: 0,
    fieldSize: 80,
    datePlayed: "2026-05-20T18:00:00.000Z",
    playerNick: "hero",
    ...over,
  };
}

// 25 torneios de uma familia pequena-field lucrativa
function family(n: number, over: Partial<any> = {}) {
  return Array.from({ length: n }, (_, i) => mk({ ...over, datePlayed: `2026-05-${String((i % 27) + 1).padStart(2, "0")}T18:00:00.000Z` }));
}

describe("analyzeOverview", () => {
  it("agrupa por plataforma e respeita minVolume", () => {
    const res = analyzeOverview([...family(25), ...family(5, { site: "GGNetwork", name: "Speed Racer" })]);
    const sites = res.byPlatform.map((p) => p.site);
    expect(sites).toContain("PokerStars"); // 25 >= 20
    expect(sites).not.toContain("GGNetwork"); // 5 < 20 minVolume
  });

  it("familia de field pequeno lucrativa -> reason low_variance + roi", () => {
    const res = analyzeOverview(family(30, { fieldSize: 80, prize: "15" }));
    const fam = res.byPlatform[0].families[0];
    const kinds = fam.reasons.map((r) => r.kind);
    expect(kinds).toContain("roi");
    expect(kinds).toContain("low_variance");
    expect(fam.reasons.find((r) => r.kind === "low_variance")!.label).toContain("pequeno");
  });

  it("$/hora-mesa entra como reason quando cobertura >= 60% e positivo", () => {
    const withDur = family(30, { durationSeconds: 3600, prize: "20" });
    const res = analyzeOverview(withDur);
    const fam = res.byPlatform[0].families[0];
    expect(fam.profitPerTableHour).not.toBeNull();
    expect(fam.reasons.map((r) => r.kind)).toContain("profit_per_hour");
  });

  it("conta jogadores unicos do pool", () => {
    const rows = [
      ...family(20, { playerNick: "alice" }),
      ...family(20, { playerNick: "bob", name: "Bounty Builder" }),
    ];
    const res = analyzeOverview(rows);
    expect(res.uniquePlayers).toBe(2);
  });

  it("recentResults traz nick + nome + ordenado por data desc", () => {
    const res = analyzeOverview(family(25, { playerNick: "zé" }));
    const fam = res.byPlatform[0].families[0];
    expect(fam.recentResults.length).toBeGreaterThan(0);
    expect(fam.recentResults[0].playerNick).toBe("zé");
    const dates = fam.recentResults.map((r) => new Date(r.datePlayed!).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("rankeia familias por ROI desc dentro da plataforma", () => {
    // Familias DISTINTAS: tier diferente ($22 vs $55) -> 2 familias no mesmo site.
    const lowRoi = family(25, { buyIn: "22", prize: "1", name: "Daily Low" });
    const highRoi = family(25, { buyIn: "55", prize: "40", name: "Sunday High" });
    const res = analyzeOverview([...lowRoi, ...highRoi]);
    const fams = res.byPlatform[0].families;
    expect(fams.length).toBe(2);
    expect(fams[0].roi).toBeGreaterThanOrEqual(fams[1].roi);
  });
});
