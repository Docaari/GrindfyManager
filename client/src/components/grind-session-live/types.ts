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
  /** Gross returns (prize + bounty), nao net. Founder convention 2026-04-30. */
  returns: number;
  /** Net profit (returns - invested). Mantido para ROI/persistencia. */
  profit: number;
  fxRateNativePerUSD: number;
  rateMissing: boolean;
  investedUSD: number;
  returnsUSD: number;
  profitUSD: number;
}

export interface PlatformBreakdownEntry {
  site: string;
  currency: string;
  invested: number;
  returns: number;
  profit: number;
  investedUSD: number;
  returnsUSD: number;
  profitUSD: number;
  fxRateNativePerUSD: number;
  rateMissing: boolean;
}

export interface SessionFinancialBreakdown {
  byCurrency: CurrencyBreakdownEntry[];
  byPlatform: PlatformBreakdownEntry[];
  totalInvestedUSD: number;
  /** Gross returns USD (founder convention: results+bounties). */
  totalReturnsUSD: number;
  /** Net profit USD (returns - invested). */
  profitUSD: number;
  hasMissingRate: boolean;
}

export interface AddOnsBreakdownEntry {
  currency: string;
  total: number;
  totalUSD: number;
  rateMissing: boolean;
}

export interface AddOnsPaidSummary {
  count: number;
  totalUSD: number;
  byCurrency: AddOnsBreakdownEntry[];
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
  /** Gross returns (prize+bounty). Founder convention para card "Profit". */
  totalReturns: number;
  totalReturnsUSD: number;
  profitUSD: number;
  /** Average buy-in (USD) por torneio registrado/finalizado da sessao. */
  abi: number;
  /**
   * Mediana de participantes estimada via Gtd / BI (ou Gtd / (BI + AddOn) quando
   * add-on foi pago). Resistente a outliers (Sunday Million etc — alinhado com
   * grade-planner, ver client/src/lib/median.ts). Conta apenas torneios com
   * guaranteed > 0 e buyIn > 0. Zero quando nenhum torneio elegivel.
   */
  medianParticipants: number;
  /** Add-ons pagos: count, total USD e breakdown por currency native. */
  addOnsPaid: AddOnsPaidSummary;
  breakdown: SessionFinancialBreakdown;
  itm: number;
  itmPercent: number;
  /** ROI percentage. Sprint Flight-1 RF-15: undefined quando colapso de
   * combined-stack ocorreu (consumer deriva via profit/totalInvestido). */
  roi: number | undefined;
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
  /**
   * Sprint Flight-1 RF-15: numero de eventos economicos distintos.
   * Combined-stack series colapsam para 1 (vs N entries).
   */
  tournamentsPlayed: number;
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
