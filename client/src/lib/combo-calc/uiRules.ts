// Regras de tela da Calculadora de Combos como funcoes puras — testaveis fora do
// React. Cada uma existe porque a versao dentro do componente mentia ou calava:
//  - parseImportedFrequency: "AKo:50" virava 5000% na celula (RF-00.6).
//  - resolveCardClick: clique com bordo cheio nao fazia nada, sem dizer por que.
//  - describeSpotReadiness: range inteiro em frequencia 0 passava pelo portao e
//    produzia um FOLD vermelho de 0% (RF-00.2).
import type { Card, RangeEntry } from "./types";
import { cardKey } from "./cards";
import { clampFreq } from "./combos";

// ── RF-00.6: frequencia vinda do import ──────────────────────

export type ImportedFrequencyReason = "not_a_number" | "out_of_range";

export type ImportedFrequency =
  | { ok: true; frequency: number }
  | { ok: false; reason: ImportedFrequencyReason; raw: string };

/** Numero simples, com ponto ou virgula decimal. Recusa "1.2.3" e "NaN". */
const NUMERIC_RE = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Normaliza a frequencia na FRONTEIRA do import, nao la no fundo em `clampFreq`.
 * Valor `> 1` e lido como percentual (`50` -> `0.5`); `> 100` ou negativo e
 * RECUSADO com razao nomeada — truncar em silencio esconde um range errado.
 * `clampFreq` continua sendo a ultima linha de defesa.
 */
export function parseImportedFrequency(raw: unknown): ImportedFrequency {
  const asText = typeof raw === "string" ? raw : raw == null ? "" : String(raw);

  let n: number;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, reason: "not_a_number", raw: asText };
    n = raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    if (!NUMERIC_RE.test(t)) return { ok: false, reason: "not_a_number", raw: asText };
    n = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(n)) return { ok: false, reason: "not_a_number", raw: asText };
  } else {
    return { ok: false, reason: "not_a_number", raw: asText };
  }

  if (n < 0 || n > 100) return { ok: false, reason: "out_of_range", raw: asText };
  // 1 e a fronteira: continua sendo 100%, nao vira 1%.
  return { ok: true, frequency: n > 1 ? n / 100 : n };
}

// ── RF-00.7: clique na grade de 52 cartas ────────────────────

export type CardSlot = "board" | "hero";

export type CardClickAction =
  | { type: "add"; to: CardSlot; retargeted: boolean }
  | { type: "remove"; from: CardSlot }
  | { type: "reject"; reason: "no_room" };

const CAPACITY: Record<CardSlot, number> = { board: 5, hero: 2 };

/**
 * Decide o que um clique na grade faz. Remover vem sempre antes de qualquer
 * recusa: uma carta ja alocada sai de onde estiver mesmo com tudo cheio — senao
 * o jogador fica preso sem conseguir desfazer.
 */
export function resolveCardClick(input: {
  card: Card;
  board: Card[];
  hero: Card[];
  target: CardSlot;
}): CardClickAction {
  const key = cardKey(input.card);
  if (input.board.some((c) => cardKey(c) === key)) return { type: "remove", from: "board" };
  if (input.hero.some((c) => cardKey(c) === key)) return { type: "remove", from: "hero" };

  const sizeOf = (slot: CardSlot) =>
    slot === "board" ? input.board.length : input.hero.length;
  const other: CardSlot = input.target === "board" ? "hero" : "board";

  if (sizeOf(input.target) < CAPACITY[input.target]) {
    return { type: "add", to: input.target, retargeted: false };
  }
  if (sizeOf(other) < CAPACITY[other]) {
    return { type: "add", to: other, retargeted: true };
  }
  return { type: "reject", reason: "no_room" };
}

// ── RF-00.2: quando o spot esta pronto para virar veredito ───

export type SpotReadinessReason =
  | "board_incomplete"
  | "hero_incomplete"
  | "pot_missing"
  | "call_missing"
  | "range_empty"
  | "range_weightless";

export interface SpotReadiness {
  ready: boolean;
  reason: SpotReadinessReason | null;
}

/** Peso vivo da classe: a frequencia da classe OU qualquer override por combo. */
function entryHasWeight(e: RangeEntry): boolean {
  if (clampFreq(e.frequency) > 0) return true;
  const overrides = e.comboFreqOverrides;
  if (!overrides) return false;
  return Object.values(overrides).some((v) => clampFreq(v) > 0);
}

/**
 * O portao antigo so checava `entries.length > 0`: um range inteiro em frequencia
 * 0 entrava e a tela mostrava FOLD -EV com 0.0% de equity. Um numero errado com
 * cara de certo. A razao e nomeada para a UI escolher a mensagem certa.
 */
export function describeSpotReadiness(draft: {
  board: Card[];
  hero: Card[];
  entries: RangeEntry[];
  potCurrent: number;
  callAmount: number;
}): SpotReadiness {
  const block = (reason: SpotReadinessReason): SpotReadiness => ({ ready: false, reason });

  if (draft.board.length < 3 || draft.board.length > 5) return block("board_incomplete");
  if (draft.hero.length !== 2) return block("hero_incomplete");
  // Pote/call ausentes zeram alpha e transformam qualquer equity em "CALL +EV".
  if (!(draft.potCurrent > 0)) return block("pot_missing");
  if (!(draft.callAmount > 0)) return block("call_missing");
  if (draft.entries.length === 0) return block("range_empty");
  if (!draft.entries.some(entryHasWeight)) return block("range_weightless");

  return { ready: true, reason: null };
}
