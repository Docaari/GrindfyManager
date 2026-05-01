// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3 — fuzzyMatchStat helper (RF-10)
//
// Spec : docs/specs/sprint-stats-v3.md (RF-10 fuzzy match)
// ADR  : 065 (OCR via Claude Vision — secao "Fuzzy match")
//
// Modulo NAO existe ainda — Implementer criara em
// `shared/hud-fuzzy-match.ts` (compartilhado server+client porque server
// expoe matchedBy via response e client mostra ranking).
//
// Convencoes:
//   - Levenshtein distance <=3 entre label OCR normalizado (trim + lowercase
//     + remove non-alphanumeric) e label catalog normalizado.
//   - Substring match case-insensitive ignore tokens "vs", "do", "de".
//   - Score order: exact > substring > fuzzy_lev.
//   - No match retorna [].
//
// Lessons aplicadas:
//   #2 data-testid estavel — N/A (helper puro)
//   #3 mocks idealizados — assertion sobre shape do retorno definido na ADR
//   #8 length absoluta de catalog evitada — helpers usam getStatById + filter
// =============================================================================

import { describe, it, expect } from 'vitest';

// Modulo NAO existe — red phase. Implementer ira criar.
import {
  fuzzyMatchStat,
  type FuzzyMatchCandidate,
  type FuzzyMatchKind,
} from '../../../shared/hud-fuzzy-match';
import { getStatById, HUD_STAT_CATALOG } from '../../../shared/hud-stat-catalog';

describe('fuzzyMatchStat — exact match', () => {
  it('retorna candidate com kind=exact quando label OCR === label catalog', () => {
    const matches = fuzzyMatchStat('VPIP', HUD_STAT_CATALOG);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].statId).toBe('vpip');
    expect(matches[0].kind).toBe('exact');
    expect(matches[0].score).toBeGreaterThanOrEqual(0.99);
  });

  it('exact match eh case-insensitive', () => {
    const matches = fuzzyMatchStat('vpip', HUD_STAT_CATALOG);
    expect(matches[0].statId).toBe('vpip');
    expect(matches[0].kind).toBe('exact');
  });
});

describe('fuzzyMatchStat — Levenshtein distance', () => {
  it('match com distancia <=3 entre labels normalizados', () => {
    // "VPIP" -> "VPlP" (1 char swap, distancia 1)
    const matches = fuzzyMatchStat('VPlP', HUD_STAT_CATALOG);
    const top = matches.find((m) => m.statId === 'vpip');
    expect(top).toBeDefined();
    expect(top!.kind === 'fuzzy_lev' || top!.kind === 'exact').toBe(true);
  });

  it('rejeita match com distancia >3', () => {
    const matches = fuzzyMatchStat('VPxxxxIP', HUD_STAT_CATALOG);
    // distancia maior que 3 — VPIP NAO deve aparecer no top
    const vpip = matches.find((m) => m.statId === 'vpip' && m.kind === 'fuzzy_lev');
    expect(vpip).toBeUndefined();
  });
});

describe('fuzzyMatchStat — substring match', () => {
  it('substring contains case-insensitive', () => {
    // "Fold to 3Bet" contem "Fold" — buscar "fold to 3bet" deve achar fold_to_3bet
    const matches = fuzzyMatchStat('fold to 3bet', HUD_STAT_CATALOG);
    const top = matches[0];
    expect(top.statId).toBe('fold_to_3bet');
  });

  it('ignore tokens "vs", "do", "de" no matching', () => {
    // "3Bet PF" deve casar mesmo com "3Bet do PF" (token "do" ignorado)
    const matches = fuzzyMatchStat('3Bet do PF', HUD_STAT_CATALOG);
    const threebet = matches.find((m) => m.statId === 'threebet_pf');
    expect(threebet).toBeDefined();
  });
});

describe('fuzzyMatchStat — score order', () => {
  it('exact ranks acima de substring/fuzzy_lev', () => {
    const matches = fuzzyMatchStat('VPIP', HUD_STAT_CATALOG);
    expect(matches[0].kind).toBe('exact');
    // segundo nao pode ser exact tambem
    if (matches.length > 1) {
      expect(matches[1].kind).not.toBe('exact');
    }
  });

  it('substring ranks acima de fuzzy_lev quando ambos validos', () => {
    // "RFI" tem multiplos stats no catalogo (rfi_ep, rfi_mp, etc).
    // Substring deveria pegar todos os "RFI ..." antes de fuzzy_lev de outras stats.
    const matches = fuzzyMatchStat('RFI', HUD_STAT_CATALOG);
    expect(matches.length).toBeGreaterThan(0);
    // top match deve ser do grupo rfi
    const top = matches[0];
    const stat = getStatById(top.statId);
    expect(stat).toBeDefined();
    // top eh exact OR substring (nao fuzzy)
    expect(top.kind === 'exact' || top.kind === 'fuzzy_substring').toBe(true);
  });
});

describe('fuzzyMatchStat — no match', () => {
  it('retorna array vazio quando nao ha match', () => {
    const matches = fuzzyMatchStat('zzz_unknown_label_xyz', HUD_STAT_CATALOG);
    expect(matches).toEqual([]);
  });
});
