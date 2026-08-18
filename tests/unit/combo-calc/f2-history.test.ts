// F2 — historico local generico (D-F2-2, ADR-247).
// Spec: Docs/specs/range-lab/F2-range-builder.md (RF-02.1, Ctrl+Z/Ctrl+Y)
// ADR : Docs/architecture/decisions/247-range-lab-f2-range-builder.md (D-F2-2)
//
// Contrato assumido (o implementer cria exatamente isto em
// client/src/lib/combo-calc/history.ts):
//
//   export interface HistoryState<T> { past: T[]; present: T; future: T[] }
//   export const HISTORY_CAP = 50;
//   export function createHistory<T>(initial: T): HistoryState<T>;
//   export function push<T>(state: HistoryState<T>, next: T): HistoryState<T>;
//   export function undo<T>(state: HistoryState<T>): HistoryState<T>;
//   export function redo<T>(state: HistoryState<T>): HistoryState<T>;
//   export function resetHistory<T>(state: HistoryState<T>, next: T): HistoryState<T>;
//
// Modulo PURO e GENERICO — nao conhece RangeEntry, so `T`. Por isso os testes
// usam string/number como `T`, nao RangeEntry[]: o modulo nao pode importar
// nada de combo-calc alem de si mesmo (D-F2-2: "Nao conhece RangeEntry;
// conhece T").
//
// `push` != `resetHistory`: push empilha (desfazivel); resetHistory zera
// past/future (Ctrl+Z depois de um reset NAO revela o estado anterior — e o
// bug de "estado fantasma" que a D-F2-2 existe para evitar).
import { describe, it, expect } from "vitest";
import {
  createHistory,
  push,
  undo,
  redo,
  resetHistory,
  HISTORY_CAP,
  type HistoryState,
} from "@/lib/combo-calc/history";

describe("F2 D-F2-2 — createHistory", () => {
  it("comeca com past e future vazios e o valor inicial em present", () => {
    const h = createHistory("a");
    expect(h).toEqual({ past: [], present: "a", future: [] });
  });
});

describe("F2 D-F2-2 — push empilha o present anterior e limpa future", () => {
  it("push move o present atual para past e adota o novo valor", () => {
    let h = createHistory("a");
    h = push(h, "b");
    expect(h).toEqual({ past: ["a"], present: "b", future: [] });
  });

  it("push encadeado acumula em past, na ordem cronologica", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    h = push(h, "d");
    expect(h).toEqual({ past: ["a", "b", "c"], present: "d", future: [] });
  });

  it("push depois de um undo descarta o future (redo morre)", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    h = undo(h); // present=b, future=[c]
    expect(h.future).toEqual(["c"]);
    h = push(h, "d");
    expect(h).toEqual({ past: ["a", "b"], present: "d", future: [] });
  });
});

describe("F2 RF-02.1 — undo restaura o valor anterior, redo desfaz o undo", () => {
  it("undo move present para future e recupera o topo de past", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = undo(h);
    expect(h).toEqual({ past: [], present: "a", future: ["b"] });
  });

  it("dois undos seguidos voltam dois passos", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    h = undo(h);
    h = undo(h);
    expect(h).toEqual({ past: [], present: "a", future: ["b", "c"] });
  });

  it("undo com past vazio e no-op (nao lanca, nao muda o estado)", () => {
    const h = createHistory("a");
    const after = undo(h);
    expect(after).toEqual(h);
  });

  it("redo desfaz um undo, restaurando past e present", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = undo(h);
    h = redo(h);
    expect(h).toEqual({ past: ["a"], present: "b", future: [] });
  });

  it("redo com future vazio e no-op", () => {
    const h = createHistory("a");
    const after = redo(h);
    expect(after).toEqual(h);
  });

  it("undo restaura o valor EXATO anterior, inclusive objetos compostos (pesos e naipes)", () => {
    // O criterio de aceite 3 da F2 fala de RangeEntry[] inteiro, nao so notacao —
    // o modulo generico so precisa preservar `T` por referencia/valor, qualquer
    // que seja o shape. Objeto composto aqui prova que nao ha achatamento.
    type Snapshot = { notation: string; frequency: number; suits?: string[] };
    const s1: Snapshot[] = [{ notation: "AKs", frequency: 1 }];
    const s2: Snapshot[] = [
      { notation: "AKs", frequency: 0.5, suits: ["AhKh", "AsKs"] },
    ];
    let h = createHistory(s1);
    h = push(h, s2);
    h = undo(h);
    expect(h.present).toEqual(s1);
    expect(h.present[0].suits).toBeUndefined();
  });
});

describe("F2 D-F2-2 — resetHistory zera past/future (reset != push)", () => {
  it("resetHistory descarta past e future, mesmo com historico acumulado", () => {
    let h = createHistory("a");
    h = push(h, "b");
    h = push(h, "c");
    h = undo(h); // present=b, future=[c], past=[a]
    h = resetHistory(h, "z");
    expect(h).toEqual({ past: [], present: "z", future: [] });
  });

  it("Ctrl+Z logo apos um reset NAO revela o valor anterior ao reset (estado fantasma)", () => {
    let h = createHistory("spot-antigo");
    h = push(h, "edicao-1");
    h = resetHistory(h, "spot-carregado-da-biblioteca");
    const afterUndo = undo(h);
    expect(
      afterUndo.present,
      "undo depois do reset revelou o spot ANTERIOR ao reset — estado fantasma",
    ).toBe("spot-carregado-da-biblioteca");
  });
});

describe("F2 D-F2-2 — cap de 50 em past", () => {
  it("nunca deixa past crescer alem de HISTORY_CAP", () => {
    expect(HISTORY_CAP).toBe(50);
    let h: HistoryState<number> = createHistory(0);
    for (let i = 1; i <= 60; i++) h = push(h, i);
    expect(h.past).toHaveLength(50);
    expect(h.present).toBe(60);
  });

  it("ao estourar o cap, descarta os mais ANTIGOS, preserva os 50 mais recentes", () => {
    let h: HistoryState<number> = createHistory(0);
    for (let i = 1; i <= 60; i++) h = push(h, i);
    // Presents historicos foram 0..59 (60 valores) antes de virarem `past`;
    // capados a 50, sobrevivem os 50 mais recentes: 10..59.
    expect(h.past[0]).toBe(10);
    expect(h.past[h.past.length - 1]).toBe(59);
  });
});
