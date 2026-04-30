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
  registrationTime?: string | null;
  guaranteed?: string;
  bounty?: string;
  prioridade?: number;
  plannedTournamentId?: string;
  startTime?: string;
  endTime?: string | null;
  notifyActive?: boolean;
  // Add-on + Re-entry (ADR-014)
  allowsAddOn?: boolean;
  addOnCost?: string | null;
  addOnTaken?: boolean;
  allowsReentry?: boolean;
  maxReentries?: number | null;
  reentries?: number;
  prize?: string;
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

export interface CurrencyBreakdownEntry {
  currency: string;
  invested: number;
  profit: number;
  fxRateNativePerUSD: number;
  rateMissing: boolean;
  investedUSD: number;
  profitUSD: number;
}

export interface PlatformBreakdownEntry {
  site: string;
  currency: string;
  invested: number;
  profit: number;
  investedUSD: number;
  profitUSD: number;
  fxRateNativePerUSD: number;
  rateMissing: boolean;
}

export interface SessionFinancialBreakdown {
  byCurrency: CurrencyBreakdownEntry[];
  byPlatform: PlatformBreakdownEntry[];
  totalInvestedUSD: number;
  profitUSD: number;
  hasMissingRate: boolean;
}

export interface SessionStats {
  emAndamento: number;
  registros: number;
  reentradas: number;
  proximos: number;
  concluidos: number;
  /**
   * @deprecated Soma raw em moedas nativas (mixed-currency em sessao multi-rede).
   * Usar `totalInvestidoUSD` para qualquer agregacao financeira nova.
   * Mantido para compat de tests single-currency e grind_sessions legado.
   */
  totalInvestido: number;
  /**
   * @deprecated Soma raw em moedas nativas (mixed-currency em sessao multi-rede).
   * Usar `profitUSD`. Veja docs/architecture/lessons-learned.md (2026-04-30 FX).
   */
  profit: number;
  totalInvestidoUSD: number;
  profitUSD: number;
  breakdown: SessionFinancialBreakdown;
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
  totalEntries: number;
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
  // Horario de registro intencional (HH:MM). Opcional. Quando preenchido,
  // grind-live ordena/exibe por este valor; senao usa scheduledTime (start).
  registrationTime?: string;
  fieldSize: string;
  rebuys: number;
  result: string;
  position: null;
  status: string;
  // Add-on + Re-entry (ADR-014)
  allowsAddOn?: boolean;
  addOnCost?: string;
  allowsReentry?: boolean;
  maxReentries?: number | null;
  reentries?: number;
}

export interface RegistrationData {
  [key: string]: {
    prize: string;
    bounty: string;
    position: string;
  };
}
