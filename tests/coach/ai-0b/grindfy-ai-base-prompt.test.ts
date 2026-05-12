import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-0B / RF-01 + RF-03 — Prompt unificado "Grindfy AI"
// Spec: Docs/specs/sprint-ai-0b.md §RF-01, §RF-03
// ADR-148 §2.1, §2.2, §2.4 ("O que o test-writer precisa saber" §5 itens 1-3)
//
// Mudancas no codigo (que justificam estes testes):
//   - server/coachSystemBuilder.ts: MENTAL_BASE/TOURNAMENT_BASE/TECHNICAL_BASE
//     e getBasePrompt(coachType) REMOVIDOS -> constante unica GRINDFY_AI_BASE
//     (string) + helper getGrindfyAiBasePrompt(): string.
//   - server/coachPrompts.ts: getMentalPrompt/getTournamentPrompt/
//     getTechnicalPrompt REMOVIDOS.
//   - buildStaticSystemBlock(coachType, inputs): assinatura preservada, mas o
//     corpo do base prompt NAO varia com coachType.
//
// Lessons aplicaveis: #10 (DRY de prompts — fonte unica), #14/#26 (await import).
// =============================================================================

describe('getGrindfyAiBasePrompt / GRINDFY_AI_BASE — base unico (RF-01)', () => {
  it('coachSystemBuilder exporta getGrindfyAiBasePrompt() retornando string nao-vazia', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    expect(typeof mod.getGrindfyAiBasePrompt).toBe('function');
    const base: string = mod.getGrindfyAiBasePrompt();
    expect(typeof base).toBe('string');
    expect(base.length).toBeGreaterThan(80);
  });

  it('exporta a constante GRINDFY_AI_BASE (string) — fonte unica do base', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    expect(typeof mod.GRINDFY_AI_BASE).toBe('string');
    expect(mod.GRINDFY_AI_BASE.length).toBeGreaterThan(80);
  });

  it('getGrindfyAiBasePrompt() e GRINDFY_AI_BASE sao a MESMA string (sem copia paralela — lesson #10)', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    expect(mod.getGrindfyAiBasePrompt()).toBe(mod.GRINDFY_AI_BASE);
  });

  it('o base unico NAO apresenta o agente como "Coach Mental"/"Coach Tecnico"/"Coach de Torneios"', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+Mental/i);
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+T[eé]cnico/i);
    expect(GRINDFY_AI_BASE).not.toMatch(/Coach\s+de\s+Torneios/i);
  });

  it('o base unico apresenta a identidade "Grindfy AI"', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE).toMatch(/Grindfy\s*AI/i);
  });

  it('o base unico menciona as 5 areas (mental, selecao, tecnico, bankroll, estudos)', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    const t = GRINDFY_AI_BASE.toLowerCase();
    expect(t).toMatch(/mental/);
    // selecao de torneios / game selection / sele[cç][aã]o
    expect(t).toMatch(/sele[cç][aã]o|game selection|sele[cç]ao de torneios/);
    expect(t).toMatch(/t[eé]cnic/);
    expect(t).toMatch(/bankroll|banca/);
    expect(t).toMatch(/estud/);
  });

  it('o base unico instrui usar tools para o detalhe', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE.toLowerCase()).toMatch(/tools?|ferramenta/);
  });

  it('o base unico instrui citar a fonte', async () => {
    const { GRINDFY_AI_BASE }: any = await import('../../../server/coachSystemBuilder');
    expect(GRINDFY_AI_BASE.toLowerCase()).toMatch(/fonte|cit/);
  });
});

describe('Funcoes legacy removidas (RF-01 / RF-03 / ADR-148 §2.4)', () => {
  it('coachPrompts.ts NAO exporta mais getMentalPrompt', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getMentalPrompt).toBeUndefined();
  });

  it('coachPrompts.ts NAO exporta mais getTournamentPrompt', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getTournamentPrompt).toBeUndefined();
  });

  it('coachPrompts.ts NAO exporta mais getTechnicalPrompt', async () => {
    const mod: any = await import('../../../server/coachPrompts');
    expect(mod.getTechnicalPrompt).toBeUndefined();
  });

  it('coachSystemBuilder.ts NAO exporta mais getBasePrompt', async () => {
    const mod: any = await import('../../../server/coachSystemBuilder');
    expect(mod.getBasePrompt).toBeUndefined();
  });
});
