import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-03 — Confidence tags no prompt
//
// Garante que os 3 prompts (Mental, Tournament, Technical) contem:
//   1. Instrucao explicita sobre [confianca: baixa|media|alta, N=X]
//   2. Instrucao para [nao sei: motivo]
//   3. Thresholds documentados: N<30=baixa, 30<=N<100=media, N>=100=alta
//   4. Pelo menos 2 exemplos few-shot
//
// Modulo alvo: server/coachPrompts.ts (ja existe, sera atualizado pelo Implementer)
// =============================================================================

import {
  getMentalPrompt,
  getTournamentPrompt,
  getTechnicalPrompt,
} from '../../../server/coachPrompts';

const emptyMentalCtx = {
  breakFeedbacks: [], preparationLogs: [], grindSessions: [], mentalCorrelation: undefined,
};
const emptyTournamentCtx = {
  dashboardStats: { totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 },
  roiBySite: [], roiByBuyin: [], roiByCategory: [], roiBySpeed: [], roiByDay: [],
  topTemplates: [], worstTemplates: [],
};
const emptyTechnicalCtx = {
  dashboardStats: { totalTournaments: 0, roi: 0, profit: '0', abi: 0, itmPercent: 0 },
  finalTableAnalytics: {}, earlyFinishRate: 0, lateFinishRate: 0,
  analyticsByField: [], analyticsByMonth: [], studyCards: [], detectedLeaks: [],
};

const prompts: Array<[string, () => string]> = [
  ['mental', () => getMentalPrompt(emptyMentalCtx)],
  ['tournament', () => getTournamentPrompt(emptyTournamentCtx)],
  ['technical', () => getTechnicalPrompt(emptyTechnicalCtx)],
];

describe.each(prompts)('confidence tags no prompt do coach %s', (name, getPrompt) => {
  it('instrui a emitir [confianca: baixa|media|alta, N=X]', () => {
    const text = getPrompt();
    expect(text).toMatch(/\[confianca:\s*(baixa|media|alta),\s*N=/i);
  });

  it('instrui a emitir [nao sei: motivo] quando dado indisponivel', () => {
    const text = getPrompt();
    expect(text).toMatch(/\[nao sei:/i);
  });

  it('documenta os thresholds de N para cada nivel', () => {
    const text = getPrompt();
    // Deve mencionar os limites N<30, 30<=N<100, N>=100 (formas textuais aceitaveis)
    expect(text).toMatch(/N\s*<\s*30|menor\s+que\s+30/i);
    expect(text).toMatch(/(30\s*(<=|≤|e|a)\s*N\s*<\s*100)|(entre\s+30\s+e\s+100)/i);
    expect(text).toMatch(/N\s*(>=|≥)\s*100|maior\s+ou\s+igual\s+a\s+100/i);
  });

  it('inclui pelo menos 2 exemplos few-shot', () => {
    const text = getPrompt();
    // Conta ocorrencias de tag literal dentro de exemplos
    const matches = text.match(/\[confianca:\s*(baixa|media|alta),\s*N=\d+\]/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
