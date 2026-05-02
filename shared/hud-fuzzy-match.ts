// =============================================================================
// Sprint Stats-V3 — fuzzyMatchStat helper (RF-10)
// Sprint Stats-V3.5 — sectionHint boost/penalty (ADR-067)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-10 fuzzy match)
//        docs/specs/sprint-stats-v3.5-ocr-context-aware.md (secao 4.3)
// ADR  : 065 (OCR via Claude Vision — secao "Fuzzy match")
//        067 (Section-aware OCR mapping — boost +0.15 / penalty *0.6)
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
//   5. (V3.5) Section-aware boost/penalty (apenas se sectionHint != null):
//      - in-group (stat.group === sectionHint): score = min(1.0, score + 0.15)
//        e candidato ganha boostedBySection=true.
//      - out-group: score = score * 0.6.
//   6. Ordenacao: kind rank desc (exact > substring > lev), depois score desc;
//      tie-breaker por in-group (boostedBySection=true vence) e ordem catalog.
//
// Compartilhado server+client porque server expoe matchedBy via response
// e client mostra ranking de suggestions no HudOcrPreview.
// =============================================================================

import type { HudGroupId, StatField } from "./hud-stat-catalog";

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
  /**
   * V3.5: true quando a candidata foi promovida pelo sectionHint (in-group).
   * Audit field — nunca true sem sectionHint resolvido.
   */
  boostedBySection?: boolean;
}

export interface FuzzyMatchOptions {
  maxResults?: number;
  /**
   * V3.5 (ADR-067): hint da secao visual extraida pelo OCR. Quando setado a
   * um HudGroupId, candidatos in-group recebem boost (+0.15, capped 1.0) e
   * out-group recebem penalty (*0.6). null OR undefined preserva legacy.
   */
  sectionHint?: HudGroupId | null;
}

const IGNORE_TOKENS = new Set(["vs", "do", "de"]);

const SECTION_BOOST = 0.15;
const SECTION_PENALTY = 0.6;

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

/**
 * Longest common substring (contiguous) length entre a e b.
 *
 * V3.5: usado como fallback quando exact/substring/lev_<=3 falham mas as duas
 * strings compartilham pedaco grande (ex: "sb probe river" vs "probe river
 * oop" compartilham "probe river"). Threshold conservador (>=8 chars) para
 * nao introduzir falsos positivos em catalogos parecidos.
 */
function longestCommonSubstringLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const m = a.length;
  const n = b.length;
  // dp[i][j] = LCS termina em a[i-1], b[j-1]. Linhas O(2) usando rolling array.
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return best;
}

const MIN_LCS_FALLBACK = 8;

export function fuzzyMatchStat(
  rawLabel: string,
  catalog: StatField[],
  options: FuzzyMatchOptions = {},
): FuzzyMatchCandidate[] {
  const maxResults = options.maxResults ?? 10;
  // sectionHint: null OR undefined ambos significam "sem hint" (legacy).
  const sectionHint =
    options.sectionHint === undefined ? null : options.sectionHint;
  const normInput = normalize(rawLabel);
  if (normInput.length === 0) return [];

  // Track ordem original do catalog para tie-breaker estavel.
  interface InternalCandidate extends FuzzyMatchCandidate {
    catalogIndex: number;
    inGroup: boolean;
  }
  const candidates: InternalCandidate[] = [];

  for (let i = 0; i < catalog.length; i++) {
    const stat = catalog[i];
    const normLabel = normalize(stat.label);
    if (normLabel.length === 0) continue;

    let kind: FuzzyMatchKind | null = null;
    let score = 0;

    if (normLabel === normInput) {
      kind = "exact";
      score = 1.0;
    } else {
      // Substring match (case-insensitive normalizado, em qualquer direcao).
      const isSub =
        normLabel.includes(normInput) || normInput.includes(normLabel);
      if (isSub) {
        const overlap =
          Math.min(normLabel.length, normInput.length) /
          Math.max(normLabel.length, normInput.length);
        kind = "fuzzy_substring";
        score = 0.85 + overlap * 0.1;
      } else {
        const dist = levenshtein(normLabel, normInput);
        if (dist <= 3) {
          const maxLen = Math.max(normLabel.length, normInput.length, 1);
          kind = "fuzzy_lev";
          score = Math.max(0, (1 - dist / maxLen) * 0.7);
        } else {
          // V3.5 fallback: longest common substring (>= MIN_LCS_FALLBACK
          // chars). Cobre casos como "sb probe river" vs "probe river oop"
          // (compartilham "probe river" = 11 chars) que falham em
          // substring puro e em Lev<=3. Conservador: minimo de 8 chars
          // garante que pares com tokens curtos nao gerem falsos positivos.
          const lcs = longestCommonSubstringLength(normLabel, normInput);
          if (lcs >= MIN_LCS_FALLBACK) {
            const maxLen = Math.max(normLabel.length, normInput.length, 1);
            kind = "fuzzy_lev";
            score = Math.max(0, (lcs / maxLen) * 0.7);
          }
        }
      }
    }

    if (kind === null) continue;

    // V3.5: boost/penalty quando sectionHint setado.
    let inGroup = false;
    let boostedBySection: boolean | undefined;
    if (sectionHint !== null) {
      if (stat.group === sectionHint) {
        score = Math.min(1.0, score + SECTION_BOOST);
        boostedBySection = true;
        inGroup = true;
      } else {
        score = score * SECTION_PENALTY;
      }
    }

    candidates.push({
      statId: stat.id,
      label: stat.label,
      kind,
      score,
      boostedBySection,
      catalogIndex: i,
      inGroup,
    });
  }

  // Ordenacao:
  //   - sectionHint == null (legacy): kind rank > score > ordem catalog.
  //     Preserva contrato Stats-V3 (substring sempre sobe acima de fuzzy_lev).
  //   - sectionHint != null (V3.5): score > in-group > kind > ordem catalog.
  //     Justificativa: boost/penalty ja codifica kind impl. via score; quando
  //     in-group fuzzy_lev (~0.66 com boost) deve vencer out-group exact (0.6
  //     apos penalty *0.6). Ver spec V3.5 secao 4.3 + ADR-067.
  const kindRank: Record<FuzzyMatchKind, number> = {
    exact: 3,
    fuzzy_substring: 2,
    fuzzy_lev: 1,
    unmatched: 0,
  };
  if (sectionHint === null) {
    candidates.sort((a, b) => {
      const dr = kindRank[b.kind] - kindRank[a.kind];
      if (dr !== 0) return dr;
      const ds = b.score - a.score;
      if (ds !== 0) return ds;
      return a.catalogIndex - b.catalogIndex;
    });
  } else {
    candidates.sort((a, b) => {
      const ds = b.score - a.score;
      if (ds !== 0) return ds;
      // Tie-breaker V3.5: in-group vence out-group quando scores iguais.
      if (a.inGroup !== b.inGroup) return a.inGroup ? -1 : 1;
      // Persistindo empate: kind rank desc.
      const dr = kindRank[b.kind] - kindRank[a.kind];
      if (dr !== 0) return dr;
      return a.catalogIndex - b.catalogIndex;
    });
  }

  // Strip campos internos do retorno publico.
  return candidates.slice(0, maxResults).map((c) => {
    const out: FuzzyMatchCandidate = {
      statId: c.statId,
      label: c.label,
      kind: c.kind,
      score: c.score,
    };
    if (c.boostedBySection) {
      out.boostedBySection = true;
    }
    return out;
  });
}
