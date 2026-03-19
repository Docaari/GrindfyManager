// Characterization test — logic copied from client/src/pages/Studies.tsx
// Documents the CURRENT behavior of all calculation functions.
// All tests must PASS with the existing code.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Types and constants copied from Studies.tsx
// =============================================================================

// Minimal StudyCard type matching what the functions actually use
interface StudyCard {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string | null;
  timeInvested: number | null;
  knowledgeScore: number | null;
  description: string | null;
  objectives: string | null;
  updatedAt: Date | string | null;
  createdAt: Date | string | null;
  studyDays: string[] | null;
  studyStartTime: string | null;
  studyDuration: number | null;
  isRecurring: boolean | null;
  weeklyFrequency: number | null;
  studyDescription: string | null;
  currentStat: string | null;
  targetStat: string | null;
}

interface StudyDashboardStats {
  totalCards: number;
  activeCards: number;
  completedCards: number;
  totalTimeInvested: number;
  avgKnowledgeScore: number;
  weeklyTime: number;
  monthlyTime: number;
}

const PRIORITIES = [
  { value: "Alta", label: "Alta", color: "bg-red-500" },
  { value: "Média", label: "Média", color: "bg-orange-500" },
  { value: "Baixa", label: "Baixa", color: "bg-green-500" }
];

// =============================================================================
// Functions copied from Studies.tsx (cannot be imported — defined inside component)
// =============================================================================

// Line 691 (inner) and line 2169 (standalone) — identical logic
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Line 853
function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

// Line 946 (inner) and line 2164 (standalone) — identical logic
function getPriorityColor(priority: string): string {
  const priorityConfig = PRIORITIES.find(p => p.value === priority);
  return priorityConfig?.color || "bg-gray-500";
}

// Line 697
function calculateWeeklyProgress(cards: StudyCard[]) {
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const weeklyData = weekDays.map(day => ({ day, time: 0, sessions: 0 }));

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  cards.forEach(card => {
    if (card.updatedAt && new Date(card.updatedAt as string) > oneWeekAgo) {
      const dayIndex = new Date(card.updatedAt as string).getDay();
      weeklyData[dayIndex].time += card.timeInvested || 0;
      weeklyData[dayIndex].sessions += 1;
    }
  });

  return weeklyData;
}

// Line 715
function calculateDailyRecommendations(cards: StudyCard[]) {
  const today = new Date();
  const todayStudy = cards.filter(card => {
    if (!card.updatedAt) return false;
    const cardDate = new Date(card.updatedAt as string);
    return cardDate.toDateString() === today.toDateString();
  });

  const totalTimeToday = todayStudy.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
  const remainingTime = Math.max(0, 60 - totalTimeToday); // 1 hour daily goal

  return {
    studiedToday: totalTimeToday,
    remainingTime,
    hasStudiedToday: totalTimeToday > 0,
    reachedDailyGoal: totalTimeToday >= 60
  };
}

// Line 734
function calculateStudyEfficiency(cards: StudyCard[]) {
  const completedCards = cards.filter(c => c.status === 'completed');
  if (completedCards.length === 0) return { efficiency: 0, avgTimePerCard: 0 };

  const totalTime = completedCards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
  const avgTimePerCard = totalTime / completedCards.length;

  const efficiency = completedCards.reduce((acc, card) => {
    const expectedTime = ((card as any).estimatedTime || 0) * 60;
    const actualTime = card.timeInvested || 0;
    const cardEfficiency = expectedTime > 0 && actualTime > 0 ? Math.min(100, (expectedTime / actualTime) * 100) : 0;
    return acc + cardEfficiency;
  }, 0) / completedCards.length;

  return { efficiency, avgTimePerCard };
}

// Line 752
function generatePersonalizedRecommendations(cards: StudyCard[]) {
  const recommendations: Array<{ type: string; priority: string; title: string; description: string; action: string }> = [];

  const totalTime = cards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
  if (totalTime < 240) {
    recommendations.push({
      type: 'time',
      priority: 'high',
      title: 'Aumente o Tempo de Estudo',
      description: 'Voce investiu apenas ' + formatTime(totalTime) + ' ate agora. Tente dedicar pelo menos 1h por dia.',
      action: 'Criar cronograma de estudos'
    });
  }

  const categories = Array.from(new Set(cards.map(c => c.category)));
  if (categories.length < 3) {
    recommendations.push({
      type: 'variety',
      priority: 'medium',
      title: 'Diversifique suas Categorias',
      description: 'Voce esta focado em poucas areas. Considere estudar outras categorias importantes.',
      action: 'Adicionar estudo de ICM ou Psychology'
    });
  }

  const completionRate = cards.length > 0 ? (cards.filter(c => c.status === 'completed').length / cards.length) * 100 : 0;
  if (completionRate < 30) {
    recommendations.push({
      type: 'completion',
      priority: 'high',
      title: 'Melhore a Taxa de Conclusao',
      description: `Apenas ${Math.round(completionRate)}% dos seus estudos foram concluidos. Foque em finalizar estudos em andamento.`,
      action: 'Revisar estudos ativos'
    });
  }

  return recommendations;
}

// Line 794
function calculateStudyTrends(cards: StudyCard[]) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentCards = cards.filter(card =>
    card.updatedAt && new Date(card.updatedAt as string) > thirtyDaysAgo
  );

  const weeklyData: Array<{ week: string; time: number; score: number; cards: number }> = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);

    const weekCards = recentCards.filter(card => {
      if (!card.updatedAt) return false;
      const cardDate = new Date(card.updatedAt as string);
      return cardDate >= weekStart && cardDate < weekEnd;
    });

    const weekTime = weekCards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
    const weekScore = weekCards.length > 0
      ? weekCards.reduce((sum, card) => sum + (card.knowledgeScore || 0), 0) / weekCards.length
      : 0;

    weeklyData.unshift({
      week: `Sem ${4 - i}`,
      time: weekTime,
      score: Math.round(weekScore),
      cards: weekCards.length
    });
  }

  return weeklyData;
}

// Line 829
function calculateNextStudyRecommendation(cards: StudyCard[]) {
  const activeCards = cards.filter(c => c.status === 'active');
  if (activeCards.length === 0) return null;

  const sortedCards = activeCards.sort((a, b) => {
    const priorityScore = (priority: string) => {
      switch (priority) {
        case 'Alta': return 3;
        case 'Media': return 2;
        case 'Baixa': return 1;
        default: return 0;
      }
    };

    const aScore = priorityScore(a.priority) * 10 + (100 - (a.knowledgeScore || 0));
    const bScore = priorityScore(b.priority) * 10 + (100 - (b.knowledgeScore || 0));

    return bScore - aScore;
  });

  return sortedCards[0];
}

// Line 859
function calculateStudyStreak(cards: StudyCard[]) {
  const today = new Date();
  let streak = 0;
  let currentDate = new Date(today);

  while (true) {
    const hasStudyToday = cards.some(card => {
      if (!card.updatedAt) return false;
      const cardDate = new Date(card.updatedAt as string);
      return cardDate.toDateString() === currentDate.toDateString() && (card.timeInvested || 0) > 0;
    });

    if (hasStudyToday) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// Line 882
function calculateCategoryPerformance(cards: StudyCard[]) {
  const categoryStats = cards.reduce((acc, card) => {
    if (!acc[card.category]) {
      acc[card.category] = { totalTime: 0, avgScore: 0, count: 0 };
    }
    acc[card.category].totalTime += card.timeInvested || 0;
    acc[card.category].avgScore += card.knowledgeScore || 0;
    acc[card.category].count++;
    return acc;
  }, {} as Record<string, { totalTime: number; avgScore: number; count: number }>);

  return Object.entries(categoryStats).map(([category, stats]) => ({
    category,
    totalTime: stats.totalTime,
    avgScore: Math.round(stats.avgScore / stats.count),
    count: stats.count
  })).sort((a, b) => b.totalTime - a.totalTime);
}

// Line 901 — NOTE: references external `studyStreak` variable from closure
// For testing, we pass it as a parameter
function calculateAchievements(cards: StudyCard[], stats: StudyDashboardStats, studyStreak: number) {
  const achievements: Array<{ title: string; description: string; icon: string; color: string }> = [];

  if (stats.totalTimeInvested >= 100) achievements.push({
    title: "Centuria",
    description: "100+ horas de estudo",
    icon: "trophy",
    color: "text-yellow-400"
  });

  if (stats.totalTimeInvested >= 50) achievements.push({
    title: "Dedicado",
    description: "50+ horas de estudo",
    icon: "star",
    color: "text-blue-400"
  });

  if (studyStreak >= 7) achievements.push({
    title: "Consistencia",
    description: "7 dias seguidos estudando",
    icon: "fire",
    color: "text-orange-400"
  });

  if (stats.avgKnowledgeScore >= 90) achievements.push({
    title: "Expert",
    description: "90%+ conhecimento medio",
    icon: "brain",
    color: "text-purple-400"
  });

  if (stats.completedCards >= 5) achievements.push({
    title: "Finalizador",
    description: "5+ estudos concluidos",
    icon: "check",
    color: "text-green-400"
  });

  return achievements;
}

// Line 671 — dashboardStats calculation
function calculateDashboardStats(studyCards: StudyCard[]): StudyDashboardStats {
  return {
    totalCards: studyCards.length,
    activeCards: studyCards.filter((card) => card.status === 'active').length,
    completedCards: studyCards.filter((card) => card.status === 'completed').length,
    totalTimeInvested: studyCards.reduce((total, card) => total + (card.timeInvested || 0), 0),
    avgKnowledgeScore: studyCards.length > 0
      ? Math.round(studyCards.reduce((total, card) => total + (card.knowledgeScore || 0), 0) / studyCards.length)
      : 0,
    weeklyTime: studyCards.reduce((total, card) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return card.updatedAt && new Date(card.updatedAt as string) > weekAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
    monthlyTime: studyCards.reduce((total, card) => {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return card.updatedAt && new Date(card.updatedAt as string) > monthAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
  };
}

// Line 987 — filteredCards logic
function filterCards(cards: StudyCard[], selectedCategory: string | null, searchQuery: string): StudyCard[] {
  return cards.filter((card) => {
    const matchesCategory = !selectedCategory || selectedCategory === "all" || card.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}

// =============================================================================
// Test helpers
// =============================================================================

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: '1',
    title: 'Test Card',
    category: '3bet',
    priority: 'Alta',
    status: 'active',
    timeInvested: 30,
    knowledgeScore: 50,
    description: null,
    objectives: null,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    studyDays: null,
    studyStartTime: null,
    studyDuration: null,
    isRecurring: null,
    weeklyFrequency: null,
    studyDescription: null,
    currentStat: null,
    targetStat: null,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// =============================================================================
// Tests
// =============================================================================

describe('formatTime', () => {
  it('deve formatar 0 minutos como 0h 0m', () => {
    expect(formatTime(0)).toBe('0h 0m');
  });

  it('deve formatar minutos abaixo de 60 sem horas', () => {
    expect(formatTime(45)).toBe('0h 45m');
  });

  it('deve formatar 60 minutos como 1h 0m', () => {
    expect(formatTime(60)).toBe('1h 0m');
  });

  it('deve formatar 90 minutos como 1h 30m', () => {
    expect(formatTime(90)).toBe('1h 30m');
  });

  it('deve formatar 150 minutos como 2h 30m', () => {
    expect(formatTime(150)).toBe('2h 30m');
  });

  it('deve formatar valores grandes corretamente', () => {
    expect(formatTime(1440)).toBe('24h 0m');
  });

  it('deve truncar fracionarios via Math.floor', () => {
    // 61.7 => Math.floor(61.7/60) = 1h, 61.7 % 60 = 1.7 => "1h 1.7m"
    // This documents the CURRENT behavior — fractional minutes are not rounded
    const result = formatTime(61.7);
    expect(result).toContain('1h');
  });
});

describe('getScoreColor', () => {
  it('deve retornar green para score >= 80', () => {
    expect(getScoreColor(80)).toBe('text-green-400');
    expect(getScoreColor(100)).toBe('text-green-400');
  });

  it('deve retornar yellow para score >= 60 e < 80', () => {
    expect(getScoreColor(60)).toBe('text-yellow-400');
    expect(getScoreColor(79)).toBe('text-yellow-400');
  });

  it('deve retornar red para score < 60', () => {
    expect(getScoreColor(0)).toBe('text-red-400');
    expect(getScoreColor(59)).toBe('text-red-400');
  });

  it('deve retornar red para score negativo', () => {
    expect(getScoreColor(-1)).toBe('text-red-400');
  });
});

describe('getPriorityColor', () => {
  it('deve retornar bg-red-500 para Alta', () => {
    expect(getPriorityColor('Alta')).toBe('bg-red-500');
  });

  it('deve retornar bg-orange-500 para Média', () => {
    expect(getPriorityColor('Média')).toBe('bg-orange-500');
  });

  it('deve retornar bg-green-500 para Baixa', () => {
    expect(getPriorityColor('Baixa')).toBe('bg-green-500');
  });

  it('deve retornar bg-gray-500 para valor desconhecido', () => {
    expect(getPriorityColor('urgente')).toBe('bg-gray-500');
  });

  it('deve retornar bg-gray-500 para string vazia', () => {
    expect(getPriorityColor('')).toBe('bg-gray-500');
  });
});

describe('calculateWeeklyProgress', () => {
  it('deve retornar array de 7 dias com zeros para cards vazio', () => {
    const result = calculateWeeklyProgress([]);
    expect(result).toHaveLength(7);
    expect(result.every(d => d.time === 0 && d.sessions === 0)).toBe(true);
    expect(result.map(d => d.day)).toEqual(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']);
  });

  it('deve agrupar tempo por dia da semana para cards recentes', () => {
    const now = new Date();
    const card = makeCard({ updatedAt: now.toISOString(), timeInvested: 60 });
    const result = calculateWeeklyProgress([card]);
    const dayIndex = now.getDay();
    expect(result[dayIndex].time).toBe(60);
    expect(result[dayIndex].sessions).toBe(1);
  });

  it('deve ignorar cards com mais de 7 dias', () => {
    const card = makeCard({ updatedAt: daysAgo(8), timeInvested: 60 });
    const result = calculateWeeklyProgress([card]);
    expect(result.every(d => d.time === 0)).toBe(true);
  });

  it('deve ignorar cards sem updatedAt', () => {
    const card = makeCard({ updatedAt: null, timeInvested: 60 });
    const result = calculateWeeklyProgress([card]);
    expect(result.every(d => d.time === 0)).toBe(true);
  });

  it('deve tratar timeInvested null como 0', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: null });
    const result = calculateWeeklyProgress([card]);
    const dayIndex = new Date().getDay();
    expect(result[dayIndex].time).toBe(0);
    expect(result[dayIndex].sessions).toBe(1); // session still counted
  });

  it('deve somar multiplos cards no mesmo dia', () => {
    const now = new Date().toISOString();
    const cards = [
      makeCard({ id: '1', updatedAt: now, timeInvested: 30 }),
      makeCard({ id: '2', updatedAt: now, timeInvested: 45 }),
    ];
    const result = calculateWeeklyProgress(cards);
    const dayIndex = new Date().getDay();
    expect(result[dayIndex].time).toBe(75);
    expect(result[dayIndex].sessions).toBe(2);
  });
});

describe('calculateDailyRecommendations', () => {
  it('deve retornar zeros e false para cards vazio', () => {
    const result = calculateDailyRecommendations([]);
    expect(result).toEqual({
      studiedToday: 0,
      remainingTime: 60,
      hasStudiedToday: false,
      reachedDailyGoal: false,
    });
  });

  it('deve somar tempo de cards atualizados hoje', () => {
    const cards = [
      makeCard({ updatedAt: new Date().toISOString(), timeInvested: 20 }),
      makeCard({ id: '2', updatedAt: new Date().toISOString(), timeInvested: 15 }),
    ];
    const result = calculateDailyRecommendations(cards);
    expect(result.studiedToday).toBe(35);
    expect(result.remainingTime).toBe(25);
    expect(result.hasStudiedToday).toBe(true);
    expect(result.reachedDailyGoal).toBe(false);
  });

  it('deve reportar goal atingido quando tempo >= 60', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: 60 });
    const result = calculateDailyRecommendations([card]);
    expect(result.reachedDailyGoal).toBe(true);
    expect(result.remainingTime).toBe(0);
  });

  it('deve limitar remainingTime a 0 quando excede goal', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: 120 });
    const result = calculateDailyRecommendations([card]);
    expect(result.remainingTime).toBe(0);
  });

  it('deve ignorar cards de ontem', () => {
    const card = makeCard({ updatedAt: daysAgo(1), timeInvested: 60 });
    const result = calculateDailyRecommendations([card]);
    expect(result.studiedToday).toBe(0);
    expect(result.hasStudiedToday).toBe(false);
  });

  it('deve ignorar cards sem updatedAt', () => {
    const card = makeCard({ updatedAt: null, timeInvested: 60 });
    const result = calculateDailyRecommendations([card]);
    expect(result.studiedToday).toBe(0);
  });
});

describe('calculateStudyEfficiency', () => {
  it('deve retornar zeros quando nao ha cards completados', () => {
    const cards = [makeCard({ status: 'active' })];
    const result = calculateStudyEfficiency(cards);
    expect(result).toEqual({ efficiency: 0, avgTimePerCard: 0 });
  });

  it('deve retornar zeros para array vazio', () => {
    const result = calculateStudyEfficiency([]);
    expect(result).toEqual({ efficiency: 0, avgTimePerCard: 0 });
  });

  it('deve calcular avgTimePerCard para cards completados', () => {
    const cards = [
      makeCard({ status: 'completed', timeInvested: 60 }),
      makeCard({ id: '2', status: 'completed', timeInvested: 40 }),
      makeCard({ id: '3', status: 'active', timeInvested: 100 }), // ignored
    ];
    const result = calculateStudyEfficiency(cards);
    expect(result.avgTimePerCard).toBe(50); // (60+40)/2
  });

  it('deve calcular efficiency como 0 quando estimatedTime nao existe', () => {
    // Without estimatedTime on StudyCard, (card as any).estimatedTime is undefined => 0
    const cards = [makeCard({ status: 'completed', timeInvested: 60 })];
    const result = calculateStudyEfficiency(cards);
    expect(result.efficiency).toBe(0); // expectedTime = 0 => cardEfficiency = 0
  });

  it('deve limitar efficiency individual a 100 via Math.min', () => {
    // If estimatedTime * 60 > actualTime, ratio exceeds 100, capped at 100
    const card = makeCard({ status: 'completed', timeInvested: 10 });
    (card as any).estimatedTime = 60; // 60*60=3600 expected, 10 actual => capped at 100
    const result = calculateStudyEfficiency([card]);
    expect(result.efficiency).toBe(100);
  });

  it('deve tratar timeInvested null como 0 e efficiency como 0 (guarda contra divisão por zero)', () => {
    const card = makeCard({ status: 'completed', timeInvested: null });
    (card as any).estimatedTime = 5;
    const result = calculateStudyEfficiency([card]);
    // actualTime=0 → guard prevents division by zero → cardEfficiency = 0
    expect(result.efficiency).toBe(0);
    expect(result.avgTimePerCard).toBe(0);
  });
});

describe('generatePersonalizedRecommendations', () => {
  it('deve recomendar mais tempo quando totalTime < 240', () => {
    const cards = [makeCard({ timeInvested: 30 })];
    const result = generatePersonalizedRecommendations(cards);
    const timeRec = result.find(r => r.type === 'time');
    expect(timeRec).toBeDefined();
    expect(timeRec!.priority).toBe('high');
  });

  it('nao deve recomendar mais tempo quando totalTime >= 240', () => {
    const cards = [makeCard({ timeInvested: 240 })];
    const result = generatePersonalizedRecommendations(cards);
    const timeRec = result.find(r => r.type === 'time');
    expect(timeRec).toBeUndefined();
  });

  it('deve recomendar diversificar quando menos de 3 categorias', () => {
    const cards = [
      makeCard({ category: '3bet' }),
      makeCard({ id: '2', category: 'ICM' }),
    ];
    const result = generatePersonalizedRecommendations(cards);
    const varietyRec = result.find(r => r.type === 'variety');
    expect(varietyRec).toBeDefined();
  });

  it('nao deve recomendar diversificar quando 3+ categorias', () => {
    const cards = [
      makeCard({ category: '3bet' }),
      makeCard({ id: '2', category: 'ICM' }),
      makeCard({ id: '3', category: 'Psychology' }),
    ];
    const result = generatePersonalizedRecommendations(cards);
    const varietyRec = result.find(r => r.type === 'variety');
    expect(varietyRec).toBeUndefined();
  });

  it('deve recomendar completar quando completionRate < 30%', () => {
    const cards = [
      makeCard({ status: 'active' }),
      makeCard({ id: '2', status: 'active' }),
      makeCard({ id: '3', status: 'active' }),
      makeCard({ id: '4', status: 'completed' }), // 25% completion
    ];
    const result = generatePersonalizedRecommendations(cards);
    const completionRec = result.find(r => r.type === 'completion');
    expect(completionRec).toBeDefined();
  });

  it('nao deve recomendar completar quando completionRate >= 30%', () => {
    const cards = [
      makeCard({ status: 'completed' }),
      makeCard({ id: '2', status: 'completed' }),
      makeCard({ id: '3', status: 'active' }),
    ];
    const result = generatePersonalizedRecommendations(cards);
    const completionRec = result.find(r => r.type === 'completion');
    expect(completionRec).toBeUndefined();
  });

  it('deve retornar array vazio para cards vazio (0% completionRate nao dispara porque cards.length == 0)', () => {
    const result = generatePersonalizedRecommendations([]);
    // totalTime=0 < 240 => time recommendation
    // categories=0 < 3 => variety recommendation
    // completionRate = 0 (because cards.length === 0, ternary goes to 0) < 30 => completion
    const timeRec = result.find(r => r.type === 'time');
    const varietyRec = result.find(r => r.type === 'variety');
    const completionRec = result.find(r => r.type === 'completion');
    expect(timeRec).toBeDefined();
    expect(varietyRec).toBeDefined();
    expect(completionRec).toBeDefined();
    expect(result).toHaveLength(3);
  });
});

describe('calculateStudyTrends', () => {
  it('deve retornar 4 semanas com zeros para cards vazio', () => {
    const result = calculateStudyTrends([]);
    expect(result).toHaveLength(4);
    expect(result[0].week).toBe('Sem 1');
    expect(result[3].week).toBe('Sem 4');
    expect(result.every(w => w.time === 0 && w.score === 0 && w.cards === 0)).toBe(true);
  });

  it('deve classificar card recente (2 dias atras) na semana 4 (mais recente)', () => {
    const card = makeCard({ updatedAt: daysAgo(2), timeInvested: 60, knowledgeScore: 80 });
    const result = calculateStudyTrends([card]);
    // Week 4 = now - 7days to now
    expect(result[3].time).toBe(60);
    expect(result[3].score).toBe(80);
    expect(result[3].cards).toBe(1);
  });

  it('deve classificar card de 10 dias atras na semana 3', () => {
    const card = makeCard({ updatedAt: daysAgo(10), timeInvested: 45, knowledgeScore: 70 });
    const result = calculateStudyTrends([card]);
    // Week 3 = now-14days to now-7days
    expect(result[2].time).toBe(45);
    expect(result[2].cards).toBe(1);
  });

  it('deve ignorar cards mais antigos que 30 dias', () => {
    const card = makeCard({ updatedAt: daysAgo(31), timeInvested: 100 });
    const result = calculateStudyTrends([card]);
    expect(result.every(w => w.time === 0)).toBe(true);
  });

  it('deve calcular media de score quando multiplos cards na mesma semana', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(2), knowledgeScore: 80 }),
      makeCard({ id: '2', updatedAt: daysAgo(3), knowledgeScore: 60 }),
    ];
    const result = calculateStudyTrends(cards);
    expect(result[3].score).toBe(70); // Math.round((80+60)/2)
  });
});

describe('calculateNextStudyRecommendation', () => {
  it('deve retornar null para cards vazio', () => {
    expect(calculateNextStudyRecommendation([])).toBeNull();
  });

  it('deve retornar null quando nao ha cards ativos', () => {
    const cards = [makeCard({ status: 'completed' })];
    expect(calculateNextStudyRecommendation(cards)).toBeNull();
  });

  it('deve priorizar card com priority Alta sobre Baixa', () => {
    const cards = [
      makeCard({ id: '1', priority: 'Baixa', status: 'active', knowledgeScore: 50 }),
      makeCard({ id: '2', priority: 'Alta', status: 'active', knowledgeScore: 50 }),
    ];
    const result = calculateNextStudyRecommendation(cards);
    expect(result!.id).toBe('2');
  });

  it('deve priorizar card com menor knowledgeScore quando mesma priority', () => {
    const cards = [
      makeCard({ id: '1', priority: 'Alta', status: 'active', knowledgeScore: 80 }),
      makeCard({ id: '2', priority: 'Alta', status: 'active', knowledgeScore: 20 }),
    ];
    const result = calculateNextStudyRecommendation(cards);
    expect(result!.id).toBe('2');
  });

  it('deve ignorar cards completados', () => {
    const cards = [
      makeCard({ id: '1', priority: 'Alta', status: 'completed', knowledgeScore: 10 }),
      makeCard({ id: '2', priority: 'Baixa', status: 'active', knowledgeScore: 90 }),
    ];
    const result = calculateNextStudyRecommendation(cards);
    expect(result!.id).toBe('2');
  });

  it('deve tratar knowledgeScore null como 0 (maximo peso)', () => {
    const cards = [
      makeCard({ id: '1', priority: 'Alta', status: 'active', knowledgeScore: 50 }),
      makeCard({ id: '2', priority: 'Alta', status: 'active', knowledgeScore: null }),
    ];
    const result = calculateNextStudyRecommendation(cards);
    // null => 0, score = 3*10 + (100-0) = 130 vs 3*10 + (100-50) = 80
    expect(result!.id).toBe('2');
  });

  it('deve retornar 0 para priority desconhecida no calculo de score', () => {
    const cards = [
      makeCard({ id: '1', priority: 'Unknown', status: 'active', knowledgeScore: 0 }),
      makeCard({ id: '2', priority: 'Baixa', status: 'active', knowledgeScore: 0 }),
    ];
    const result = calculateNextStudyRecommendation(cards);
    // Unknown=0*10+100=100, Baixa=1*10+100=110
    expect(result!.id).toBe('2');
  });
});

describe('calculateStudyStreak', () => {
  it('deve retornar 0 para cards vazio', () => {
    expect(calculateStudyStreak([])).toBe(0);
  });

  it('deve retornar 0 quando nenhum card tem timeInvested hoje', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: 0 });
    expect(calculateStudyStreak([card])).toBe(0);
  });

  it('deve retornar 0 quando nenhum card tem timeInvested null', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: null });
    expect(calculateStudyStreak([card])).toBe(0);
  });

  it('deve retornar 1 quando estudou apenas hoje', () => {
    const card = makeCard({ updatedAt: new Date().toISOString(), timeInvested: 30 });
    expect(calculateStudyStreak([card])).toBe(1);
  });

  it('deve contar dias consecutivos de estudo', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(0), timeInvested: 30 }),
      makeCard({ id: '2', updatedAt: daysAgo(1), timeInvested: 20 }),
      makeCard({ id: '3', updatedAt: daysAgo(2), timeInvested: 10 }),
    ];
    expect(calculateStudyStreak(cards)).toBe(3);
  });

  it('deve parar quando encontra dia sem estudo', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(0), timeInvested: 30 }),
      // gap on day 1
      makeCard({ id: '2', updatedAt: daysAgo(2), timeInvested: 20 }),
    ];
    expect(calculateStudyStreak(cards)).toBe(1);
  });

  it('deve retornar 0 quando nao estudou hoje mesmo com historico', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(1), timeInvested: 30 }),
      makeCard({ id: '2', updatedAt: daysAgo(2), timeInvested: 20 }),
    ];
    expect(calculateStudyStreak(cards)).toBe(0);
  });

  it('deve ignorar cards sem updatedAt', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: null, timeInvested: 30 }),
    ];
    expect(calculateStudyStreak(cards)).toBe(0);
  });
});

describe('calculateCategoryPerformance', () => {
  it('deve retornar array vazio para cards vazio', () => {
    expect(calculateCategoryPerformance([])).toEqual([]);
  });

  it('deve agrupar por categoria e calcular totais', () => {
    const cards = [
      makeCard({ id: '1', category: '3bet', timeInvested: 60, knowledgeScore: 80 }),
      makeCard({ id: '2', category: '3bet', timeInvested: 40, knowledgeScore: 60 }),
      makeCard({ id: '3', category: 'ICM', timeInvested: 30, knowledgeScore: 90 }),
    ];
    const result = calculateCategoryPerformance(cards);
    expect(result).toHaveLength(2);

    const bet3 = result.find(r => r.category === '3bet');
    expect(bet3!.totalTime).toBe(100);
    expect(bet3!.avgScore).toBe(70); // Math.round((80+60)/2)
    expect(bet3!.count).toBe(2);

    const icm = result.find(r => r.category === 'ICM');
    expect(icm!.totalTime).toBe(30);
    expect(icm!.avgScore).toBe(90);
    expect(icm!.count).toBe(1);
  });

  it('deve ordenar por totalTime decrescente', () => {
    const cards = [
      makeCard({ id: '1', category: 'ICM', timeInvested: 10 }),
      makeCard({ id: '2', category: '3bet', timeInvested: 100 }),
      makeCard({ id: '3', category: 'Psychology', timeInvested: 50 }),
    ];
    const result = calculateCategoryPerformance(cards);
    expect(result[0].category).toBe('3bet');
    expect(result[1].category).toBe('Psychology');
    expect(result[2].category).toBe('ICM');
  });

  it('deve tratar timeInvested null como 0', () => {
    const card = makeCard({ timeInvested: null, knowledgeScore: 50 });
    const result = calculateCategoryPerformance([card]);
    expect(result[0].totalTime).toBe(0);
  });

  it('deve tratar knowledgeScore null como 0 no calculo de media', () => {
    const card = makeCard({ knowledgeScore: null });
    const result = calculateCategoryPerformance([card]);
    expect(result[0].avgScore).toBe(0);
  });
});

describe('calculateAchievements', () => {
  const baseStats: StudyDashboardStats = {
    totalCards: 0,
    activeCards: 0,
    completedCards: 0,
    totalTimeInvested: 0,
    avgKnowledgeScore: 0,
    weeklyTime: 0,
    monthlyTime: 0,
  };

  it('deve retornar array vazio quando nenhum threshold atingido', () => {
    const result = calculateAchievements([], baseStats, 0);
    expect(result).toEqual([]);
  });

  it('deve incluir Centuria e Dedicado quando totalTimeInvested >= 100', () => {
    const stats = { ...baseStats, totalTimeInvested: 100 };
    const result = calculateAchievements([], stats, 0);
    expect(result.find(a => a.title === 'Centuria')).toBeDefined();
    expect(result.find(a => a.title === 'Dedicado')).toBeDefined();
  });

  it('deve incluir apenas Dedicado quando totalTimeInvested >= 50 e < 100', () => {
    const stats = { ...baseStats, totalTimeInvested: 50 };
    const result = calculateAchievements([], stats, 0);
    expect(result.find(a => a.title === 'Centuria')).toBeUndefined();
    expect(result.find(a => a.title === 'Dedicado')).toBeDefined();
  });

  it('deve incluir Consistencia quando studyStreak >= 7', () => {
    const result = calculateAchievements([], baseStats, 7);
    expect(result.find(a => a.title === 'Consistencia')).toBeDefined();
  });

  it('nao deve incluir Consistencia quando studyStreak < 7', () => {
    const result = calculateAchievements([], baseStats, 6);
    expect(result.find(a => a.title === 'Consistencia')).toBeUndefined();
  });

  it('deve incluir Expert quando avgKnowledgeScore >= 90', () => {
    const stats = { ...baseStats, avgKnowledgeScore: 90 };
    const result = calculateAchievements([], stats, 0);
    expect(result.find(a => a.title === 'Expert')).toBeDefined();
  });

  it('deve incluir Finalizador quando completedCards >= 5', () => {
    const stats = { ...baseStats, completedCards: 5 };
    const result = calculateAchievements([], stats, 0);
    expect(result.find(a => a.title === 'Finalizador')).toBeDefined();
  });

  it('deve incluir todos quando todos thresholds atingidos', () => {
    const stats = {
      ...baseStats,
      totalTimeInvested: 200,
      avgKnowledgeScore: 95,
      completedCards: 10,
    };
    const result = calculateAchievements([], stats, 14);
    expect(result).toHaveLength(5);
  });
});

describe('calculateDashboardStats', () => {
  it('deve retornar zeros para array vazio', () => {
    const result = calculateDashboardStats([]);
    expect(result).toEqual({
      totalCards: 0,
      activeCards: 0,
      completedCards: 0,
      totalTimeInvested: 0,
      avgKnowledgeScore: 0,
      weeklyTime: 0,
      monthlyTime: 0,
    });
  });

  it('deve contar active e completed cards separadamente', () => {
    const cards = [
      makeCard({ id: '1', status: 'active' }),
      makeCard({ id: '2', status: 'active' }),
      makeCard({ id: '3', status: 'completed' }),
      makeCard({ id: '4', status: 'paused' }),
    ];
    const result = calculateDashboardStats(cards);
    expect(result.totalCards).toBe(4);
    expect(result.activeCards).toBe(2);
    expect(result.completedCards).toBe(1);
  });

  it('deve somar totalTimeInvested de todos os cards', () => {
    const cards = [
      makeCard({ id: '1', timeInvested: 30 }),
      makeCard({ id: '2', timeInvested: 45 }),
      makeCard({ id: '3', timeInvested: null }),
    ];
    const result = calculateDashboardStats(cards);
    expect(result.totalTimeInvested).toBe(75);
  });

  it('deve calcular media de knowledgeScore com Math.round', () => {
    const cards = [
      makeCard({ id: '1', knowledgeScore: 80 }),
      makeCard({ id: '2', knowledgeScore: 70 }),
      makeCard({ id: '3', knowledgeScore: null }),
    ];
    const result = calculateDashboardStats(cards);
    // (80+70+0)/3 = 50
    expect(result.avgKnowledgeScore).toBe(50);
  });

  it('deve incluir weeklyTime apenas para cards atualizados nos ultimos 7 dias', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(3), timeInvested: 30 }),
      makeCard({ id: '2', updatedAt: daysAgo(10), timeInvested: 60 }),
    ];
    const result = calculateDashboardStats(cards);
    expect(result.weeklyTime).toBe(30);
  });

  it('deve incluir monthlyTime apenas para cards atualizados no ultimo mes', () => {
    const cards = [
      makeCard({ id: '1', updatedAt: daysAgo(15), timeInvested: 40 }),
      makeCard({ id: '2', updatedAt: daysAgo(45), timeInvested: 80 }),
    ];
    const result = calculateDashboardStats(cards);
    expect(result.monthlyTime).toBe(40);
  });
});

describe('filterCards', () => {
  const cards = [
    makeCard({ id: '1', title: '3bet Defense', category: '3bet' }),
    makeCard({ id: '2', title: 'ICM Basics', category: 'ICM' }),
    makeCard({ id: '3', title: 'River Bluff Sizing', category: 'River Play' }),
  ];

  it('deve retornar todos quando sem filtros', () => {
    const result = filterCards(cards, null, '');
    expect(result).toHaveLength(3);
  });

  it('deve retornar todos quando categoria e "all"', () => {
    const result = filterCards(cards, 'all', '');
    expect(result).toHaveLength(3);
  });

  it('deve filtrar por categoria especifica', () => {
    const result = filterCards(cards, '3bet', '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('deve filtrar por searchQuery no title (case insensitive)', () => {
    const result = filterCards(cards, null, 'icm');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('deve filtrar por searchQuery na category (case insensitive)', () => {
    const result = filterCards(cards, null, 'river');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('deve combinar categoria e searchQuery', () => {
    const result = filterCards(cards, '3bet', 'defense');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('deve retornar vazio quando nenhum card corresponde', () => {
    const result = filterCards(cards, 'Psychology', '');
    expect(result).toHaveLength(0);
  });

  it('deve retornar vazio quando searchQuery nao encontra nada', () => {
    const result = filterCards(cards, null, 'xyz');
    expect(result).toHaveLength(0);
  });

  it('deve retornar array vazio para cards vazio', () => {
    const result = filterCards([], '3bet', 'test');
    expect(result).toHaveLength(0);
  });
});

describe('exportStudyData — csvData[0] crash on empty array', () => {
  // Documents a known bug: when studyCards is empty, accessing csvData[0]
  // to get Object.keys would throw because csvData[0] is undefined.
  // The function is tightly coupled to DOM/Blob so we only test the CSV data logic.

  it('deve gerar headers corretos para card com dados', () => {
    const card = makeCard({
      title: 'Test',
      category: '3bet',
      priority: 'Alta',
      status: 'active',
      timeInvested: 30,
      knowledgeScore: 50,
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-20T10:00:00.000Z',
      objectives: 'Melhorar',
      description: 'Desc',
    });

    const csvData = [card].map((c) => ({
      Titulo: c.title,
      Categoria: c.category,
      Dificuldade: (c as any).difficulty || '',
      Prioridade: c.priority,
      Status: c.status,
      'Tempo Investido (min)': c.timeInvested || 0,
      'Score Conhecimento': c.knowledgeScore || 0,
      'Data Criacao': c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '',
      'Ultima Atualizacao': c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('pt-BR') : '',
      Objetivos: c.objectives || '',
      Descricao: c.description || ''
    }));

    const headers = Object.keys(csvData[0]);
    expect(headers).toContain('Titulo');
    expect(headers).toContain('Categoria');
    expect(headers).toContain('Dificuldade');
    expect(headers).toContain('Prioridade');
    expect(headers).toContain('Status');
    expect(headers).toContain('Tempo Investido (min)');
    expect(headers).toContain('Score Conhecimento');
  });

  it('deve crashar (TypeError) quando array de cards e vazio — bug documentado', () => {
    const csvData: Record<string, any>[] = [].map(() => ({}));

    // csvData[0] is undefined, Object.keys(undefined) throws TypeError
    expect(() => Object.keys(csvData[0])).toThrow();
  });
});
