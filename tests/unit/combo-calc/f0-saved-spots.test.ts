// RF-00.4 — Spots salvos sanitizados por item.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// Sintoma: loadSavedSpots valida so `Array.isArray` do conjunto; item nenhum e
// checado. O render faz `s.board.join(" ")` — um item com `board` string derruba
// a pagina inteira (TypeError). Mesma classe do HIGH-1 ja corrigido no rascunho.
import { describe, it, expect, beforeEach } from "vitest";
import {
  hydrateSpot,
  loadSavedSpots,
  persistSavedSpots,
  sanitizeSavedSpot,
} from "@/lib/combo-calc/persistence";
import type { SavedSpot } from "@/lib/combo-calc/persistence";

// Chave de storage do conjunto de spots (contrato de persistencia v1).
const SPOTS_KEY = "grindfy.comboCalc.spots.v1";

function writeRaw(value: unknown): void {
  localStorage.setItem(SPOTS_KEY, JSON.stringify(value));
}

const VALID: SavedSpot = {
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

describe("RF-00.4 — loadSavedSpots descarta item corrompido sem derrubar a tela", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("item com board string nao lanca e some da lista", () => {
    writeRaw([{ ...VALID, id: "corrompido", board: "Ad 8h 4h" }]);
    expect(() => loadSavedSpots()).not.toThrow();
    expect(loadSavedSpots()).toEqual([]);
  });

  it("item valido no meio do lixo sobrevive", () => {
    writeRaw([
      42,
      null,
      "texto",
      { ...VALID, id: "sem-board", board: "Ad 8h" },
      VALID,
      { ...VALID, id: "sem-entries", entries: undefined },
    ]);
    const out = loadSavedSpots();
    expect(out.map((s) => s.id)).toEqual(["spot-1"]);
  });

  it("todo board devolvido e array de string — seguro para .join", () => {
    writeRaw([
      VALID,
      { ...VALID, id: "b", board: { "0": "Ad" } },
      { ...VALID, id: "c", board: ["Ad", 7, null, "XX", "8h"] },
    ]);
    for (const s of loadSavedSpots()) {
      expect(Array.isArray(s.board)).toBe(true);
      expect(Array.isArray(s.hero)).toBe(true);
      expect(() => s.board.join(" ")).not.toThrow();
      for (const c of s.board) expect(typeof c).toBe("string");
    }
  });

  it("cartas invalidas dentro de um board valido somem, o item continua", () => {
    writeRaw([{ ...VALID, board: ["Ad", "XX", "4h", 7] }]);
    const [s] = loadSavedSpots();
    expect(s.board).toEqual(["Ad", "4h"]);
  });

  it("entries corrompidas sao saneadas item a item, o spot continua", () => {
    writeRaw([
      {
        ...VALID,
        entries: [
          { notation: 123, kind: "x", frequency: 1 },
          null,
          { notation: "ZZ", kind: "pair", frequency: 1 },
          { notation: "A7s", kind: "suited", frequency: "abc" },
          { notation: "55", kind: "pair", frequency: 5 },
        ],
      },
    ]);
    const [s] = loadSavedSpots();
    expect(s.entries.map((e) => e.notation)).toEqual(["A7s", "55"]);
    expect(s.entries[0].frequency).toBe(1);
    expect(s.entries[1].frequency).toBe(1);
  });

  it("inputs nao-string viram string vazia em vez de vazar numero cru", () => {
    writeRaw([{ ...VALID, potInput: 36.1, callInput: null, bbInput: undefined }]);
    const [s] = loadSavedSpots();
    expect(s.potInput).toBe("");
    expect(s.callInput).toBe("");
    expect(s.bbInput).toBe("");
  });

  it("conjunto que nao e array devolve lista vazia", () => {
    writeRaw({ nao: "array" });
    expect(loadSavedSpots()).toEqual([]);
  });

  it("JSON invalido no storage devolve lista vazia sem lancar", () => {
    localStorage.setItem(SPOTS_KEY, "{isso nao e json");
    expect(() => loadSavedSpots()).not.toThrow();
    expect(loadSavedSpots()).toEqual([]);
  });

  it("storage vazio devolve lista vazia", () => {
    expect(loadSavedSpots()).toEqual([]);
  });

  it("round-trip de spot valido preserva o que importa", () => {
    persistSavedSpots([VALID]);
    const [s] = loadSavedSpots();
    expect(s.id).toBe(VALID.id);
    expect(s.name).toBe(VALID.name);
    expect(s.savedAt).toBe(VALID.savedAt);
    expect(s.board).toEqual(VALID.board);
    expect(s.hero).toEqual(VALID.hero);
    expect(s.potInput).toBe("36.1");
  });

  it("persistSavedSpots escreve na mesma chave que loadSavedSpots le", () => {
    persistSavedSpots([VALID]);
    expect(localStorage.getItem(SPOTS_KEY)).not.toBeNull();
  });
});

describe("RF-00.4 — sanitizeSavedSpot: o que e descartado e o que e corrigido", () => {
  it("descarta o que nao e objeto", () => {
    for (const raw of [null, undefined, 7, "spot", true, []]) {
      expect(sanitizeSavedSpot(raw)).toBeNull();
    }
  });

  it("descarta item sem id utilizavel (chave de React e de delete)", () => {
    expect(sanitizeSavedSpot({ ...VALID, id: undefined })).toBeNull();
    expect(sanitizeSavedSpot({ ...VALID, id: 7 })).toBeNull();
    expect(sanitizeSavedSpot({ ...VALID, id: "" })).toBeNull();
  });

  it("descarta item sem nome", () => {
    expect(sanitizeSavedSpot({ ...VALID, name: undefined })).toBeNull();
    expect(sanitizeSavedSpot({ ...VALID, name: 7 })).toBeNull();
  });

  it("descarta item cujo board/hero/entries nao sao arrays", () => {
    expect(sanitizeSavedSpot({ ...VALID, board: "Ad 8h" })).toBeNull();
    expect(sanitizeSavedSpot({ ...VALID, hero: "As 6s" })).toBeNull();
    expect(sanitizeSavedSpot({ ...VALID, entries: undefined })).toBeNull();
  });

  it("mantem spot incompleto salvo no meio da edicao (bordo curto e legitimo)", () => {
    const s = sanitizeSavedSpot({ ...VALID, board: ["Ad", "8h"], entries: [] });
    expect(s).not.toBeNull();
    expect(s!.board).toEqual(["Ad", "8h"]);
    expect(s!.entries).toEqual([]);
  });

  it("savedAt invalido vira 0 em vez de NaN na ordenacao", () => {
    const s = sanitizeSavedSpot({ ...VALID, savedAt: "ontem" })!;
    expect(s.savedAt).toBe(0);
    const s2 = sanitizeSavedSpot({ ...VALID, savedAt: NaN })!;
    expect(s2.savedAt).toBe(0);
  });

  it("aceita spot valido sem alterar os campos bons", () => {
    expect(sanitizeSavedSpot(VALID)).toEqual(VALID);
  });
});

describe("RF-00.4 — hydrateSpot entrega estado saneado, nunca o cru", () => {
  it("potInput numerico nao vaza para o estado da calculadora", () => {
    const st = hydrateSpot({ ...VALID, potInput: 36.1 as unknown as string })!;
    expect(st.potInput).toBe("");
    expect(st.potInput).not.toBe(36.1);
  });

  it("devolve os seis campos preenchidos (nao Partial)", () => {
    const st = hydrateSpot(VALID)!;
    expect(st.board.map((c) => c.rank)).toHaveLength(5);
    expect(st.hero).toHaveLength(2);
    expect(st.entries).toHaveLength(1);
    expect(st.potInput).toBe("36.1");
    expect(st.callInput).toBe("13.8");
    expect(st.bbInput).toBe("");
  });

  it("descarta carta invalida do bordo em vez de propagar undefined", () => {
    const st = hydrateSpot({ ...VALID, board: ["Ad", "XX", "4h"] })!;
    expect(st.board).toHaveLength(2);
    for (const c of st.board) expect(c).not.toBeUndefined();
  });

  it("entrada nula devolve null", () => {
    expect(hydrateSpot(null)).toBeNull();
  });
});
