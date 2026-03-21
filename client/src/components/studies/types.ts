import { type StudyCard } from "@shared/schema";

export interface StudyDashboardStats {
  totalCards: number;
  activeCards: number;
  completedCards: number;
  totalTimeInvested: number;
  avgKnowledgeScore: number;
  weeklyTime: number;
  monthlyTime: number;
}

export interface WeeklyProgressData {
  day: string;
  time: number;
  sessions: number;
}

export interface DailyRecommendationsData {
  studiedToday: number;
  remainingTime: number;
  hasStudiedToday: boolean;
  reachedDailyGoal: boolean;
}

export interface StudyEfficiencyData {
  efficiency: number;
  avgTimePerCard: number;
}

export interface PersonalizedRecommendation {
  type: string;
  priority: string;
  title: string;
  description: string;
  action: string;
}

export interface CategoryPerformanceData {
  category: string;
  totalTime: number;
  avgScore: number;
  count: number;
}

export interface Achievement {
  title: string;
  description: string;
  icon: string;
  color: string;
}

export const CATEGORIES = [
  "3bet", "4bet", "River Play", "ICM", "Bubble Play", "Final Table",
  "Tournament Strategy", "Cash Game", "Short Stack", "Big Stack", "Psychology"
];

export const PRIORITIES = [
  { value: "Alta", label: "Alta", color: "bg-red-500" },
  { value: "Média", label: "Média", color: "bg-orange-500" },
  { value: "Baixa", label: "Baixa", color: "bg-green-500" }
];

export const WEEK_DAYS = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' }
];

export type { StudyCard };
