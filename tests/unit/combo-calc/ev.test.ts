import { describe, it, expect } from "vitest";
import {
  requiredEquity,
  heroEquity,
  winningCombosNeeded,
  computeEv,
} from "@/lib/combo-calc/ev";

describe("pot odds / EV", () => {
  it("alpha = call / (pote + call)", () => {
    expect(requiredEquity(36.1, 13.8)).toBeCloseTo(13.8 / 49.9, 6);
  });
  it("alpha equivalente P/B: pote 36.1 com aposta 13.8", () => {
    // pote antes = 36.1 - 13.8 = 22.3, aposta 13.8 -> B/(P+2B)
    const P = 22.3;
    const B = 13.8;
    expect(requiredEquity(P + B, B)).toBeCloseTo(B / (P + 2 * B), 6);
  });
  it("E ponderada com chops", () => {
    expect(heroEquity(40, 60, 0)).toBeCloseTo(0.4, 6);
    expect(heroEquity(30, 50, 20)).toBeCloseTo((30 + 10) / 100, 6);
  });
  it("winningCombosNeeded C=0", () => {
    const alpha = 0.2766;
    expect(winningCombosNeeded(alpha, 49.15, 0)).toBeCloseTo(
      (alpha * 49.15) / (1 - alpha),
      4,
    );
  });
  it("computeEv decide call quando E >= alpha", () => {
    const out = computeEv({ W: 40, L: 49.15, C: 0, potCurrent: 36.1, callAmount: 13.8 });
    expect(out.decision).toBe("call");
    expect(out.evCall).toBeGreaterThan(0);
    expect(out.equityGap).toBe(0);
    expect(out.evDeficit).toBe(0);
  });
  it("computeEv decide fold quando E < alpha + reporta deficit", () => {
    const out = computeEv({ W: 10, L: 90, C: 0, potCurrent: 36.1, callAmount: 13.8 });
    expect(out.decision).toBe("fold");
    expect(out.evCall).toBeLessThan(0);
    expect(out.evDeficit).toBe(out.evCall);
    expect(out.equityGap).toBeGreaterThan(0);
  });
  it("breakeven quando E == alpha", () => {
    // construir W,L tal que E = alpha. alpha(36.1,13.8) ~ 0.27655
    const alpha = requiredEquity(36.1, 13.8);
    const L = 100;
    const W = (alpha * L) / (1 - alpha); // E = W/(W+L) = alpha
    const out = computeEv({ W, L, C: 0, potCurrent: 36.1, callAmount: 13.8 });
    expect(out.decision).toBe("breakeven");
    expect(out.evCall).toBeCloseTo(0, 4);
  });
});
