// F2 — RF-02.5, biblioteca de ranges local (persistence.ts).
// Range salvo e SEPARADO de spot salvo: so a lista de classes, sem bordo/mao/
// apostas — aplicavel em qualquer lado (heroi ou vilao).
import { describe, it, expect, beforeEach } from "vitest";
import {
  RANGE_LIBRARY_KEY,
  loadRangeLibrary,
  persistRangeLibrary,
  type SavedRange,
} from "@/lib/combo-calc/persistence";
import type { RangeEntry } from "@/lib/combo-calc/types";

const SAMPLE_ENTRIES: RangeEntry[] = [
  { notation: "AA", kind: "pair", frequency: 1 },
  { notation: "AKs", kind: "suited", frequency: 0.5 },
];

beforeEach(() => {
  localStorage.clear();
});

describe("F2 RF-02.5 — biblioteca de ranges", () => {
  it("vazia por padrao", () => {
    expect(loadRangeLibrary()).toEqual([]);
  });

  it("persiste e recarrega um range nomeado, com entries intactas (pesos e naipes)", () => {
    const range: SavedRange = { id: "r1", name: "3bet vs BTN", savedAt: 100, entries: SAMPLE_ENTRIES };
    persistRangeLibrary([range]);
    expect(loadRangeLibrary()).toEqual([range]);
  });

  it("saneia item sem id ou sem entries em vez de derrubar a lista inteira", () => {
    localStorage.setItem(
      RANGE_LIBRARY_KEY,
      JSON.stringify([
        { id: "r1", name: "ok", savedAt: 1, entries: SAMPLE_ENTRIES },
        { name: "sem id", savedAt: 2, entries: [] },
        { id: "r2", name: "sem entries", savedAt: 3 },
        "lixo",
      ]),
    );
    const loaded = loadRangeLibrary();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("r1");
  });

  it("descarta entry individual invalida dentro de um range, sem descartar o range inteiro", () => {
    localStorage.setItem(
      RANGE_LIBRARY_KEY,
      JSON.stringify([
        {
          id: "r1",
          name: "misto",
          savedAt: 1,
          entries: [{ notation: "AA", kind: "pair", frequency: 1 }, { notation: 123 }],
        },
      ]),
    );
    const loaded = loadRangeLibrary();
    expect(loaded[0].entries).toEqual([{ notation: "AA", kind: "pair", frequency: 1 }]);
  });

  it("storage nao-array vira lista vazia", () => {
    localStorage.setItem(RANGE_LIBRARY_KEY, JSON.stringify({ not: "an array" }));
    expect(loadRangeLibrary()).toEqual([]);
  });
});
