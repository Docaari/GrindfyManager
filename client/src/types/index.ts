export interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
  subscriptionType: string;
  timezone: string;
  currency: string;
}

export interface Tournament {
  id: string;
  userId: string;
  name: string;
  buyIn: string;
  prizePool?: string;
  position?: number;
  prize: string;
  datePlayed: string;
  site: string;
  format: string;
  category: string;
  speed: string;
  fieldSize?: number;
  reentries: number;
  finalTable: boolean;
  bigHit: boolean;
  earlyFinish: boolean;
  lateFinish: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
  templateId?: string;
  grindSessionId?: string;
}

export interface TournamentTemplate {
  id: string;
  userId: string;
  name: string;
  site: string;
  format: string;
  category: string;
  speed: string;
  dayOfWeek: number[];
  startTime: string[];
  avgBuyIn: string;
  avgRoi: string;
  totalPlayed: number;
  totalProfit: string;
  finalTables: number;
  bigHits: number;
  avgFieldSize?: number;
  createdAt: string;
  updatedAt: string;
  lastPlayed?: string;
}

export interface WeeklyPlan {
  id: string;
  userId: string;
  weekStart: string;
  title?: string;
  description?: string;
  targetBuyins?: string;
  targetProfit?: string;
  targetVolume?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedTournament {
  id: string;
  planId: string;
  templateId: string;
  dayOfWeek: number;
  startTime: string;
  isPlayed: boolean;
  notes?: string;
  createdAt: string;
}

export interface GrindSession {
  id: string;
  userId: string;
  date: string;
  plannedBuyins: string;
  actualBuyins: string;
  profitLoss: string;
  duration?: number;
  startTime?: string;
  endTime?: string;
  status: "planned" | "active" | "completed" | "cancelled";
  tournamentsPlayed: number;
  finalTables: number;
  bigHits: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationLog {
  id: string;
  userId: string;
  sessionId?: string;
  mentalState: number;
  focusLevel: number;
  confidenceLevel: number;
  exercisesCompleted: string[];
  warmupCompleted: boolean;
  sessionGoals?: string;
  notes?: string;
  postSessionReview?: string;
  goalsAchieved?: boolean;
  lessonsLearned?: string;
  createdAt: string;
}

export interface CustomGroup {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  criteria: any;
  createdAt: string;
  updatedAt: string;
}

export interface CoachingInsight {
  id: string;
  userId: string;
  type: "suggestion" | "warning" | "opportunity";
  category: string;
  title: string;
  description: string;
  priority: number;
  data?: any;
  isRead: boolean;
  isApplied: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface UserSettings {
  id: string;
  userId: string;
  bigHitMultiplier: string;
  earlyFinishThreshold: string;
  lateFinishThreshold: string;
  emailNotifications: boolean;
  coachingAlerts: boolean;
  sessionReminders: boolean;
  defaultChartPeriod: string;
  preferredCurrency: string;
  darkMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalProfit: number;
  totalBuyins: number;
  totalTournaments: number;
  avgBuyin: number;
  roi: number;
  finalTables: number;
  bigHits: number;
}

export interface PerformanceData {
  date: string;
  profit: number;
  buyins: number;
  count: number;
}

export interface FileUploadResponse {
  message: string;
  count: number;
  tournaments: Tournament[];
}
