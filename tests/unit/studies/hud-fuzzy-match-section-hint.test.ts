// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3.5 — fuzzyMatchStat com sectionHint (RF-3 spec V3.5)
//
// Spec : Docs/specs/sprint-stats-v3.5-ocr-context-aware.md (secao 4.3)
// ADR  : 067 (Section-aware OCR mapping — boost +0.15 / penalty *0.6)
//
// Modulo `shared/hud-fuzzy-match.ts` JA existe (Stats-V3) mas a assinatura
// ainda NAO aceita `sectionHint`. Este teste valida a nova assinatura
// com options.sectionHint que o Implementer ira adicionar.
//
// Logica esperada:
//   - sectionHint == null OU undefined -> ranking legacy preservado.
//   - candidata.group === sectionHint -> score = min(1.0, score + 0.15).
//   - candidata.group !== sectionHint -> score = score * 0.6.
//   - Tie-breaker: in-group vence; ordem catalog estavel.
//   - FuzzyMatchCandidate ganha campo opcional `boostedBySection: boolean`
//     quando boost foi aplicado (in-group). // TODO implementer: adicionar
//     boostedBySection?: boolean em FuzzyMatchCandidate.
//
// Lessons aplicadas:
//   #2 N/A (helper puro)
//   #3 mocks idealizados — usamos catalog REAL para validar shapes verdadeiros
//   #8 length absoluta evitada — assertions usam .find() / first match.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  fuzzyMatchStat,
  type FuzzyMatchCandidate,
} from '../../../shared/hud-fuzzy-match';
import {
  HUD_STAT_CATALOG,
  getStatById,
  type HudGroupId,
} from '../../../shared/hud-stat-catalog';

// -----------------------------------------------------------------------------
// Helper: pega group de um candidate via catalog index.
// -----------------------------------------------------------------------------
function groupOf(candidate: FuzzyMatchCandidate): HudGroupId | undefined {
  return getStatById(candidate.statId)?.group;
}

describe('fuzzyMatchStat — sem sectionHint (legacy)', () => {
  it('comportamento legacy preservado quando options omitido', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Sanity: pelo menos um candidato com "probe" no statId.
    expect(matches.some((m) => m.statId.includes('probe_river'))).toBe(true);
  });

  it('comportamento legacy preservado quando sectionHint=null (bypass total)', () => {
    const withoutHint = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG);
    const withNullHint = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: null,
    });
    // Mesmos statIds, mesma ordem.
    expect(withNullHint.map((m) => m.statId)).toEqual(
      withoutHint.map((m) => m.statId),
    );
    expect(withNullHint.map((m) => m.score)).toEqual(
      withoutHint.map((m) => m.score),
    );
  });

  it('comportamento legacy preservado quando sectionHint=undefined explicito', () => {
    const withoutHint = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG);
    const withUndef = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: undefined,
    });
    expect(withUndef.map((m) => m.statId)).toEqual(
      withoutHint.map((m) => m.statId),
    );
  });
});

describe('fuzzyMatchStat — com sectionHint resolvendo casos ambiguos', () => {
  it('"Probe River" + sectionHint="blind_war_sb" -> primeiro candidato sb_probe_river', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'blind_war_sb',
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].statId).toBe('sb_probe_river');
  });

  it('"Probe River" + sectionHint="pos_flop_pfr_oop" -> primeiro candidato probe_river_oop', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'pos_flop_pfr_oop',
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].statId).toBe('probe_river_oop');
  });

  it('"Probe River" + sectionHint="blind_war_bb" -> primeiro candidato bb_probe_river_sb (group blind_war_bb)', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'blind_war_bb',
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].statId).toBe('bb_probe_river_sb');
    expect(groupOf(matches[0])).toBe('blind_war_bb');
  });

  it('"Probe River" + sectionHint="bb_defense" (sem stat in-group) -> ranking legacy preservado (todos out-group penalizados igualmente)', () => {
    // Spec secao 5 unit #1: "ex: bb_probe_river_sb se houver alias, OR documentar
    // gap se nao houver match no grupo". Nao ha "Probe River" stat em bb_defense.
    // Quando todos os candidatos sao out-group, penalty *0.6 aplica-se a todos
    // -> ranking RELATIVO preservado.
    const legacy = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG);
    const withHint = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'bb_defense',
    });
    // Ordem dos statIds preservada mesmo apos penalty (sem stat in-group para
    // recolocar primeiro). Cada candidato tera score multiplicado por 0.6.
    expect(withHint.map((m) => m.statId)).toEqual(legacy.map((m) => m.statId));
  });
});

describe('fuzzyMatchStat — boost aditivo +0.15 e teto 1.0', () => {
  it('match in-group recebe score >= legacyScore (boost aditivo +0.15)', () => {
    const legacy = fuzzyMatchStat('SB Probe River', HUD_STAT_CATALOG);
    const legacyTop = legacy.find((m) => m.statId === 'sb_probe_river');
    expect(legacyTop).toBeDefined();

    const hinted = fuzzyMatchStat('SB Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'blind_war_sb',
    });
    const hintedTop = hinted.find((m) => m.statId === 'sb_probe_river');
    expect(hintedTop).toBeDefined();
    // boost in-group: novo score >= legacy score.
    expect(hintedTop!.score).toBeGreaterThanOrEqual(legacyTop!.score);
  });

  it('boost respeita teto 1.0 (clamp)', () => {
    // Para um exact match (score=1.0) com boost in-group, score continua <=1.0.
    const matches = fuzzyMatchStat('VPIP', HUD_STAT_CATALOG, {
      sectionHint: 'basics',
    });
    const vpip = matches.find((m) => m.statId === 'vpip');
    expect(vpip).toBeDefined();
    expect(vpip!.score).toBeLessThanOrEqual(1.0);
  });
});

describe('fuzzyMatchStat — penalty *0.6 reduz score out-group', () => {
  it('candidato out-group tem score reduzido vs legacy (penalty multiplicativo)', () => {
    // "SB Probe River" sem hint -> sb_probe_river top (substring exact-ish).
    // Com hint=pos_flop_pfr_oop, sb_probe_river vira out-group e probe_river_oop
    // recebe boost. Top muda E score do sb_probe_river abaixa.
    const legacy = fuzzyMatchStat('SB Probe River', HUD_STAT_CATALOG);
    const legacySb = legacy.find((m) => m.statId === 'sb_probe_river');
    expect(legacySb).toBeDefined();

    const hinted = fuzzyMatchStat('SB Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'pos_flop_pfr_oop',
    });
    const hintedSb = hinted.find((m) => m.statId === 'sb_probe_river');
    if (hintedSb) {
      // Penalty: novo score < legacy score (multiplicado por 0.6).
      expect(hintedSb.score).toBeLessThan(legacySb!.score);
    }
    // E o top deve ser probe_river_oop (in-group recebe boost).
    expect(hinted[0].statId).toBe('probe_river_oop');
  });
});

describe('fuzzyMatchStat — campo audit boostedBySection', () => {
  it('candidato in-group ganha boostedBySection=true', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'blind_war_sb',
    });
    const sbProbe = matches.find((m) => m.statId === 'sb_probe_river');
    expect(sbProbe).toBeDefined();
    // TODO implementer: adicionar boostedBySection?: boolean em FuzzyMatchCandidate.
    expect((sbProbe as any).boostedBySection).toBe(true);
  });

  it('candidato out-group NAO marca boostedBySection=true', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG, {
      sectionHint: 'blind_war_sb',
    });
    const probeOop = matches.find((m) => m.statId === 'probe_river_oop');
    if (probeOop) {
      // Pode ser undefined ou false — nao deve ser true.
      expect((probeOop as any).boostedBySection).not.toBe(true);
    }
  });

  it('sem sectionHint, nenhum candidato tem boostedBySection=true', () => {
    const matches = fuzzyMatchStat('Probe River', HUD_STAT_CATALOG);
    for (const m of matches) {
      expect((m as any).boostedBySection).not.toBe(true);
    }
  });
});

describe('fuzzyMatchStat — tie-breaker in-group', () => {
  it('em scores iguais apos boost, in-group vence out-group', () => {
    // Cenario: label que casa exact com 2 stats teoricamente — usar VPIP (unico
    // exact em basics). Se houver empate de score, in-group hint ainda vence.
    const matches = fuzzyMatchStat('VPIP', HUD_STAT_CATALOG, {
      sectionHint: 'basics',
    });
    expect(matches[0].statId).toBe('vpip');
    expect(groupOf(matches[0])).toBe('basics');
  });
});
