import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-04 + RF-05 — Citations + Confidence rules em arquivo unico
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-04 + RF-05)
//   - Docs/architecture/decisions/086-coach-citations-and-confidence-inline-rules.md
//
// Lessons aplicadas:
//   - #10 (DRY de prompts): garantir que CITATIONS_RULES e CONFIDENCE_RULES vivem
//     em UM arquivo (coachSafetyPrompts.ts) e SAO consumidos por ambos builders
//     (coachSystemBuilder + coachPrompts legacy).
//
// Tests snapshot guardam contra divergencia silenciosa que quebra cache da Anthropic.
// =============================================================================

describe('coachSafetyPrompts.ts — exports CITATIONS_RULES + CONFIDENCE_RULES', () => {
  it('exporta CITATIONS_RULES com texto da diretiva', async () => {
    const mod = await import('../../../server/coachSafetyPrompts');
    expect(typeof (mod as any).CITATIONS_RULES).toBe('string');
    expect((mod as any).CITATIONS_RULES.length).toBeGreaterThan(50);
  });

  it('CITATIONS_RULES inclui formato [fonte: ...]', async () => {
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(CITATIONS_RULES).toMatch(/\[fonte:/i);
    expect(CITATIONS_RULES.toLowerCase()).toMatch(/nao verificado|n[ãa]o verificado/i);
  });

  it('CITATIONS_RULES traz exemplo correto e exemplo errado', async () => {
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(CITATIONS_RULES.toLowerCase()).toMatch(/exemplos? corretos?|exemplo certo/i);
    expect(CITATIONS_RULES.toLowerCase()).toMatch(/exemplos? errados?|exemplo errado/i);
  });

  it('exporta CONFIDENCE_RULES com 3 niveis', async () => {
    const { CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(typeof CONFIDENCE_RULES).toBe('string');
    expect(CONFIDENCE_RULES).toMatch(/baixa/i);
    expect(CONFIDENCE_RULES).toMatch(/media|m[ée]dia/i);
    expect(CONFIDENCE_RULES).toMatch(/alta/i);
  });

  it('CONFIDENCE_RULES documenta thresholds N<30 / 30<=N<100 / N>=100', async () => {
    const { CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    // Sprint 0 acceptance: boundary inclusive em "media" para N=30 e em "alta" para N=100.
    expect(CONFIDENCE_RULES).toMatch(/N\s*<\s*30|menor.*30/i);
    expect(CONFIDENCE_RULES).toMatch(/N\s*(>=|>=|>=)\s*100|maior.*100|>=\s*100/i);
  });

  it('CONFIDENCE_RULES instrui omitir tag quando N indisponivel', async () => {
    const { CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(CONFIDENCE_RULES.toLowerCase()).toMatch(/omit|nao\s+inventar|n[ãa]o\s+inventar/i);
  });
});

describe('buildStaticSystemBlock — DRY guard (lesson #10)', () => {
  it('inclui CITATIONS_RULES no bloco estatico cacheado', async () => {
    const { buildStaticSystemBlock } =
      await import('../../../server/coachSystemBuilder');
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;

    const block = buildStaticSystemBlock('tournament', {
      aiProfile: null, statsSnapshot: null, lastSummary: null,
    });
    // Deve conter o texto literal de CITATIONS_RULES (cache key bit-identical)
    expect(block.text).toContain(CITATIONS_RULES);
  });

  it('inclui CONFIDENCE_RULES no bloco estatico cacheado', async () => {
    const { buildStaticSystemBlock } =
      await import('../../../server/coachSystemBuilder');
    const { CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;

    const block = buildStaticSystemBlock('technical', {});
    expect(block.text).toContain(CONFIDENCE_RULES);
  });

  it('block.cache_control = ephemeral — texto novo nao quebra estrategia de cache', async () => {
    const { buildStaticSystemBlock } =
      await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('mental', {});
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });
});

// REESCRITO no Sprint AI-0B — getMentalPrompt/getTournamentPrompt removidos
// (consolidacao agente unico, ADR-148). O caminho legacy nao tem mais 3 prompts
// por coach; o base unico GRINDFY_AI_BASE concatena as MESMAS constantes de
// fonte unica (coachSafetyPrompts.ts). Mudanca intencional, nao regressao.
describe('Grindfy AI base unico consome das mesmas constants (DRY — lesson #10)', () => {
  it('GRINDFY_AI_BASE / buildStaticSystemBlock incluem CITATIONS_RULES de fonte unica', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    const block = buildStaticSystemBlock('tournament' as any, {});
    expect(block.text).toContain(CITATIONS_RULES);
  });

  it('buildStaticSystemBlock inclui CONFIDENCE_RULES de fonte unica', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const { CONFIDENCE_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    const block = buildStaticSystemBlock('mental' as any, {});
    expect(block.text).toContain(CONFIDENCE_RULES);
  });

  it('coachPrompts.ts NAO exporta mais getMentalPrompt/getTournamentPrompt/getTechnicalPrompt', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getMentalPrompt).toBeUndefined();
    expect(mod.getTournamentPrompt).toBeUndefined();
    expect(mod.getTechnicalPrompt).toBeUndefined();
  });
});

describe('Cache key — corpo do bloco STATIC identico entre coachType (1 cache key)', () => {
  it('buildStaticSystemBlock("mental") e ("technical") produzem o mesmo bloco STATIC', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const a = buildStaticSystemBlock('mental' as any, {});
    const b = buildStaticSystemBlock('technical' as any, {});
    expect(a.text).toBe(b.text);
  });

  it('buildStaticSystemBlock inclui a string literal CITATIONS_RULES (sem copy-paste com diff)', async () => {
    const { buildStaticSystemBlock } = await import('../../../server/coachSystemBuilder');
    const { CITATIONS_RULES } = await import('../../../server/coachSafetyPrompts') as any;
    expect(buildStaticSystemBlock('tournament' as any, {}).text.includes(CITATIONS_RULES)).toBe(true);
  });
});
