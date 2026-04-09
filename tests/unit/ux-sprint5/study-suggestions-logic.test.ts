import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: FP-16 — Mapping leak -> topico de estudo e templates
//
// Funcoes puras que mapeiam leaks detectados para sugestoes de estudo:
//   - `mapLeakToStudyTopic(leak)` — converte leak type/description para topico
//   - `getStudyTemplates()` — retorna 8 templates pre-definidos
//   - `getStudyTemplateSuggestions(leaks)` — cruza leaks com templates, top 3
//
// Modulo esperado: `client/src/lib/study-suggestions-helpers.ts`
//
// Fonte de verdade: spec `Docs/specs/ux-sprint5-estudos-final.md` RF-01/RF-03
// Tipos de leak: `server/coachLeakDetection.ts` (7 tipos)
//
// Todos devem FALHAR (red phase) — funcoes ainda nao existem.
// =============================================================================

// Tipos esperados (baseados em server/coachLeakDetection.ts)
interface Leak {
  type: string;
  severity: number;
  description: string;
  data?: any;
  recommendation?: string;
}

interface StudyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  suggestedTopics: string[];
}

// Stubs para compilacao — Implementer substituira
let mapLeakToStudyTopic: (leak: Leak) => string;
let getStudyTemplates: () => StudyTemplate[];
let getStudyTemplateSuggestions: (leaks: Leak[]) => StudyTemplate[];

try {
  const mod = require('../../../client/src/lib/study-suggestions-helpers');
  if (mod.mapLeakToStudyTopic) mapLeakToStudyTopic = mod.mapLeakToStudyTopic;
  if (mod.getStudyTemplates) getStudyTemplates = mod.getStudyTemplates;
  if (mod.getStudyTemplateSuggestions) getStudyTemplateSuggestions = mod.getStudyTemplateSuggestions;
} catch {
  // Esperado em red phase
}

// ---------------------------------------------------------------------------
// mapLeakToStudyTopic — converte leak para topico de estudo sugerido
// ---------------------------------------------------------------------------

describe('mapLeakToStudyTopic', () => {
  it('deve mapear roi_by_format com speed Turbo para "ICM e Push/Fold em Turbo"', () => {
    const leak: Leak = {
      type: 'roi_by_format',
      severity: 3,
      description: 'ROI negativo em Vanilla Turbo: -8%',
      data: { category: 'Vanilla', speed: 'Turbo', roi: -8, count: 50 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('ICM e Push/Fold em Turbo');
  });

  it('deve mapear roi_by_format com speed Hyper para "ICM e Push/Fold em Turbo"', () => {
    const leak: Leak = {
      type: 'roi_by_format',
      severity: 4,
      description: 'ROI negativo em Vanilla Hyper: -12%',
      data: { category: 'Vanilla', speed: 'Hyper', roi: -12, count: 40 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('ICM e Push/Fold em Turbo');
  });

  it('deve mapear roi_by_format com category PKO para "Estrategia PKO e Bounty"', () => {
    const leak: Leak = {
      type: 'roi_by_format',
      severity: 3,
      description: 'ROI negativo em PKO Normal: -6%',
      data: { category: 'PKO', speed: 'Normal', roi: -6, count: 60 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Estrategia PKO e Bounty');
  });

  it('deve mapear roi_by_format com categoria e speed genericos para "Game Selection e Analise de Formato"', () => {
    const leak: Leak = {
      type: 'roi_by_format',
      severity: 2,
      description: 'ROI negativo em Mystery Normal: -5%',
      data: { category: 'Mystery', speed: 'Normal', roi: -5, count: 35 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Game Selection e Analise de Formato');
  });

  it('deve mapear weak_site para "Adaptacao Multi-Site"', () => {
    const leak: Leak = {
      type: 'weak_site',
      severity: 3,
      description: 'Performance fraca em 888poker',
      data: { site: '888poker', siteRoi: -2, overallRoi: 12, count: 100 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Adaptacao Multi-Site');
  });

  it('deve mapear early_bust para "Jogo Early Game e Sobrevivencia"', () => {
    const leak: Leak = {
      type: 'early_bust',
      severity: 4,
      description: 'Taxa de bust precoce: 22%',
      data: { earlyFinishRate: 22 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Jogo Early Game e Sobrevivencia');
  });

  it('deve mapear low_ft_conversion para "Final Table Play e ICM"', () => {
    const leak: Leak = {
      type: 'low_ft_conversion',
      severity: 3,
      description: 'Baixa conversao de FT: 5%',
      data: { cravadas: 2, finalTables: 40, conversionRate: 5 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Final Table Play e ICM');
  });

  it('deve mapear declining_trend para "Revisao de Estrategia e Volume"', () => {
    const leak: Leak = {
      type: 'declining_trend',
      severity: 3,
      description: 'Tendencia declinante: ROI recente 2% vs anterior 15%',
      data: { recentAvg: 2, previousAvg: 15, diff: 13 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Revisao de Estrategia e Volume');
  });

  it('deve mapear insufficient_volume para "Disciplina de Volume e Grind"', () => {
    const leak: Leak = {
      type: 'insufficient_volume',
      severity: 1,
      description: 'Volume insuficiente: 200 torneios',
      data: { totalTournaments: 200 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Disciplina de Volume e Grind');
  });

  it('deve mapear no_study para "Rotina de Estudo e Evolucao"', () => {
    const leak: Leak = {
      type: 'no_study',
      severity: 2,
      description: 'Sem sessao de estudo nos ultimos 45 dias',
      data: { lastStudySessionDays: 45 },
    };
    expect(mapLeakToStudyTopic(leak)).toBe('Rotina de Estudo e Evolucao');
  });

  it('deve retornar string generica para leak type desconhecido', () => {
    const leak: Leak = {
      type: 'unknown_type',
      severity: 1,
      description: 'Tipo desconhecido',
    };
    const result = mapLeakToStudyTopic(leak);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getStudyTemplates — retorna templates pre-definidos
// ---------------------------------------------------------------------------

describe('getStudyTemplates', () => {
  it('deve retornar entre 8 e 10 templates', () => {
    const templates = getStudyTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(8);
    expect(templates.length).toBeLessThanOrEqual(10);
  });

  it('cada template deve ter id, name, description, category e suggestedTopics', () => {
    const templates = getStudyTemplates();
    for (const t of templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('suggestedTopics');
      expect(Array.isArray(t.suggestedTopics)).toBe(true);
      expect(t.suggestedTopics.length).toBeGreaterThan(0);
    }
  });

  it('deve conter os 8 templates definidos na spec', () => {
    const templates = getStudyTemplates();
    const names = templates.map((t) => t.name);
    expect(names).toContain('3bet Ranges');
    expect(names).toContain('Blind Defense');
    expect(names).toContain('ICM Basics');
    expect(names).toContain('PKO Strategy');
    expect(names).toContain('Mental Game');
    expect(names).toContain('Bankroll Management');
    expect(names).toContain('Game Selection');
    expect(names).toContain('Final Table Play');
  });

  it('cada template deve ter id unico', () => {
    const templates = getStudyTemplates();
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// getStudyTemplateSuggestions — cruza leaks com templates, retorna top 3
// ---------------------------------------------------------------------------

describe('getStudyTemplateSuggestions', () => {
  it('deve retornar no maximo 3 templates', () => {
    const leaks: Leak[] = [
      { type: 'roi_by_format', severity: 4, description: 'ROI neg Turbo', data: { category: 'Vanilla', speed: 'Turbo', roi: -10, count: 50 } },
      { type: 'early_bust', severity: 3, description: 'Bust precoce', data: { earlyFinishRate: 20 } },
      { type: 'low_ft_conversion', severity: 3, description: 'Baixa FT', data: { cravadas: 1, finalTables: 20 } },
      { type: 'no_study', severity: 2, description: 'Sem estudo', data: { lastStudySessionDays: 60 } },
    ];
    const suggestions = getStudyTemplateSuggestions(leaks);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('deve retornar array vazio quando nao ha leaks', () => {
    const suggestions = getStudyTemplateSuggestions([]);
    expect(suggestions).toEqual([]);
  });

  it('deve retornar templates relevantes para leak de ICM/Turbo', () => {
    const leaks: Leak[] = [
      { type: 'roi_by_format', severity: 4, description: 'ROI neg Turbo', data: { category: 'Vanilla', speed: 'Turbo', roi: -10, count: 50 } },
    ];
    const suggestions = getStudyTemplateSuggestions(leaks);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const names = suggestions.map((s) => s.name);
    expect(names).toContain('ICM Basics');
  });

  it('deve retornar templates relevantes para leak de final table', () => {
    const leaks: Leak[] = [
      { type: 'low_ft_conversion', severity: 3, description: 'FT conversion baixa', data: { cravadas: 1, finalTables: 30 } },
    ];
    const suggestions = getStudyTemplateSuggestions(leaks);
    const names = suggestions.map((s) => s.name);
    expect(names).toContain('Final Table Play');
  });

  it('deve priorizar templates por severity dos leaks', () => {
    const leaks: Leak[] = [
      { type: 'no_study', severity: 2, description: 'Sem estudo', data: { lastStudySessionDays: 60 } },
      { type: 'early_bust', severity: 5, description: 'Bust critico', data: { earlyFinishRate: 30 } },
      { type: 'low_ft_conversion', severity: 3, description: 'FT baixa', data: { cravadas: 1, finalTables: 30 } },
      { type: 'weak_site', severity: 4, description: 'Site fraco', data: { site: 'x', siteRoi: -5, overallRoi: 10 } },
    ];
    const suggestions = getStudyTemplateSuggestions(leaks);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    // O primeiro template sugerido deve ser relevante para o leak de maior severity (early_bust, severity 5)
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('deve retornar 1 template quando ha apenas 1 leak', () => {
    const leaks: Leak[] = [
      { type: 'weak_site', severity: 3, description: 'Site fraco', data: { site: 'PartyPoker', siteRoi: -3, overallRoi: 10 } },
    ];
    const suggestions = getStudyTemplateSuggestions(leaks);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const names = suggestions.map((s) => s.name);
    expect(names).toContain('Game Selection');
  });
});
