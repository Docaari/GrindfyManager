// =============================================================================
// Fase C #3 — getStatsLeaks: detecção real de leak (ADR-231)
//
// Tipos server-only do detector de leaks. Type-only (apagado em runtime) — NÃO
// importa @shared/schema (D-A8 / lesson #36). Interfaces planas de input do
// helper PURO (sem shape de drizzle) + o contrato de saída StatLeak (D-A3).
// =============================================================================

// Contrato de saída — superset lido pelos 5 consumers (RF-06).
export interface StatLeak {
  statId: string; // catálogo id | custom_* | baselineStatKey cru | leak:<code>
  statName: string; // label catálogo | description | "Stat personalizada"
  value: number | null; // SEMPRE null (não há HUD number jogado)
  benchmark: number | null; // (targetMin+targetMax)/2 do catálogo, ou null
  delta: number | null; // SEMPRE null
  severity: number; // score sintético > 0
  id?: string; // = statId (studyRecommendationsService lê id?)
  type?: string; // = 'stat_leak'
  description?: string; // = statName / description
}

// S1 — coach_leak_focus (status já filtrado no storage; helper revalida 'active').
export interface CoachLeakInput {
  leakCode: string;
  description: string;
  baselineStatKey: string;
  status: string;
}

// S2 — study_sessions_v2 mode='stat_analysis'. Só precisa do statId + length das
// entries (statAnalysisEntries pode ser null -> 0 entries).
export interface StatAnalysisInput {
  statId: string | null;
  statAnalysisEntries: { length: number }[] | null;
}

// S3 — user_focus_stats (mês corrente já filtrado no storage).
export interface FocusStatInput {
  statId: string;
}

// Inputs crus passados ao helper puro.
export interface SynthesizeLeaksInputs {
  coachLeaks: CoachLeakInput[];
  statAnalysisSessions: StatAnalysisInput[];
  focusStats: FocusStatInput[];
  currentMonth: string; // "YYYY-MM" — passado pronto pelo storage (helper não chama new Date()).
}
