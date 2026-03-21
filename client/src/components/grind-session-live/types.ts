export interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  skipBreaksToday: boolean;
  objectiveCompleted?: boolean;
  finalNotes?: string;
  screenCap?: number;
}

export interface SessionTournament {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  rebuys: number;
  result: string;
  position?: number;
  fieldSize?: number;
  status: string;
  fromPlannedTournament: boolean;
  // Additional fields used throughout the component
  type?: string;
  category?: string;
  speed?: string;
  time?: string;
  guaranteed?: string;
  bounty?: string;
  prioridade?: number;
  plannedTournamentId?: string;
  startTime?: string;
  endTime?: string;
  notifyActive?: boolean;
}

export interface BreakFeedback {
  id: string;
  sessionId: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes?: string;
}

export interface QuickNote {
  id: string;
  text: string;
  timestamp: string;
}

export interface SessionStats {
  emAndamento: number;
  registros: number;
  reentradas: number;
  proximos: number;
  concluidos: number;
  totalInvestido: number;
  profit: number;
  itm: number;
  itmPercent: number;
  roi: number;
  fts: number;
  cravadas: number;
  progressao: number;
  vanillaPercentage: number;
  pkoPercentage: number;
  mysteryPercentage: number;
  normalSpeedPercentage: number;
  turboSpeedPercentage: number;
  hyperSpeedPercentage: number;
  screenCap: number;
  screenCapColors: { bgColor: string; textColor: string; borderColor: string };
}

export interface SessionSummaryData {
  volume: number;
  invested: number;
  profit: number;
  roi: number;
  fts: number;
  wins: number;
  bestResult: any;
  mentalAverages: {
    focus: number;
    energy: number;
    confidence: number;
    emotionalIntelligence: number;
    interference: number;
  };
  objectiveStatus: string;
  sessionTime: string;
  objectives: string;
  quickNotes: QuickNote[];
  endTime: string;
}

export interface NewTournamentForm {
  site: string;
  name: string;
  buyIn: string;
  type: string;
  speed: string;
  scheduledTime: string;
  fieldSize: string;
  rebuys: number;
  result: string;
  position: null;
  status: string;
}

export interface RegistrationData {
  [key: string]: {
    prize: string;
    bounty: string;
    position: string;
  };
}
