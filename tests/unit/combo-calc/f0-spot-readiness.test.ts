// RF-00.2 (parte UI) — o spot deixa de ser valido enquanto o range nao tem peso.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// CombosCalculator.tsx:332 hoje so checa `entries.length > 0`: um range inteiro
// em frequencia 0 passa pelo portao e produz um FOLD vermelho de 0%. A regra de
// "spot avaliavel" vira funcao pura no lib, testavel fora do React.
import { describe, it, expect } from "vitest";
import { describeSpotReadiness } from "@/lib/combo-calc/uiRules";
import { card, cards, entry } from "./f0-fixtures";

describe("RF-00.2 — spot deixa de ser valido enquanto o range nao tem peso", () => {
  const base = {
    board: cards("Ad 8h 4h 2c"),
    hero: [card("As"), card("6s")],
    entries: [entry("KK", 1)],
    potCurrent: 36.1,
    callAmount: 13.8,
  };

  it("draft completo com range com peso esta pronto", () => {
    expect(describeSpotReadiness(base)).toEqual({ ready: true, reason: null });
  });

  it("todas as frequencias em 0 bloqueia com razao 'range_weightless'", () => {
    const r = describeSpotReadiness({ ...base, entries: [entry("KK", 0)] });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("range_weightless");
  });

  it("frequencia negativa conta como sem peso", () => {
    const r = describeSpotReadiness({ ...base, entries: [entry("KK", -1)] });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("range_weightless");
  });

  it("range vazio bloqueia com razao propria, diferente de sem peso", () => {
    const r = describeSpotReadiness({ ...base, entries: [] });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("range_empty");
  });

  it("bordo com menos de 3 cartas bloqueia antes de olhar o range", () => {
    const r = describeSpotReadiness({ ...base, board: cards("Ad 8h"), entries: [] });
    expect(r.reason).toBe("board_incomplete");
  });

  it("heroi sem duas cartas bloqueia antes de olhar o range", () => {
    const r = describeSpotReadiness({ ...base, hero: [card("As")], entries: [] });
    expect(r.reason).toBe("hero_incomplete");
  });

  it("pote ausente bloqueia (evita alpha 0 virando CALL falso)", () => {
    const r = describeSpotReadiness({ ...base, potCurrent: 0 });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("pot_missing");
  });

  it("call ausente bloqueia", () => {
    const r = describeSpotReadiness({ ...base, callAmount: 0 });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("call_missing");
  });

  it("override por combo mantem o peso vivo mesmo com a classe em 0", () => {
    const withOverride = {
      ...base,
      entries: [
        {
          notation: "KK",
          kind: "pair" as const,
          frequency: 0,
          // chave canonica de comboKey(Kh, Ks) — rank igual, naipe crescente.
          comboFreqOverrides: { KhKs: 0.5 },
        },
      ],
    };
    expect(describeSpotReadiness(withOverride)).toEqual({ ready: true, reason: null });
  });
});
