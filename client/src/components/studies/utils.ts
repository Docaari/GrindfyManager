import { type StudyCard } from "@shared/schema";
import {
  type StudyDashboardStats,
  type WeeklyProgressData,
  type DailyRecommendationsData,
  type StudyEfficiencyData,
  type PersonalizedRecommendation,
  type CategoryPerformanceData,
  type Achievement,
  PRIORITIES,
} from "./types";

export function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function getScoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

export function getPriorityColor(priority: string) {
  const priorityConfig = PRIORITIES.find(p => p.value === priority);
  return priorityConfig?.color || "bg-gray-500";
}

export function calculateWeeklyProgress(cards: StudyCard[]): WeeklyProgressData[] {
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const weeklyData = weekDays.map(day => ({ day, time: 0, sessions: 0 }));
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  cards.forEach(card => {
    if (card.updatedAt && new Date(card.updatedAt) > oneWeekAgo) {
      const dayIndex = new Date(card.updatedAt).getDay();
      weeklyData[dayIndex].time += card.timeInvested || 0;
      weeklyData[dayIndex].sessions += 1;
    }
  });
  return weeklyData;
}

export function calculateDailyRecommendations(cards: StudyCard[]): DailyRecommendationsData {
  const today = new Date();
  const todayStudy = cards.filter(card => {
    if (!card.updatedAt) return false;
    return new Date(card.updatedAt).toDateString() === today.toDateString();
  });
  const totalTimeToday = todayStudy.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
  const remainingTime = Math.max(0, 60 - totalTimeToday);
  return {
    studiedToday: totalTimeToday,
    remainingTime,
    hasStudiedToday: totalTimeToday > 0,
    reachedDailyGoal: totalTimeToday >= 60
  };
}

export function calculateStudyEfficiency(cards: StudyCard[]): StudyEfficiencyData {
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

export function generatePersonalizedRecommendations(cards: StudyCard[]): PersonalizedRecommendation[] {
  const recommendations: PersonalizedRecommendation[] = [];
  const totalTime = cards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
  if (totalTime < 240) {
    recommendations.push({
      type: 'time', priority: 'high',
      title: 'Aumente o Tempo de Estudo',
      description: 'Você investiu apenas ' + formatTime(totalTime) + ' até agora. Tente dedicar pelo menos 1h por dia.',
      action: 'Criar cronograma de estudos'
    });
  }
  const categories = Array.from(new Set(cards.map(c => c.category)));
  if (categories.length < 3) {
    recommendations.push({
      type: 'variety', priority: 'medium',
      title: 'Diversifique suas Categorias',
      description: 'Você está focado em poucas áreas. Considere estudar outras categorias importantes.',
      action: 'Adicionar estudo de ICM ou Psychology'
    });
  }
  const completionRate = cards.length > 0 ? (cards.filter(c => c.status === 'completed').length / cards.length) * 100 : 0;
  if (completionRate < 30) {
    recommendations.push({
      type: 'completion', priority: 'high',
      title: 'Melhore a Taxa de Conclusão',
      description: `Apenas ${Math.round(completionRate)}% dos seus estudos foram concluídos. Foque em finalizar estudos em andamento.`,
      action: 'Revisar estudos ativos'
    });
  }
  return recommendations;
}

export function calculateStudyStreak(cards: StudyCard[]): number {
  const today = new Date();
  let streak = 0;
  let currentDate = new Date(today);
  while (true) {
    const hasStudyToday = cards.some(card => {
      if (!card.updatedAt) return false;
      return new Date(card.updatedAt).toDateString() === currentDate.toDateString() && (card.timeInvested || 0) > 0;
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

export function calculateCategoryPerformance(cards: StudyCard[]): CategoryPerformanceData[] {
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

export function calculateAchievements(cards: StudyCard[], stats: StudyDashboardStats, studyStreak: number): Achievement[] {
  const achievements: Achievement[] = [];
  if (stats.totalTimeInvested >= 100) achievements.push({ title: "Centúria", description: "100+ horas de estudo", icon: "🏆", color: "text-yellow-400" });
  if (stats.totalTimeInvested >= 50) achievements.push({ title: "Dedicado", description: "50+ horas de estudo", icon: "⭐", color: "text-blue-400" });
  if (studyStreak >= 7) achievements.push({ title: "Consistência", description: "7 dias seguidos estudando", icon: "🔥", color: "text-orange-400" });
  if (stats.avgKnowledgeScore >= 90) achievements.push({ title: "Expert", description: "90%+ conhecimento médio", icon: "🧠", color: "text-purple-400" });
  if (stats.completedCards >= 5) achievements.push({ title: "Finalizador", description: "5+ estudos concluídos", icon: "✅", color: "text-green-400" });
  return achievements;
}
