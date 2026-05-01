// =============================================================================
// Sprint Stats-V3 — fuzzyMatchStat helper (RF-10)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-10 fuzzy match)
// ADR  : 065 (OCR via Claude Vision — secao "Fuzzy match")
//
// Algoritmo:
//   1. Normalizacao: trim + lowercase + remove non-alphanumeric (mantendo
//      espaco como separador), depois remove tokens "vs", "do", "de".
//   2. Match exact: labels normalizados iguais → kind='exact', score=1.0.
//   3. Match substring: catalog label normalizado contem OR esta contido
//      no input normalizado → kind='fuzzy_substring', score=0.85-0.95
//      (proporcional ao overlap).
//   4. Match Levenshtein: distancia <=3 → kind='fuzzy_lev', score baseado
//      em (1 - distancia / max(len1, len2)) * 0.7.
//   5. Ordenacao: exact (1.0) > substring (0.85+) > fuzzy_lev (<=0.7).
//      Top first; mesmo kind ordenado por score desc.
//
// Compartilhado server+client porque server expoe matchedBy via response
// e client mostra ranking de suggestions no HudOcrPreview.
// =============================================================================

import type { StatField } from "./hud-stat-catalog";

export type FuzzyMatchKind =
  | "exact"
  | "fuzzy_substring"
  | "fuzzy_lev"
  | "unmatched";

export interface FuzzyMatchCandidate {
  statId: string;
  label: string;
  kind: FuzzyMatchKind;
  score: number; // 0-1
}

const IGNORE_TOKENS = new Set(["vs", "do", "de"]);

function normalize(input: string): string {
  if (typeof input !== "string") return "";
  // lowercase, replace non-alphanumeric (except espaco) por espaco, colapsa espacos.
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // remove ignore tokens (palavras inteiras)
  const tokens = cleaned.split(" ").filter((t) => t.length > 0 && !IGNORE_TOKENS.has(t));
  return tokens.join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function fuzzyMatchStat(
  rawLabel: string,
  catalog: StatField[],
  options: { maxResults?: number } = {},
): FuzzyMatchCandidate[] {
  const maxResults = options.maxResults ?? 10;
  const normInput = normalize(rawLabel);
  if (normInput.length === 0) return [];

  const candidates: FuzzyMatchCandidate[] = [];

  for (const stat of catalog) {
    const normLabel = normalize(stat.label);
    if (normLabel.length === 0) continue;

    if (normLabel === normInput) {
      candidates.push({ statId: stat.id, label: stat.label, kind: "exact", score: 1.0 });
      continue;
    }

    // Substring match (case-insensitive normalizado, em qualquer direcao).
    const isSub =
      normLabel.includes(normInput) || normInput.includes(normLabel);
    if (isSub) {
      const overlap = Math.min(normLabel.length, normInput.length) /
        Math.max(normLabel.length, normInput.length);
      // score 0.85 base + ate +0.10 conforme overlap.
      candidates.push({
        statId: stat.id,
        label: stat.label,
        kind: "fuzzy_substring",
        score: 0.85 + overlap * 0.1,
      });
      continue;
    }

    const dist = levenshtein(normLabel, normInput);
    if (dist <= 3) {
      const maxLen = Math.max(normLabel.length, normInput.length, 1);
      const score = Math.max(0, (1 - dist / maxLen) * 0.7);
      candidates.push({
        statId: stat.id,
        label: stat.label,
        kind: "fuzzy_lev",
        score,
      });
    }
  }

  // Ordenacao: exact > substring > fuzzy_lev. Dentro de cada kind, score desc.
  const kindRank: Record<FuzzyMatchKind, number> = {
    exact: 3,
    fuzzy_substring: 2,
    fuzzy_lev: 1,
    unmatched: 0,
  };
  candidates.sort((a, b) => {
    const dr = kindRank[b.kind] - kindRank[a.kind];
    if (dr !== 0) return dr;
    return b.score - a.score;
  });

  return candidates.slice(0, maxResults);
}
