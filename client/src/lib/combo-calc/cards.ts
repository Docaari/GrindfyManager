import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["c", "d", "h", "s"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_BY_CHAR: Record<string, Rank> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const CHAR_BY_RANK: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const SUIT_SET = new Set<string>(SUITS);

export function isSuit(ch: string): ch is Suit {
  return SUIT_SET.has(ch);
}

export function rankChar(rank: Rank): string {
  return CHAR_BY_RANK[rank];
}

export function rankFromChar(ch: string): Rank | null {
  return RANK_BY_CHAR[ch.toUpperCase()] ?? null;
}

/** Aceita "Ah", "Td", "10c" (10 normalizado para T). Retorna null se invalido. */
export function parseCard(raw: string): Card | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // Normaliza "10x" -> "Tx".
  const norm = s.length === 3 && s.startsWith("10") ? "T" + s[2] : s;
  if (norm.length !== 2) return null;
  const rank = rankFromChar(norm[0]);
  const suit = norm[1].toLowerCase();
  if (rank == null || !isSuit(suit)) return null;
  return { rank, suit };
}

export function cardKey(c: Card): string {
  return rankChar(c.rank) + c.suit;
}

/** Chave canonica de um combo (ordem por rank desc, depois naipe). */
export function comboKey(a: Card, b: Card): string {
  const [hi, lo] =
    a.rank > b.rank || (a.rank === b.rank && a.suit <= b.suit) ? [a, b] : [b, a];
  return cardKey(hi) + cardKey(lo);
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push({ rank: r, suit: s });
  return out;
}
