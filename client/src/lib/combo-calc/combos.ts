import type { Card, RangeEntry, RangeKind, Rank, Suit } from "./types";
import { SUITS, cardKey, comboKey, isSuit, rankFromChar } from "./cards";

export interface ParsedNotation {
  kind: RangeKind;
  ranks: [Rank, Rank]; // ranks (iguais para par)
  cards?: [Card, Card]; // so para specific
}

const RANK_CH = "[2-9TtJjQqKkAa]";

/**
 * Parseia notacao de range. Suporta:
 *  - par:      "55", "TT", "AA"
 *  - suited:   "A7s"
 *  - offsuit:  "76o"
 *  - anytwo:   "76"  (sem s/o, ranks distintos)
 *  - specific: "QhJh" (rank suit rank suit) ou "K7hh" (rank rank suit suit)
 * Retorna null se invalido.
 */
export function parseNotation(raw: string): ParsedNotation | null {
  if (typeof raw !== "string") return null; // defesa: dado corrompido (localStorage)
  const s = raw.trim();
  if (!s) return null;

  // specific: rank suit rank suit (ex.: QhJh)
  let m = s.match(new RegExp(`^(${RANK_CH})([cdhs])(${RANK_CH})([cdhs])$`, "i"));
  if (m) {
    const r1 = rankFromChar(m[1]);
    const r2 = rankFromChar(m[3]);
    const s1 = m[2].toLowerCase();
    const s2 = m[4].toLowerCase();
    if (r1 == null || r2 == null || !isSuit(s1) || !isSuit(s2)) return null;
    const c1: Card = { rank: r1, suit: s1 };
    const c2: Card = { rank: r2, suit: s2 };
    if (cardKey(c1) === cardKey(c2)) return null; // mesma carta duas vezes
    return { kind: "specific", ranks: [r1, r2], cards: [c1, c2] };
  }

  // specific: rank rank suit suit (ex.: K7hh)
  m = s.match(new RegExp(`^(${RANK_CH})(${RANK_CH})([cdhs])([cdhs])$`, "i"));
  if (m) {
    const r1 = rankFromChar(m[1]);
    const r2 = rankFromChar(m[2]);
    const s1 = m[3].toLowerCase();
    const s2 = m[4].toLowerCase();
    if (r1 == null || r2 == null || !isSuit(s1) || !isSuit(s2)) return null;
    const c1: Card = { rank: r1, suit: s1 };
    const c2: Card = { rank: r2, suit: s2 };
    if (cardKey(c1) === cardKey(c2)) return null;
    return { kind: "specific", ranks: [r1, r2], cards: [c1, c2] };
  }

  // suited / offsuit: rank rank [s|o]
  m = s.match(new RegExp(`^(${RANK_CH})(${RANK_CH})([soSO])$`));
  if (m) {
    const r1 = rankFromChar(m[1]);
    const r2 = rankFromChar(m[2]);
    if (r1 == null || r2 == null || r1 === r2) return null; // s/o exige ranks distintos
    const kind: RangeKind = m[3].toLowerCase() === "s" ? "suited" : "offsuit";
    return { kind, ranks: [r1, r2] };
  }

  // par ou anytwo: rank rank
  m = s.match(new RegExp(`^(${RANK_CH})(${RANK_CH})$`));
  if (m) {
    const r1 = rankFromChar(m[1]);
    const r2 = rankFromChar(m[2]);
    if (r1 == null || r2 == null) return null;
    if (r1 === r2) return { kind: "pair", ranks: [r1, r2] };
    return { kind: "anytwo", ranks: [r1, r2] };
  }

  return null;
}

function availableSuits(rank: Rank, dead: Set<string>): Suit[] {
  return SUITS.filter((su) => !dead.has(cardKey({ rank, suit: su })));
}

/**
 * Enumera os combos concretos de uma classe, ja filtrando cartas mortas
 * (bordo ∪ heroi). NUNCA usa numeros nominais — sempre enumera + remove.
 */
export function enumerateCombos(
  parsed: ParsedNotation,
  dead: Set<string>,
): [Card, Card][] {
  const out: [Card, Card][] = [];

  if (parsed.kind === "specific" && parsed.cards) {
    const [a, b] = parsed.cards;
    if (!dead.has(cardKey(a)) && !dead.has(cardKey(b))) out.push([a, b]);
    return out;
  }

  const [r1, r2] = parsed.ranks;

  if (parsed.kind === "pair") {
    const avail = availableSuits(r1, dead);
    for (let i = 0; i < avail.length; i++) {
      for (let j = i + 1; j < avail.length; j++) {
        out.push([
          { rank: r1, suit: avail[i] },
          { rank: r1, suit: avail[j] },
        ]);
      }
    }
    return out;
  }

  const wantSuited = parsed.kind === "suited" || parsed.kind === "anytwo";
  const wantOffsuit = parsed.kind === "offsuit" || parsed.kind === "anytwo";

  if (wantSuited) {
    for (const su of SUITS) {
      const a: Card = { rank: r1, suit: su };
      const b: Card = { rank: r2, suit: su };
      if (!dead.has(cardKey(a)) && !dead.has(cardKey(b))) out.push([a, b]);
    }
  }

  if (wantOffsuit) {
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (s1 === s2) continue;
        const a: Card = { rank: r1, suit: s1 };
        const b: Card = { rank: r2, suit: s2 };
        if (!dead.has(cardKey(a)) && !dead.has(cardKey(b))) out.push([a, b]);
      }
    }
  }

  return out;
}

/** Frequencia efetiva de um combo dado a entry (override por combo > classe). */
export function comboFrequency(entry: RangeEntry, combo: [Card, Card]): number {
  const ov = entry.comboFreqOverrides?.[comboKey(combo[0], combo[1])];
  return clampFreq(ov ?? entry.frequency);
}

export function clampFreq(f: number): number {
  if (!Number.isFinite(f) || f < 0) return 0;
  if (f > 1) return 1;
  return f;
}

// ── Expansao de notacao de range (formato solver: 99+, ATs+, A5s-A2s) ──
const RANK_STR = "23456789TJQKA"; // idx = forca (0..12)
function rIdx(ch: string): number {
  return RANK_STR.indexOf(ch.toUpperCase());
}
function rCh(idx: number): string {
  return RANK_STR[idx];
}

const R = "[2-9TJQKA]"; // um rank; NAO inclui X (o coringa dos atalhos AXs / XX)

/**
 * Uma regra do parser de range. A gramatica alvo (emenda A11 da F5) e maior do
 * que a F0 precisa — `55-TT`, `T9s-54s`, `AsKh` e `top X%` chegam na F2. Manter
 * as regras como uma lista ordenada e o que deixa a porta aberta: a F2 acrescenta
 * entradas aqui em vez de reabrir uma cadeia de `if` fechada em volta do `+`.
 *
 * `expand` devolve `null` para dizer "casei o formato mas este token nao e meu" —
 * o parser segue para a proxima regra. E o que permite `T9s-54s` (F2) entrar
 * ANTES de `A5s-A2s` sem que a regra de baixo precise saber da de cima.
 */
interface RangeTokenRule {
  id: string;
  pattern: RegExp;
  expand: (m: RegExpMatchArray) => string[] | null;
}

/** Sobe pares de `start` ate AA. */
function pairsFrom(start: number): string[] {
  const out: string[] = [];
  for (let i = start; i <= 12; i++) out.push(rCh(i) + rCh(i));
  return out;
}

const RANGE_TOKEN_RULES: RangeTokenRule[] = [
  {
    // "XX" — todos os pares.
    id: "all-pairs",
    pattern: /^XX$/i,
    expand: () => pairsFrom(0),
  },
  {
    // "99+" — pares subindo ate AA.
    id: "pairs-plus",
    pattern: new RegExp(`^(${R})\\1\\+$`, "i"),
    expand: (m) => pairsFrom(rIdx(m[1])),
  },
  {
    // "55-22" — intervalo de pares.
    id: "pairs-range",
    pattern: new RegExp(`^(${R})(${R})-(${R})(${R})$`, "i"),
    expand: (m) => {
      if (m[1].toUpperCase() !== m[2].toUpperCase()) return null;
      if (m[3].toUpperCase() !== m[4].toUpperCase()) return null;
      const lo = Math.min(rIdx(m[1]), rIdx(m[3]));
      const hi = Math.max(rIdx(m[1]), rIdx(m[3]));
      const out: string[] = [];
      for (let i = lo; i <= hi; i++) out.push(rCh(i) + rCh(i));
      return out;
    },
  },
  {
    // "AXs" / "KXo" — carta alta fixa, qualquer kicker abaixo dela.
    id: "any-kicker",
    pattern: new RegExp(`^(${R})X([so])$`, "i"),
    expand: (m) => {
      const high = rIdx(m[1]);
      if (high <= 0) return null; // 2Xs nao tem kicker abaixo
      const suit = m[2].toLowerCase();
      const out: string[] = [];
      for (let k = 0; k < high; k++) out.push(rCh(high) + rCh(k) + suit);
      return out;
    },
  },
  {
    // "ATs+" (gap > 1: carta alta fixa, kicker sobe) e
    // "98s+" (conector: sobe AS DUAS cartas preservando o gap — RF-00.3).
    id: "suited-offsuit-plus",
    pattern: new RegExp(`^(${R})(${R})([so])\\+$`, "i"),
    expand: (m) => {
      const a = rIdx(m[1]);
      const b = rIdx(m[2]);
      if (a === b) return null; // "AAs+" nao existe
      const hi = Math.max(a, b);
      const kick = Math.min(a, b);
      const suit = m[3].toLowerCase();
      const out: string[] = [];
      if (hi - kick === 1) {
        // Convencao PokerStove/Equilab: 98s+ = 98s, T9s, JTs, QJs, KQs, AKs.
        // Antes o laco `k < hi` produzia um unico elemento e o range colado de um
        // solver perdia mãos em silencio.
        for (let i = hi; i <= 12; i++) out.push(rCh(i) + rCh(i - 1) + suit);
      } else {
        for (let k = kick; k < hi; k++) out.push(rCh(hi) + rCh(k) + suit);
      }
      return out;
    },
  },
  {
    // "A5s-A2s" — intervalo de kicker sob a mesma carta alta.
    id: "kicker-range",
    pattern: new RegExp(`^(${R})(${R})([so])-(${R})(${R})([so])$`, "i"),
    expand: (m) => {
      if (m[1].toUpperCase() !== m[4].toUpperCase()) return null;
      if (m[3].toLowerCase() !== m[6].toLowerCase()) return null;
      const high = rIdx(m[1]);
      const lo = Math.min(rIdx(m[2]), rIdx(m[5]));
      const hiK = Math.max(rIdx(m[2]), rIdx(m[5]));
      const suit = m[3].toLowerCase();
      const out: string[] = [];
      for (let k = lo; k <= hiK && k < high; k++) out.push(rCh(high) + rCh(k) + suit);
      return out;
    },
  },
];

/**
 * Expande UM token de range para notacoes base. Suporta:
 *  - pares: "99", "99+" (ate AA), "55-22" (intervalo), "XX" (todos)
 *  - suited/offsuit: "AKs", "ATs+" (kicker sobe), "98s+" (conector sobe o gap),
 *    "A5s-A2s" (intervalo de kicker), "AXs"/"KXo" (qualquer kicker)
 *  - specific: "QhJh", "K7hh"
 * Retorna [] se invalido. Saida sempre ascendente por forca.
 */
export function expandRangeToken(token: string): string[] {
  const t = token.trim();
  if (!t) return [];

  for (const rule of RANGE_TOKEN_RULES) {
    const m = t.match(rule.pattern);
    if (!m) continue;
    const out = rule.expand(m);
    // `[]` e truthy: comparar com null explicitamente, senao uma regra que casa o
    // formato e produz zero notacoes encerra a cadeia dizendo "sou eu" (o contrato
    // acima diz que so `null` cede a vez).
    if (out !== null) return out;
  }

  // passa direto se for notacao valida
  return parseNotation(t) ? [t] : [];
}
