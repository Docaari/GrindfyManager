// F1 / RF-01.2 — modelo v2 do Spot e sobrevivencia do dado do jogador.
// Spec: Docs/specs/range-lab/F1-motor.md (RF-01.2, criterio de aceite 5)
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-9)
//
// Criterio de aceite 5: rascunho v1 no localStorage abre sem perda depois do
// deploy. E a chave v1 NAO e apagada — se a F1 precisar ser revertida em
// producao, o dado continua no formato que a versao anterior le.
//
// Contrato assumido (o implementer cria exatamente isto):
//   CalcStateV2  { board: Card[]; heroRange: RangeEntry[]; entries: RangeEntry[];
//                  potInput: string; callInput: string; bbInput: string }
//   SavedSpotV2  { id; name; savedAt; board: string[]; heroRange: RangeEntry[];
//                  entries: RangeEntry[]; potInput; callInput; bbInput }
//   `loadDraftV2` le a chave v2; na ausencia dela, le a v1 e converte.
//   `loadSavedSpotsV2` idem para o conjunto de spots, saneando item a item.
import { describe, it, expect, beforeEach } from "vitest";
import {
  DRAFT_KEY_V2,
  SPOTS_KEY_V2,
  loadDraftV2,
  loadSavedSpotsV2,
  migrateDraftV1ToV2,
  persistSavedSpotsV2,
  saveDraftV2,
} from "@/lib/combo-calc/persistence";
import {
  heroRangeFromHand,
  singleHeroHand,
  spotV2FromLegacy,
} from "@/lib/combo-calc/spotV2";
import { cardKey, parseCard } from "@/lib/combo-calc/cards";
import { parseNotation } from "@/lib/combo-calc/combos";
import type { Card, RangeEntry } from "@/lib/combo-calc/types";
import { LEGACY_FLOP, card, comboNotation } from "./f1-fixtures";

const DRAFT_KEY_V1 = "grindfy.comboCalc.draft.v1";
const SPOTS_KEY_V1 = "grindfy.comboCalc.spots.v1";

const DRAFT_V1 = {
  board: ["Ad", "8h", "4h"],
  hero: ["As", "6s"],
  entries: [
    { notation: "A7s", kind: "suited", frequency: 1 },
    { notation: "KK", kind: "pair", frequency: 0.5 },
  ],
  potInput: "36.1",
  callInput: "13.8",
  bbInput: "",
};

const SAVED_V1 = {
  id: "spot-1",
  name: "River A-high",
  savedAt: 1_700_000_000_000,
  board: ["Ad", "8h", "4h", "2c", "5d"],
  hero: ["As", "6s"],
  entries: [{ notation: "A7s", kind: "suited", frequency: 1 }],
  potInput: "36.1",
  callInput: "13.8",
  bbInput: "",
};

function writeRaw(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Extrai as duas cartas de uma entry `specific`, para assercao sem prender ordem. */
function cardsOfSpecific(entry: RangeEntry): string[] {
  const parsed = parseNotation(entry.notation);
  if (!parsed || parsed.kind !== "specific" || !parsed.cards) {
    throw new Error(`entry "${entry.notation}" nao e um combo especifico`);
  }
  return parsed.cards.map(cardKey).sort();
}

beforeEach(() => {
  localStorage.clear();
});

// ── chaves ───────────────────────────────────────────────────

describe("F1 D-F1-9 — chaves de storage da v2", () => {
  it("o rascunho v2 mora em grindfy.comboCalc.draft.v2", () => {
    expect(DRAFT_KEY_V2).toBe("grindfy.comboCalc.draft.v2");
  });

  it("os spots v2 moram em grindfy.comboCalc.spots.v2", () => {
    expect(SPOTS_KEY_V2).toBe("grindfy.comboCalc.spots.v2");
  });

  it("as chaves v2 sao diferentes das v1 (as duas convivem)", () => {
    expect(DRAFT_KEY_V2).not.toBe(DRAFT_KEY_V1);
    expect(SPOTS_KEY_V2).not.toBe(SPOTS_KEY_V1);
  });
});

// ── migracao do rascunho ─────────────────────────────────────

describe("F1 D-F1-9 — rascunho v1 abre sem perda (criterio de aceite 5)", () => {
  it("migrateDraftV1ToV2 converte hero: string[] em UMA entry specific de frequencia 1", () => {
    const migrated = migrateDraftV1ToV2(DRAFT_V1);
    expect(migrated, "migracao devolveu null para um rascunho v1 valido").not.toBeNull();
    expect(migrated!.heroRange).toHaveLength(1);
    const entry = migrated!.heroRange[0];
    expect(entry.kind).toBe("specific");
    expect(entry.frequency).toBe(1);
    expect(
      cardsOfSpecific(entry),
      `notacao "${entry.notation}" deveria carregar As e 6s`,
    ).toEqual(["6s", "As"].sort());
  });

  it("a migracao preserva bordo, range do vilao e os inputs", () => {
    const migrated = migrateDraftV1ToV2(DRAFT_V1)!;
    expect(migrated.board.map(cardKey)).toEqual(["Ad", "8h", "4h"]);
    expect(migrated.entries.map((e) => e.notation)).toEqual(["A7s", "KK"]);
    expect(migrated.entries[1].frequency).toBe(0.5);
    expect(migrated.potInput).toBe("36.1");
    expect(migrated.callInput).toBe("13.8");
    expect(migrated.bbInput).toBe("");
  });

  it("loadDraftV2 le a chave v1 quando a v2 ainda nao existe", () => {
    writeRaw(DRAFT_KEY_V1, DRAFT_V1);
    const loaded = loadDraftV2();
    expect(loaded, "rascunho v1 nao foi lido").not.toBeNull();
    expect(loaded!.heroRange).toHaveLength(1);
    expect(cardsOfSpecific(loaded!.heroRange![0])).toEqual(["6s", "As"].sort());
  });

  it("a chave v1 CONTINUA no storage depois da migracao (caminho de volta)", () => {
    writeRaw(DRAFT_KEY_V1, DRAFT_V1);
    loadDraftV2();
    expect(
      localStorage.getItem(DRAFT_KEY_V1),
      "apagar a v1 fecha o caminho de volta se a F1 precisar ser revertida",
    ).not.toBeNull();
  });

  it("a v2 tem precedencia quando as duas chaves existem", () => {
    writeRaw(DRAFT_KEY_V1, DRAFT_V1);
    saveDraftV2({
      board: [card("Kc"), card("Qd"), card("2h")],
      heroRange: heroRangeFromHand([card("Jh"), card("Th")]),
      entries: [{ notation: "99", kind: "pair", frequency: 1 }],
      potInput: "10",
      callInput: "5",
      bbInput: "1",
    });
    const loaded = loadDraftV2()!;
    expect(loaded.board.map(cardKey)).toEqual(["Kc", "Qd", "2h"]);
    expect(cardsOfSpecific(loaded.heroRange![0])).toEqual(["Jh", "Th"].sort());
  });

  it("rascunho v1 sem heroi completo vira heroRange vazio, nao lixo", () => {
    for (const hero of [[], ["As"], ["XX", "ZZ"], "As 6s" as unknown as string[]]) {
      const migrated = migrateDraftV1ToV2({ ...DRAFT_V1, hero });
      expect(migrated, `hero=${JSON.stringify(hero)} nao deveria derrubar a migracao`).not.toBeNull();
      expect(migrated!.heroRange, `hero=${JSON.stringify(hero)}`).toEqual([]);
    }
  });

  it("entrada que nao e rascunho devolve null em vez de lancar", () => {
    for (const raw of [null, undefined, 7, "draft", true, []]) {
      expect(() => migrateDraftV1ToV2(raw)).not.toThrow();
      expect(migrateDraftV1ToV2(raw), `raw=${JSON.stringify(raw)}`).toBeNull();
    }
  });

  it("storage vazio devolve null", () => {
    expect(loadDraftV2()).toBeNull();
  });
});

// ── ida e volta da v2 ────────────────────────────────────────

describe("F1 D-F1-9 — ida e volta do rascunho v2", () => {
  it("o que foi salvo volta igual", () => {
    const state = {
      board: [card("Ad"), card("8h"), card("4h")],
      heroRange: [
        { notation: comboNotation("As", "6s"), kind: "specific" as const, frequency: 1 },
        { notation: "KK", kind: "pair" as const, frequency: 0.75 },
      ],
      entries: [{ notation: "A7s", kind: "suited" as const, frequency: 1 }],
      potInput: "36.1",
      callInput: "13.8",
      bbInput: "0.5",
    };
    saveDraftV2(state);
    const loaded = loadDraftV2()!;
    expect(loaded.board.map(cardKey)).toEqual(["Ad", "8h", "4h"]);
    expect(loaded.heroRange!.map((e) => e.notation)).toEqual(
      state.heroRange.map((e) => e.notation),
    );
    expect(loaded.heroRange![1].frequency).toBe(0.75);
    expect(loaded.entries!.map((e) => e.notation)).toEqual(["A7s"]);
    expect(loaded.potInput).toBe("36.1");
    expect(loaded.bbInput).toBe("0.5");
  });

  it("JSON invalido na chave v2 nao lanca", () => {
    localStorage.setItem(DRAFT_KEY_V2, "{isso nao e json");
    expect(() => loadDraftV2()).not.toThrow();
  });

  it("entry corrompida no heroRange e descartada, o rascunho sobrevive", () => {
    writeRaw(DRAFT_KEY_V2, {
      board: ["Ad", "8h", "4h"],
      heroRange: [
        { notation: 123, kind: "specific", frequency: 1 },
        null,
        { notation: "ZZ", kind: "pair", frequency: 1 },
        { notation: "As6s", kind: "specific", frequency: 1 },
      ],
      entries: [],
      potInput: "1",
      callInput: "1",
      bbInput: "",
    });
    const loaded = loadDraftV2()!;
    expect(loaded.heroRange!.map((e) => e.notation)).toEqual(["As6s"]);
  });
});

// ── spots salvos ─────────────────────────────────────────────

describe("F1 D-F1-9 — spots salvos v1 abrem na v2", () => {
  it("spot v1 vira spot v2 com heroRange", () => {
    writeRaw(SPOTS_KEY_V1, [SAVED_V1]);
    const [spot] = loadSavedSpotsV2();
    expect(spot, "spot v1 nao foi lido").toBeDefined();
    expect(spot.id).toBe("spot-1");
    expect(spot.name).toBe("River A-high");
    expect(spot.heroRange).toHaveLength(1);
    expect(cardsOfSpecific(spot.heroRange[0])).toEqual(["6s", "As"].sort());
    expect(spot.board).toEqual(["Ad", "8h", "4h", "2c", "5d"]);
  });

  it("item corrompido some e os validos voltam, sem lancar (comportamento da F0)", () => {
    writeRaw(SPOTS_KEY_V1, [
      42,
      null,
      "texto",
      { ...SAVED_V1, id: "board-string", board: "Ad 8h 4h" },
      SAVED_V1,
      { ...SAVED_V1, id: "sem-entries", entries: undefined },
    ]);
    expect(() => loadSavedSpotsV2()).not.toThrow();
    expect(loadSavedSpotsV2().map((s) => s.id)).toEqual(["spot-1"]);
  });

  it("a chave v1 de spots continua no storage depois da leitura", () => {
    writeRaw(SPOTS_KEY_V1, [SAVED_V1]);
    loadSavedSpotsV2();
    expect(localStorage.getItem(SPOTS_KEY_V1)).not.toBeNull();
  });

  it("ida e volta do conjunto v2", () => {
    const spots = [
      {
        id: "s1",
        name: "Range vs range",
        savedAt: 1_700_000_000_000,
        board: ["Ad", "8h", "4h"],
        heroRange: [{ notation: "KK", kind: "pair" as const, frequency: 1 }],
        entries: [{ notation: "A7s", kind: "suited" as const, frequency: 1 }],
        potInput: "36.1",
        callInput: "13.8",
        bbInput: "",
      },
    ];
    persistSavedSpotsV2(spots);
    const [back] = loadSavedSpotsV2();
    expect(back.id).toBe("s1");
    expect(back.heroRange.map((e) => e.notation)).toEqual(["KK"]);
    expect(back.entries.map((e) => e.notation)).toEqual(["A7s"]);
    expect(localStorage.getItem(SPOTS_KEY_V2)).not.toBeNull();
  });

  it("conjunto que nao e array devolve lista vazia", () => {
    writeRaw(SPOTS_KEY_V2, { nao: "array" });
    expect(loadSavedSpotsV2()).toEqual([]);
  });

  it("storage vazio devolve lista vazia", () => {
    expect(loadSavedSpotsV2()).toEqual([]);
  });
});

// ── spotV2.ts ────────────────────────────────────────────────

describe("F1 RF-01.2 — mao unica e UMA entry specific de frequencia 1", () => {
  const HERO: [Card, Card] = [parseCard("As")!, parseCard("6s")!];

  it("heroRangeFromHand produz exatamente uma entry specific", () => {
    const range = heroRangeFromHand(HERO);
    expect(range).toHaveLength(1);
    expect(range[0].kind).toBe("specific");
    expect(range[0].frequency).toBe(1);
    expect(cardsOfSpecific(range[0])).toEqual(["6s", "As"].sort());
  });

  it("singleHeroHand desfaz heroRangeFromHand (ida e volta)", () => {
    const back = singleHeroHand(heroRangeFromHand(HERO));
    expect(back, "ida e volta perdeu a mao").not.toBeNull();
    expect(back!.map(cardKey).sort()).toEqual(["6s", "As"].sort());
  });

  it("a ordem das cartas na entrada nao muda a notacao gerada", () => {
    const a = heroRangeFromHand([parseCard("As")!, parseCard("6s")!]);
    const b = heroRangeFromHand([parseCard("6s")!, parseCard("As")!]);
    expect(b[0].notation).toBe(a[0].notation);
  });

  it("singleHeroHand devolve null com mais de uma entry", () => {
    const range = [
      ...heroRangeFromHand(HERO),
      { notation: "KK", kind: "pair" as const, frequency: 1 },
    ];
    expect(singleHeroHand(range)).toBeNull();
  });

  it("singleHeroHand devolve null quando a frequencia nao e 1", () => {
    for (const frequency of [0, 0.5, 0.99]) {
      const range = heroRangeFromHand(HERO).map((e) => ({ ...e, frequency }));
      expect(singleHeroHand(range), `frequencia ${frequency}`).toBeNull();
    }
  });

  it("singleHeroHand devolve null quando a entry nao e um combo concreto", () => {
    expect(singleHeroHand([{ notation: "KK", kind: "pair", frequency: 1 }])).toBeNull();
    expect(singleHeroHand([{ notation: "A7s", kind: "suited", frequency: 1 }])).toBeNull();
    expect(singleHeroHand([])).toBeNull();
  });
});

describe("F1 RF-01.2 — spotV2FromLegacy", () => {
  it("preserva bordo, pote e call", () => {
    const v2 = spotV2FromLegacy(LEGACY_FLOP);
    expect(v2.board.map(cardKey)).toEqual(LEGACY_FLOP.board.map(cardKey));
    expect(v2.potCurrent).toBe(LEGACY_FLOP.potCurrent);
    expect(v2.callAmount).toBe(LEGACY_FLOP.callAmount);
  });

  it("transforma a mao do heroi em heroRange e mantem o range do vilao", () => {
    const v2 = spotV2FromLegacy(LEGACY_FLOP);
    expect(v2.heroRange).toHaveLength(1);
    expect(cardsOfSpecific(v2.heroRange[0])).toEqual(
      LEGACY_FLOP.hero.map(cardKey).sort(),
    );
    expect(v2.villainRange.map((e) => e.notation)).toEqual(
      LEGACY_FLOP.villainRange.map((e) => e.notation),
    );
  });

  it("o spot legado nao e mutado", () => {
    const antes = JSON.stringify(LEGACY_FLOP);
    spotV2FromLegacy(LEGACY_FLOP);
    expect(JSON.stringify(LEGACY_FLOP)).toBe(antes);
  });

  it("a conversao nao expoe mais o campo `hero` (um caminho so, RF-01.2)", () => {
    const v2 = spotV2FromLegacy(LEGACY_FLOP);
    expect((v2 as unknown as Record<string, unknown>).hero).toBeUndefined();
  });
});
