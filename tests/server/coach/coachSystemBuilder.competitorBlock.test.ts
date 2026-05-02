import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Biblioteca-1 / RF-09 — Hard-block concorrentes no system prompt
//
// Spec: Docs/specs/biblioteca-spec-1.md RF-09 + D15
// ADR: Docs/architecture/decisions/075-coach-recommend-lesson-tool.md
//
// Modulo target: server/coachSafetyPrompts.ts (existente — adicionar exports
// novos: COMPETITOR_BLOCKLIST + SAFETY_RULES_COMPETITOR_BLOCK).
//
// Validacao:
//   - COMPETITOR_BLOCKLIST exportada com lista de concorrentes
//   - SAFETY_RULES_COMPETITOR_BLOCK contem instrucoes
//   - buildStaticSystemBlock inclui o bloco competitor (cache estavel)
//   - Conceitos genericos (GTO/ICM/MDF) NAO sao bloqueados
// =============================================================================

import {
  COMPETITOR_BLOCKLIST,
  SAFETY_RULES_COMPETITOR_BLOCK,
  // @ts-expect-error - exports nao existem ainda (red phase)
} from '../../../server/coachSafetyPrompts';

import { buildStaticSystemBlock } from '../../../server/coachSystemBuilder';

describe('COMPETITOR_BLOCKLIST (RF-09)', () => {
  it('deve incluir GTO Wizard', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('GTO Wizard');
  });

  it('deve incluir Raise Your Edge / RYE', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('Raise Your Edge');
    expect(COMPETITOR_BLOCKLIST).toContain('RYE');
  });

  it('deve incluir PokerCoaching', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('PokerCoaching');
  });

  it('deve incluir Run It Once / RIO', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('Run It Once');
    expect(COMPETITOR_BLOCKLIST).toContain('RIO');
  });

  it('deve incluir Upswing', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('Upswing');
  });

  it('deve incluir Solve For Why / SFW', () => {
    expect(COMPETITOR_BLOCKLIST).toContain('Solve For Why');
    expect(COMPETITOR_BLOCKLIST).toContain('SFW');
  });
});

describe('SAFETY_RULES_COMPETITOR_BLOCK', () => {
  it('deve mencionar instrucao de NAO recomendar concorrentes', () => {
    expect(SAFETY_RULES_COMPETITOR_BLOCK).toMatch(/NUNCA|nao recomenda|concorrent/i);
  });

  it('deve mencionar tool recommend_lesson como fallback positivo', () => {
    expect(SAFETY_RULES_COMPETITOR_BLOCK).toMatch(/recommend_lesson/);
  });

  it('deve permitir explicitamente conceitos genericos (GTO, ICM, MDF)', () => {
    // O bloco deve dizer que conceitos GENERICOS sao permitidos.
    expect(SAFETY_RULES_COMPETITOR_BLOCK).toMatch(/generic|generico|GTO|ICM|MDF/i);
  });
});

describe('buildStaticSystemBlock — competitor block included (RF-09)', () => {
  it('deve incluir cada marca da blocklist no bloco static', () => {
    const block = buildStaticSystemBlock('technical', {});
    const txt = block.text;
    for (const competitor of COMPETITOR_BLOCKLIST) {
      // Pelo menos uma vez no texto do bloco static (cacheado)
      expect(txt.includes(competitor)).toBe(true);
    }
  });

  it('deve preservar cache_control ephemeral apos adicionar competitor block', () => {
    const block = buildStaticSystemBlock('mental', {});
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('deve aplicar bloco competitor para os 3 coaches (mental/tournament/technical)', () => {
    for (const coachType of ['mental', 'tournament', 'technical'] as const) {
      const block = buildStaticSystemBlock(coachType, {});
      expect(block.text).toContain('GTO Wizard');
    }
  });
});

describe('Coach safety — conceitos genericos NAO sao bloqueados', () => {
  it('GTO/ICM/MDF nao aparecem na blocklist (sao conceitos)', () => {
    // GTO sozinho NAO eh produto. GTO Wizard sim.
    expect(COMPETITOR_BLOCKLIST).not.toContain('GTO');
    expect(COMPETITOR_BLOCKLIST).not.toContain('ICM');
    expect(COMPETITOR_BLOCKLIST).not.toContain('MDF');
  });
});
