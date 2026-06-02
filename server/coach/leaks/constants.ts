// =============================================================================
// Fase C #3 — getStatsLeaks: detecção real de leak (ADR-231)
//
// Pesos e janela da síntese comportamental. Constantes nomeadas (RF-03 / D-A2)
// para serem assertadas em teste sem números mágicos e fáceis de tunar.
// =============================================================================

// scoreS1 — coach_leak_focus ativo mapeado ao statId (peso ALTO, curado pelo Coach).
export const WEIGHT_COACH_LEAK = 10;

// scoreS2 — por sessão stat_analysis distinta que toca o statId (peso MÉDIO).
export const WEIGHT_STAT_ANALYSIS_SESSION = 3;

// scoreS2 — por entry (min(totalEntries, 10)).
export const WEIGHT_STAT_ANALYSIS_ENTRY = 1;

// scoreS3 — por statId marcado como foco no mês corrente (peso BAIXO).
export const WEIGHT_FOCUS_MARK = 2;

// cap de scoreS2.
export const CAP_STAT_ANALYSIS = 30;

// Janela S2 (dias). startedAt >= now - 60d (NULL conta — D-A2).
export const STAT_ANALYSIS_WINDOW_DAYS = 60;
