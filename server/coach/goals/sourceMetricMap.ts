// =============================================================================
// server/coach/goals/sourceMetricMap.ts — Metas 4DX fatia-1 (ADR-229 RF-04/05)
//
// GOALS_SOURCE_METRIC_MAP: allowlist controlavel (RF-04) + fonte (RF-05).
// Toda chave do mapa = sourceMetric controlavel com uma fonte de agregacao
// direta real. As nao-controlaveis (profit_short_term/win_a_tournament/
// beat_specific_player) NAO estao no mapa (-> lead_no_data_source/lead_not_controllable).
//
// `kind` despacha a agregacao em aggregateCurrentValue.ts:
//   volume      -> count(grind_sessions completed)
//   study       -> sum/count study_sessions_v2
//   financial   -> wallets + FX->USD
//   performance -> getPerformanceByPeriod (historico, grind_session_id IS NULL)
// `source` documenta a tabela/metodo de origem.
// =============================================================================

export type SourceMetricKind = "volume" | "study" | "financial" | "performance";

export interface SourceMetricSpec {
  kind: SourceMetricKind;
  source: string;
  // metrica do retorno de getPerformanceByPeriod (so para kind='performance').
  perfField?: string;
}

export const GOALS_SOURCE_METRIC_MAP: Record<string, SourceMetricSpec> = {
  sessions_per_week: { kind: "volume", source: "grind_sessions" },
  grind_days: { kind: "volume", source: "grind_sessions" },
  study_minutes_week: { kind: "study", source: "study_sessions_v2" },
  study_sessions_count: { kind: "study", source: "study_sessions_v2" },
  bankroll_usd: { kind: "financial", source: "wallets" },
  roi_pct: { kind: "performance", source: "getPerformanceByPeriod", perfField: "roi" },
  abi: { kind: "performance", source: "getPerformanceByPeriod", perfField: "abi" },
  itm_pct: { kind: "performance", source: "getPerformanceByPeriod", perfField: "itmPct" },
};
