// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Stats-V3.5 — SECTION_ALIASES + resolveSection (RF-2 spec V3.5)
//
// Spec : Docs/specs/sprint-stats-v3.5-ocr-context-aware.md (secao 4.2)
// ADR  : 067 (Section-aware OCR mapping com SECTION_ALIASES)
//
// Modulo NAO existe ainda — Implementer criara em
// `shared/hud-section-aliases.ts`. Estrutura esperada:
//
//   export const SECTION_ALIASES: Record<string, HudGroupId>
//   export function resolveSection(rawHeading: string | null | undefined): HudGroupId | null
//
// Cobertura obrigatoria: cada um dos 16 HudGroupId tem >=1 alias canonico.
// Normalizacao: lowercase + strip non-alphanumeric (mantendo espacos) + collapse.
//
// Lessons aplicadas:
//   #2 N/A (helper puro, sem DOM)
//   #3 mocks idealizados — aqui nao mockamos nada (helper puro)
//   #8 length absoluta de catalog evitada — usamos HUD_GROUP_IDS para iterar.
// =============================================================================

import { describe, it, expect } from 'vitest';

// Modulo NAO existe — red phase. Implementer ira criar.
import {
  SECTION_ALIASES,
  resolveSection,
} from '../../../shared/hud-section-aliases';
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from '../../../shared/hud-stat-catalog';

describe('resolveSection — happy path canonico', () => {
  it('resolve "Big Blind Defense" -> "bb_defense"', () => {
    expect(resolveSection('Big Blind Defense')).toBe('bb_defense');
  });

  it('resolve "Blind war SB" -> "blind_war_sb"', () => {
    expect(resolveSection('Blind war SB')).toBe('blind_war_sb');
  });

  it('resolve "Pos-flop PFR OOP" -> "pos_flop_pfr_oop"', () => {
    expect(resolveSection('Pos-flop PFR OOP')).toBe('pos_flop_pfr_oop');
  });
});

describe('resolveSection — case e separadores', () => {
  it('case-insensitive: "BB DEFENSE" -> "bb_defense"', () => {
    expect(resolveSection('BB DEFENSE')).toBe('bb_defense');
  });

  it('whitespace extra: "  bb defense  " -> "bb_defense"', () => {
    expect(resolveSection('  bb defense  ')).toBe('bb_defense');
  });

  it('hifen como separador: "BB-defense" -> "bb_defense"', () => {
    // Normalizacao strip non-alphanumeric mantendo espaco como separador.
    expect(resolveSection('BB-defense')).toBe('bb_defense');
  });

  it('underscores e pontuacao: "bb_defense!" -> "bb_defense"', () => {
    expect(resolveSection('bb_defense!')).toBe('bb_defense');
  });
});

describe('resolveSection — variantes PT/EN', () => {
  it('PT-BR: "defesa do bb" -> "bb_defense"', () => {
    expect(resolveSection('defesa do bb')).toBe('bb_defense');
  });

  it('PT-BR: "fundamentos" -> "basics"', () => {
    expect(resolveSection('fundamentos')).toBe('basics');
  });

  it('EN: "open raise" -> "rfi"', () => {
    expect(resolveSection('open raise')).toBe('rfi');
  });

  it('EN/abbr: "3bp ip" -> "threebet_pot_ip"', () => {
    expect(resolveSection('3bp ip')).toBe('threebet_pot_ip');
  });
});

describe('resolveSection — entradas vazias / desconhecidas', () => {
  it('null -> null', () => {
    expect(resolveSection(null)).toBeNull();
  });

  it('undefined -> null', () => {
    expect(resolveSection(undefined)).toBeNull();
  });

  it('string vazia -> null', () => {
    expect(resolveSection('')).toBeNull();
  });

  it('string apenas com whitespace -> null', () => {
    expect(resolveSection('   ')).toBeNull();
  });

  it('heading desconhecido -> null', () => {
    expect(resolveSection('blah blah xyz')).toBeNull();
  });

  it('heading random sem alias -> null (degrada graciosamente)', () => {
    expect(resolveSection('My Custom Section')).toBeNull();
  });
});

describe('SECTION_ALIASES — cobertura dos 16 HudGroupId', () => {
  it('todos os 16 HudGroupId tem ao menos um alias mapeando para si', () => {
    // Lesson #8: enumera HUD_GROUP_IDS, NAO valida length absoluta.
    const groupsCovered = new Set<HudGroupId>();
    for (const aliasKey of Object.keys(SECTION_ALIASES)) {
      const groupId = SECTION_ALIASES[aliasKey];
      groupsCovered.add(groupId);
    }
    for (const groupId of HUD_GROUP_IDS) {
      expect(
        groupsCovered.has(groupId),
        `HudGroupId "${groupId}" sem alias em SECTION_ALIASES`,
      ).toBe(true);
    }
  });

  it('label PT-BR oficial de cada HudGroupId resolve para seu groupId', () => {
    // resolveSection(HUD_GROUP_LABELS[g]) deve retornar g.
    for (const groupId of HUD_GROUP_IDS) {
      const label = HUD_GROUP_LABELS[groupId];
      const resolved = resolveSection(label);
      expect(
        resolved,
        `Label oficial "${label}" do grupo "${groupId}" nao resolveu para si (resolvido=${resolved})`,
      ).toBe(groupId);
    }
  });
});

describe('resolveSection — desambiguacao por especificidade (regra de duplicidade)', () => {
  it('"bb defense" -> "bb_defense" (NAO "blind_war_bb")', () => {
    // Spec secao 4.2 regra de duplicidade: alias literal mais especifico ganha.
    expect(resolveSection('bb defense')).toBe('bb_defense');
  });
});
