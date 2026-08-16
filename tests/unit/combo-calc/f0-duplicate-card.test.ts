// RF-00.7 — Estados mudos ganham voz.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma 1: carta duplicada (DuplicateCardError) zera o veredito sem dizer
// nada — o catch devolve null e a informacao de QUAL carta esta repetida, que o
// erro ja carrega em `.card`, e jogada fora.
import { describe, it, expect } from "vitest";
import { DuplicateCardError, tryEvaluateSpot } from "@/lib/combo-calc/evaluateSpot";
import type { Spot } from "@/lib/combo-calc/types";
import { RIVER_SPOT, TURN_SPOT, card, cards } from "./f0-fixtures";

describe("RF-00.7 — carta duplicada diz qual carta esta repetida", () => {
  const dup: Spot = {
    ...RIVER_SPOT,
    board: cards("Ad 8h 4h 2c 5d"),
    hero: [card("Ad"), card("6s")],
  };

  it("nao lanca para a UI", () => {
    expect(() => tryEvaluateSpot(dup)).not.toThrow();
  });

  it("devolve erro nomeado em vez de veredito nulo e mudo", () => {
    const out = tryEvaluateSpot(dup);
    expect(out.verdict).toBeNull();
    expect(out.error).toEqual({ kind: "duplicate_card", card: "Ad" });
  });

  it("aponta a carta duplicada do heroi contra o heroi tambem", () => {
    const out = tryEvaluateSpot({
      ...TURN_SPOT,
      hero: [card("Ks"), card("Ks")],
    });
    expect(out.error).toEqual({ kind: "duplicate_card", card: "Ks" });
  });

  it("spot valido devolve o veredito e nenhum erro", () => {
    const out = tryEvaluateSpot(TURN_SPOT);
    expect(out.error).toBeNull();
    expect(out.verdict).not.toBeNull();
    expect(out.verdict!.decision).toBe("call");
  });

  it("erro que nao e carta duplicada continua subindo (nao engole tudo)", () => {
    expect(() =>
      tryEvaluateSpot({ ...TURN_SPOT, hero: undefined as never }),
    ).toThrow();
  });

  it("DuplicateCardError segue carregando a carta e a mensagem", () => {
    const e = new DuplicateCardError("Ad");
    expect(e.card).toBe("Ad");
    expect(e.name).toBe("DuplicateCardError");
    expect(e.message).toContain("Ad");
  });
});
