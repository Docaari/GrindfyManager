// =============================================================================
// FP-16: Mapping leak -> topico de estudo e templates pre-definidos
// =============================================================================

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

/**
 * Mapeia um leak detectado para um topico de estudo sugerido.
 */
export function mapLeakToStudyTopic(leak: Leak): string {
  if (leak.type === 'roi_by_format') {
    const speed = leak.data?.speed;
    const category = leak.data?.category;
    if (speed === 'Turbo' || speed === 'Hyper') {
      return 'ICM e Push/Fold em Turbo';
    }
    if (category === 'PKO') {
      return 'Estrategia PKO e Bounty';
    }
    return 'Game Selection e Analise de Formato';
  }
  if (leak.type === 'weak_site') return 'Adaptacao Multi-Site';
  if (leak.type === 'early_bust') return 'Jogo Early Game e Sobrevivencia';
  if (leak.type === 'low_ft_conversion') return 'Final Table Play e ICM';
  if (leak.type === 'declining_trend') return 'Revisao de Estrategia e Volume';
  if (leak.type === 'insufficient_volume') return 'Disciplina de Volume e Grind';
  if (leak.type === 'no_study') return 'Rotina de Estudo e Evolucao';

  return 'Estudo Geral de Poker';
}

/**
 * Retorna 8 templates de estudo pre-definidos.
 */
export function getStudyTemplates(): StudyTemplate[] {
  return [
    {
      id: 'tpl-3bet',
      name: '3bet Ranges',
      description: 'Estudo de ranges de 3bet em diferentes posicoes e situacoes',
      category: 'preflop',
      suggestedTopics: ['3bet Ranges', 'Preflop Strategy', 'Range Construction'],
    },
    {
      id: 'tpl-blind-defense',
      name: 'Blind Defense',
      description: 'Defesa de blinds contra raises e 3bets',
      category: 'preflop',
      suggestedTopics: ['Blind Defense', 'BB Defense', 'SB Play'],
    },
    {
      id: 'tpl-icm',
      name: 'ICM Basics',
      description: 'Fundamentos de ICM e decisoes em bolhas',
      category: 'tournament',
      suggestedTopics: ['ICM Basics', 'ICM e Push/Fold em Turbo', 'Bubble Play'],
    },
    {
      id: 'tpl-pko',
      name: 'PKO Strategy',
      description: 'Estrategia especifica para torneios PKO e bounty',
      category: 'tournament',
      suggestedTopics: ['PKO Strategy', 'Estrategia PKO e Bounty', 'Bounty Hunting'],
    },
    {
      id: 'tpl-mental',
      name: 'Mental Game',
      description: 'Controle emocional, tilt e performance mental',
      category: 'mindset',
      suggestedTopics: ['Mental Game', 'Tilt Control', 'Focus'],
    },
    {
      id: 'tpl-bankroll',
      name: 'Bankroll Management',
      description: 'Gestao de banca e disciplina financeira',
      category: 'management',
      suggestedTopics: ['Bankroll Management', 'Disciplina de Volume e Grind', 'Risk Management'],
    },
    {
      id: 'tpl-game-selection',
      name: 'Game Selection',
      description: 'Selecao de torneios e analise de EV por formato',
      category: 'management',
      suggestedTopics: ['Game Selection', 'Game Selection e Analise de Formato', 'Adaptacao Multi-Site'],
    },
    {
      id: 'tpl-final-table',
      name: 'Final Table Play',
      description: 'Estrategia de mesa final e ICM avancado',
      category: 'tournament',
      suggestedTopics: ['Final Table Play', 'Final Table Play e ICM', 'ICM Advanced'],
    },
  ];
}

/**
 * Cruza leaks com templates e retorna os top 3 mais relevantes,
 * priorizados pela severity dos leaks.
 */
export function getStudyTemplateSuggestions(leaks: Leak[]): StudyTemplate[] {
  if (leaks.length === 0) return [];

  const templates = getStudyTemplates();
  // Sort leaks by severity descending
  const sortedLeaks = [...leaks].sort((a, b) => b.severity - a.severity);

  const suggested: StudyTemplate[] = [];
  const usedTemplateIds = new Set<string>();

  for (const leak of sortedLeaks) {
    if (suggested.length >= 3) break;

    const topic = mapLeakToStudyTopic(leak);
    // Find a template whose suggestedTopics includes this topic
    const match = templates.find(
      (t) => !usedTemplateIds.has(t.id) && t.suggestedTopics.includes(topic)
    );
    if (match) {
      suggested.push(match);
      usedTemplateIds.add(match.id);
    }
  }

  return suggested;
}
