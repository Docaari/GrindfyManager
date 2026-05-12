import { describe, it, expect } from 'vitest';

// =============================================================================
// REESCRITO no Sprint AI-0B — o sujeito deste teste mudou.
//
// Antes: testava getMentalPrompt / getTournamentPrompt / getTechnicalPrompt
// (3 system prompts por coach) em server/coachPrompts.ts.
//
// Agora (ADR-148 / Sprint AI-0B RF-01 + RF-03): os 3 coaches foram
// consolidados num agente unico "Grindfy AI". As funcoes getMentalPrompt /
// getTournamentPrompt / getTechnicalPrompt foram REMOVIDAS. O base prompt unico
// vive em server/coachSystemBuilder.ts (constante GRINDFY_AI_BASE + helper
// getGrindfyAiBasePrompt()).
//
// Os testes detalhados do novo base prompt estao em
// tests/coach/ai-0b/grindfy-ai-base-prompt.test.ts. Aqui guardamos a regressao
// minima: as funcoes legacy nao existem mais.
//
// Mudanca intencional (red-phase) — NAO eh regressao silenciosa.
// Spec: Docs/specs/sprint-ai-0b.md §RF-01, §RF-03; ADR-148 §2.4 + §5.
// =============================================================================

describe('coachPrompts.ts — funcoes legacy removidas (Sprint AI-0B / RF-01+RF-03)', () => {
  it('getMentalPrompt nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getMentalPrompt).toBeUndefined();
  });

  it('getTournamentPrompt nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getTournamentPrompt).toBeUndefined();
  });

  it('getTechnicalPrompt nao eh mais exportado', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getTechnicalPrompt).toBeUndefined();
  });
});

describe('Grindfy AI — base prompt unico (substitui os 3 prompts por coach)', () => {
  it('coachSystemBuilder exporta GRINDFY_AI_BASE (string nao-vazia)', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    expect(typeof mod.GRINDFY_AI_BASE).toBe('string');
    expect(mod.GRINDFY_AI_BASE.length).toBeGreaterThan(80);
  });

  it('GRINDFY_AI_BASE nao apresenta "Coach Mental/Tecnico/de Torneios"', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+Mental/i);
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+T[eé]cnico/i);
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+de\s+Torneios/i);
  });

  it('GRINDFY_AI_BASE apresenta "Grindfy AI"', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE).toMatch(/Grindfy\s*AI/i);
  });

  it('buildStaticSystemBlock inclui GRINDFY_AI_BASE no bloco STATIC', async () => {
    const { buildStaticSystemBlock, GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    const block = buildStaticSystemBlock('mental', {});
    expect(block.text).toContain(GRINDFY_AI_BASE);
  });
});
