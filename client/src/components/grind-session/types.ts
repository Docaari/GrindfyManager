export interface SessionHistoryData {
  id: string;
  userId: string;
  date: string;
  duration?: string;
  volume: number;
  profit: number;
  abiMed: number;
  roi: number;
  fts: number;
  cravadas: number;
  energiaMedia: number;
  focoMedio: number;
  confiancaMedia: number;
  inteligenciaEmocionalMedia: number;
  interferenciasMedia: number;
  breakCount: number;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  finalNotes?: string;
  objectiveCompleted?: boolean;
  status?: string;
  startTime?: string;
}

export interface SessionTournament {
  id: string;
  tournamentName: string;
  buyIn: number;
  fieldSize: number;
  profit: number;
  finalPosition?: number;
  totalPlayers?: number;
  prize?: number;
  site: string;
  category: string;
  speed: string;
  itm: boolean;
  status: string;
  // Tournament type percentages
  vanillaPercentage?: number;
  pkoPercentage?: number;
  mysteryPercentage?: number;
  // Tournament speed percentages
  normalSpeedPercentage?: number;
  turboSpeedPercentage?: number;
  hyperSpeedPercentage?: number;
}

export interface DashboardMetrics {
  totalSessions: number;
  totalVolume: number;
  totalProfit: number;
  avgABI: number;
  avgROI: number;
  totalFTs: number;
  totalCravadas: number;
  avgEnergia: number;
  avgFoco: number;
  avgConfianca: number;
  avgInteligenciaEmocional: number;
  avgInterferencias: number;
  avgPreparationPercentage: number;
  // Tournament type counts and percentages
  vanillaCount?: number;
  pkoCount?: number;
  mysteryCount?: number;
  vanillaPercentage?: number;
  pkoPercentage?: number;
  mysteryPercentage?: number;
  // Tournament speed counts and percentages
  normalCount?: number;
  turboCount?: number;
  hyperCount?: number;
  normalPercentage?: number;
  turboPercentage?: number;
  hyperPercentage?: number;
  // Additional metrics
  totalReentradas: number;
  avgParticipants: number;
  itmPercentage: number;
  maiorResultado: number;
}
