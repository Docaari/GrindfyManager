// Serializador que colapsa (F2, RF-02.5, emenda A12, D-F2-3). Copiar o range
// devolve notacao curta ("22+", "A2s+", "T9s-54s") reagrupando classes cheias
// em vez de listar combo a combo. Classe parcial sai com peso ("AQo:50%");
// combo solto sai como combo ("AsKh").
import type { RangeEntry } from "./types";

// RANK_STR local (mesma convencao de combos.ts) — nao exportado de la.
const RANK_STR = "23456789TJQKA";
function rIdx(ch: string): number {
  return RANK_STR.indexOf(ch.toUpperCase());
}

function isFullFrequency(entry: RangeEntry): boolean {
  return Math.abs(entry.frequency - 1) < 1e-9;
}

/** Formata a fracao como percentual inteiro (protege o teste do veredito fantasma). */
function fmtPercentInt(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

interface PairGroup {
  type: "pair";
  hi: number; // idx mais alto (inclusive)
  lo: number; // idx mais baixo (inclusive)
}

interface SuitedOffsuitGroup {
  type: "suited" | "offsuit";
  high: number; // idx da carta alta fixa (comum a todas as entries do grupo)
  hi: number; // idx do kicker mais alto (inclusive)
  lo: number; // idx do kicker mais baixo (inclusive)
}

/**
 * Agrupa uma lista de pares consecutivos (mesma frequencia 1, sem
 * overrides/naipe) em um unico fragmento colapsado. Espera `notations` JA
 * filtradas para apenas pares cheios, em qualquer ordem.
 */
function collapsePairs(notations: string[]): string[] {
  if (notations.length === 0) return [];
  const idxs = notations.map((n) => rIdx(n[0])).sort((a, b) => a - b);
  const groups: [number, number][] = [];
  let start = idxs[0];
  let prev = idxs[0];
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] === prev + 1) {
      prev = idxs[i];
      continue;
    }
    groups.push([start, prev]);
    start = idxs[i];
    prev = idxs[i];
  }
  groups.push([start, prev]);

  return groups.map(([lo, hi]) => {
    if (hi === 12) {
      // alcanca AA: notacao "+"
      return `${RANK_STR[lo]}${RANK_STR[lo]}+`;
    }
    if (lo === hi) return `${RANK_STR[lo]}${RANK_STR[lo]}`;
    // classe MAIS FORTE primeiro (hi-lo, ex.: "TT-55")
    return `${RANK_STR[hi]}${RANK_STR[hi]}-${RANK_STR[lo]}${RANK_STR[lo]}`;
  });
}

/**
 * Agrupa suited/offsuit por carta alta fixa, kicker consecutivo (mesma
 * frequencia 1, sem overrides/naipe). `notations` ja filtradas para o
 * `kind` pedido.
 */
function collapseSuitedOffsuit(notations: string[], suitChar: "s" | "o"): string[] {
  if (notations.length === 0) return [];
  const byHigh = new Map<number, number[]>();
  for (const n of notations) {
    const a = rIdx(n[0]);
    const b = rIdx(n[1]);
    const high = Math.max(a, b);
    const kick = Math.min(a, b);
    if (!byHigh.has(high)) byHigh.set(high, []);
    byHigh.get(high)!.push(kick);
  }

  const out: string[] = [];
  for (const [high, kicks] of [...byHigh.entries()].sort((a, b) => b[0] - a[0])) {
    const sorted = [...kicks].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    const groups: [number, number][] = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      groups.push([start, prev]);
      start = sorted[i];
      prev = sorted[i];
    }
    groups.push([start, prev]);

    for (const [lo, hi] of groups) {
      if (hi === high - 1) {
        // alcanca o kicker logo abaixo da carta alta: notacao "+"
        out.push(`${RANK_STR[high]}${RANK_STR[lo]}${suitChar}+`);
      } else if (lo === hi) {
        out.push(`${RANK_STR[high]}${RANK_STR[lo]}${suitChar}`);
      } else {
        // kicker MAIS FORTE primeiro
        out.push(`${RANK_STR[high]}${RANK_STR[hi]}${suitChar}-${RANK_STR[high]}${RANK_STR[lo]}${suitChar}`);
      }
    }
  }
  return out;
}

/**
 * Colapsa um range inteiro em notacao curta, reagrupando classes cheias
 * (frequencia 1, sem override/naipe) em intervalos. Classe parcial sai com
 * peso; combo concreto (kind "specific") sai como o proprio combo.
 */
export function collapseRangeToNotation(entries: RangeEntry[]): string {
  if (entries.length === 0) return "";

  const fragments: string[] = [];

  const isPlain = (e: RangeEntry) =>
    isFullFrequency(e) && !e.comboFreqOverrides && (!e.suits || e.suits.length === 0);

  const fullPairs = entries
    .filter((e) => e.kind === "pair" && isPlain(e))
    .map((e) => e.notation);
  const fullSuited = entries
    .filter((e) => e.kind === "suited" && isPlain(e))
    .map((e) => e.notation);
  const fullOffsuit = entries
    .filter((e) => e.kind === "offsuit" && isPlain(e))
    .map((e) => e.notation);

  fragments.push(...collapsePairs(fullPairs));
  fragments.push(...collapseSuitedOffsuit(fullSuited, "s"));
  fragments.push(...collapseSuitedOffsuit(fullOffsuit, "o"));

  const collapsedSet = new Set<string>([...fullPairs, ...fullSuited, ...fullOffsuit]);

  for (const e of entries) {
    if (collapsedSet.has(e.notation)) continue;
    if (e.kind === "specific") {
      fragments.push(e.notation);
      continue;
    }
    // Classe parcial (frequencia != 1, ou com override/naipe): sai com peso.
    fragments.push(`${e.notation}:${fmtPercentInt(e.frequency)}`);
  }

  return fragments.join(", ");
}
