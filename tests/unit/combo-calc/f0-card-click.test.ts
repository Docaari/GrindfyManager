// RF-00.7 (parte UI) — clique em carta com o bordo cheio deixa de ser silencio.
// Spec: Docs/specs/range-lab/F0-verdade.md
//
// CombosCalculator.tsx:199-213 hoje faz `if (board.length >= 5) return;` — o
// clique nao faz absolutamente nada e a tela nao diz por que. A decisao do
// clique vira funcao pura no lib, testavel fora do React.
import { describe, it, expect } from "vitest";
import { resolveCardClick } from "@/lib/combo-calc/uiRules";
import { card, cards } from "./f0-fixtures";

describe("RF-00.7 — clique em carta com bordo cheio deixa de ser silencio", () => {
  const FULL_BOARD = cards("Ad 8h 4h 2c 5d");
  const FULL_HERO = [card("As"), card("6s")];

  it("bordo cheio com mao incompleta: a carta vai para a mao e o alvo troca", () => {
    const action = resolveCardClick({
      card: card("Kc"),
      board: FULL_BOARD,
      hero: [],
      target: "board",
    });
    expect(action).toEqual({ type: "add", to: "hero", retargeted: true });
  });

  it("mao cheia com bordo incompleto: a carta vai para o bordo e o alvo troca", () => {
    const action = resolveCardClick({
      card: card("Kc"),
      board: cards("Ad 8h 4h"),
      hero: FULL_HERO,
      target: "hero",
    });
    expect(action).toEqual({ type: "add", to: "board", retargeted: true });
  });

  it("bordo e mao cheios: recusa com razao nomeada em vez de nao fazer nada", () => {
    const action = resolveCardClick({
      card: card("Kc"),
      board: FULL_BOARD,
      hero: FULL_HERO,
      target: "board",
    });
    expect(action).toEqual({ type: "reject", reason: "no_room" });
  });

  it("alvo com espaco recebe a carta sem retarget", () => {
    const action = resolveCardClick({
      card: card("Kc"),
      board: cards("Ad 8h 4h"),
      hero: [],
      target: "board",
    });
    expect(action).toEqual({ type: "add", to: "board", retargeted: false });
  });

  it("alvo heroi com espaco recebe a carta sem retarget", () => {
    const action = resolveCardClick({
      card: card("Kc"),
      board: cards("Ad 8h 4h"),
      hero: [card("As")],
      target: "hero",
    });
    expect(action).toEqual({ type: "add", to: "hero", retargeted: false });
  });

  it("clicar carta ja no bordo remove do bordo", () => {
    const action = resolveCardClick({
      card: card("8h"),
      board: FULL_BOARD,
      hero: FULL_HERO,
      target: "board",
    });
    expect(action).toEqual({ type: "remove", from: "board" });
  });

  it("clicar carta ja na mao remove da mao, mesmo com tudo cheio", () => {
    const action = resolveCardClick({
      card: card("6s"),
      board: FULL_BOARD,
      hero: FULL_HERO,
      target: "hero",
    });
    expect(action).toEqual({ type: "remove", from: "hero" });
  });

  it("remover vem antes de qualquer recusa por falta de espaco", () => {
    const action = resolveCardClick({
      card: card("As"),
      board: FULL_BOARD,
      hero: FULL_HERO,
      target: "board",
    });
    expect(action.type).toBe("remove");
  });
});
