import { describe, it, expect } from 'vitest';

// =============================================================================
// REESCRITO no Sprint AI-0B — o sujeito mudou (ADR-148 / RF-01+RF-03).
//
// Antes: testava getMentalPrompt / getTournamentPrompt / getTechnicalPrompt
// (3 system prompts por coach) em server/coachPrompts.ts. Essas funcoes foram
// REMOVIDAS na consolidacao para o agente unico "Grindfy AI".
//
// As regras de confianca/citacao continuam com fonte unica em
// server/coachSafetyPrompts.ts (CITATIONS_RULES + CONFIDENCE_RULES) e sao
// concatenadas pelo bloco STATIC unico (buildStaticSystemBlock em
// server/coachSystemBuilder.ts) — corpo IDENTICO entre os 3 coachType.
//
// Mudanca intencional (red-phase) — NAO eh regressao silenciosa.
// Spec: Docs/specs/sprint-ai-0b.md §RF-01, §RF-03; ADR-148 §2.1+§2.4.
// =============================================================================

import { buildStaticSystemBlock } from '../../../server/coachSystemBuilder';

const blocks: Array<[string, () => string]> = [
  ['mental', () => buildStaticSystemBlock('mental', {}).text],
  ['tournament', () => buildStaticSystemBlock('tournament', {}).text],
  ['technical', () => buildStaticSystemBlock('technical', {}).text],
];

describe.each(blocks)('confidence/citation no bloco STATIC do Grindfy AI (lente %s)', (_name, getText) => {
  it('instrui a emitir [confianca: baixa|media|alta, N=X]', () => {
    const text = getText();
    expect(text).toMatch(/\[confianca:\s*(baixa|media|alta),\s*N=/i);
  });

  it('instrui a emitir [nao sei: motivo] quando dado indisponivel', () => {
    const text = getText();
    expect(text).toMatch(/\[nao sei:/i);
  });

  it('documenta os thresholds de N para cada nivel', () => {
    const text = getText();
    expect(text).toMatch(/N\s*<\s*30|menor\s+que\s+30/i);
    expect(text).toMatch(/(30\s*(<=|≤|e|a)\s*N\s*<\s*100)|(entre\s+30\s+e\s+100)/i);
    expect(text).toMatch(/N\s*(>=|≥)\s*100|maior\s+ou\s+igual\s+a\s+100/i);
  });

  it('inclui pelo menos 2 exemplos few-shot', () => {
    const text = getText();
    const matches = text.match(/\[confianca:\s*(baixa|media|alta),\s*N=\d+\]/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
