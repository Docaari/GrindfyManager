/**
 * Tournament Selector — Shared Types
 *
 * Tipos compartilhados entre client e server para a feature Tournament Selector
 * Inteligente (Sprint 1, ICE 8.0).
 *
 * Spec: docs/specs/tournament-selector.md
 * Arquitetura: docs/architecture/tournament-selector-index.md
 */

export type GradeLetter = "S" | "A" | "B" | "C" | "D";
export type ConfidenceLevel = "low" | "medium" | "high";
export type ColdStartLevel = "pure" | "partial" | false;
export type SelectorSource = "suprema" | "library";
export type TimeOfDayBucket = "madrugada" | "manha" | "tarde" | "noite-cedo" | "noite-nobre";
export type FieldBucket = "pequeno" | "medio" | "grande" | "massivo";
export type SpeedBucket = "Normal" | "Turbo" | "Hyper";

export interface ScoringSignal {
  value: number;       // ROI bruto do bucket
  sample: number;      // sample size do bucket
  weight: number;      // peso final usado (pode ter sido redistribuido)
  score: number;       // bucketScore apos shrinkage (0-100)
}

export interface ScoringSignals {
  siteRoi: ScoringSignal;
  buyInRoi: ScoringSignal;
  categoryRoi: ScoringSignal;
  speedRoi: ScoringSignal;
  dayOfWeekRoi: ScoringSignal;
  timeOfDayRoi: ScoringSignal;
  fieldRoi: ScoringSignal;
}

export interface PlayerAnalyticsBundle {
  totalTournaments: number;
  lookbackTournaments: number;
  lookbackDays: number;
  overallRoi: number;
  bySite: { site: string; sample: number; roi: number; profit: number }[];
  byBuyIn: { range: string; sample: number; roi: number }[];
  byCategory: { category: string; sample: number; roi: number }[];
  bySpeed: { speed: string; sample: number; roi: number }[];
  byDayOfWeek: { dayOfWeek: number; sample: number; roi: number }[];
  byTimeOfDay: { bucket: string; sample: number; roi: number }[];
  byField: { range: string; sample: number; roi: number }[];
}

export interface ScoringInputTournament {
  id: string;
  source: SelectorSource;
  name: string;
  site: string;
  buyIn: number;                 // ja normalizado para USD
  buyInBucket: string;           // bucket calculado
  category: string | null;       // Vanilla, PKO, Mystery, ou null se desconhecida (Q6)
  speed: SpeedBucket;
  dayOfWeek: number;             // 0-6
  time: string;                  // "HH:mm"
  timeOfDayBucket: TimeOfDayBucket | null;
  fieldBucket: FieldBucket | null;
  fieldSizeEstimate: number | null;
}

export interface TournamentScoreResult {
  score: number;                 // 0-100 inteiro
  grade: GradeLetter;
  confidence: ConfidenceLevel;
  rationale: string;
  signals: ScoringSignals;
  warnings: string[];
  lowConfidence?: boolean;       // true em cold start parcial (20-49)
}

export interface SelectorTournament {
  id: string;
  source: SelectorSource;
  name: string;
  site: string;
  buyIn: number;
  /**
   * Buy-in normalizado para USD (UX 2026-04-24 TS-C). Usado pelo card para
   * computar delta absoluto/percentual contra hardLimitUSD da banca,
   * independente da moeda nativa (Suprema=BRL, demais=USD).
   */
  buyInUSD?: number;
  guaranteed?: number;
  startTime?: string;
  time: string;
  dayOfWeek: number;
  category: string | null;
  speed: string;
  gameType?: string | null;
  fieldSizeEstimate: number | null;
  lateRegMinutes?: number | null;
  startingStack?: number | null;
  blindLevelMinutes?: number | null;
  score: number;
  grade: GradeLetter;
  confidence: ConfidenceLevel;
  rationale: string;
  signals: ScoringSignals;
  warnings: string[];
  bankrollOk: boolean;
  alreadyInGrid: boolean;
  /**
   * Sprint TS-3 RF-04 (ADR-178). Quando `bankrollMode='warn'` e buy-in
   * acima de softLimit (`above_soft_limit`) ou hardLimit (`above_hard_limit`),
   * o payload anexa este bloco para a UI renderizar badge amarelo/vermelho.
   * `null` quando dentro do bankroll OU quando mode != 'warn'.
   */
  bankrollWarning?: {
    reason: 'above_soft_limit' | 'above_hard_limit';
    limitUSD: number;
    buyInUSD: number;
    rulePct: number;
  } | null;
}

export interface SelectorPlayerProfile {
  totalTournaments: number;
  lookbackDays: number;
  lookbackTournaments?: number;
  coldStart: ColdStartLevel;
  overallRoi?: number;
  coverage?: {
    sites: string[];
    buyInRanges: string[];
    categories: string[];
    speeds: string[];
  };
}

export interface SelectorLogEvent {
  userId: string;
  eventType: "view" | "add_to_grid";
  tournamentExternalId?: string | null;
  score?: number | null;
  grade?: GradeLetter | null;
  confidence?: ConfidenceLevel | null;
  metadata?: any;
}
