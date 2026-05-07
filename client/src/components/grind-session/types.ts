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

/**
 * Sprint Grind-Cards-Reform v2 — CA-13/14/15 (§3.1 + §4.4).
 * Bucket agregado para os 3 breakdowns colapsaveis (Torneios / Velocidade / Plataformas).
 */
export interface BreakdownBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
  totalProfitUsd: number;
  totalInvestedUsd: number;
  roi: number | null;
  colorHex?: string;
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
  // v2.3 (2026-05-07): metadata do torneio com maior premio para exibir no card.
  maiorResultadoMeta?: {
    name?: string;
    site?: string;
    position?: number;
    prizeUsd: number;
  } | null;
  // v2 (2026-05-07): breakdowns com Lucro + ROI por bucket
  typesBreakdown?: BreakdownBucket[];
  speedsBreakdown?: BreakdownBucket[];
  platformsBreakdown?: BreakdownBucket[];
  // v1 (Spec §3 — 16 KPIs em 4 linhas, implementado v2.2 2026-05-07).
  totalRegistros?: number;            // L1 — COUNT(DISTINCT torneios) — torneios unicos sem reentries
  avgSessionDurationMin?: number;     // L2 — AVG(session.duration) em minutos
  gamesPerActiveDay?: number;         // L2 — torneios / dias com >=1 torneio
  profitPerActiveDay?: number;        // L2 — totalProfit / dias com >=1 torneio (substitui inline)
  profitPerHour?: number;             // L3 — totalProfit / SUM(session.duration_min)/60
  profitPerTournament?: number;       // L3 — totalProfit / COUNT(DISTINCT torneios)
}
