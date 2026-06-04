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

// METAS-2 fatia-2 (ADR-234 / D-4): kind 'leak' — leak_focus NAO tem agregacao
// direta; o scoreboard o resolve via evaluateLeakFocusProgress ANTES de chamar
// aggregateCurrentValue (que faz early-return para kind:'leak').
export type SourceMetricKind = "volume" | "study" | "financial" | "performance" | "leak";

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
  // ADR-241 — metricas de RESULTADO (so WIG). Fonte selecionavel via sufixo
  // @grind / @history (parseMetricSource). profit/volume agregam de grind
  // (profitLoss USD-equiv + count de session_tournaments) OU do historico.
  profit: { kind: "performance", source: "getPerformanceByPeriod", perfField: "profit" },
  volume: { kind: "performance", source: "getPerformanceByPeriod", perfField: "totalTournaments" },
  // METAS-2 fatia-2: raiz controlavel de leak_focus. statId alvo via sufixo.
  leak_focus_progress: { kind: "leak", source: "getStatsLeaks + coach_leak_focus + stat_analysis" },
};

// ADR-241 — fonte de dado selecionavel: "<base>@grind" | "<base>@history".
// Sem sufixo -> 'history' (back-compat com roi_pct/abi/itm_pct legados). O '@'
// nao conflita com o ':' do leak_focus_progress:<statId>.
export type MetricSource = "grind" | "history";
export function parseMetricSource(sourceMetric: string): { base: string; source: MetricSource } {
  const at = sourceMetric.indexOf("@");
  if (at === -1) return { base: sourceMetric, source: "history" };
  const base = sourceMetric.slice(0, at);
  const tail = sourceMetric.slice(at + 1);
  return { base, source: tail === "grind" ? "grind" : "history" };
}

// Metricas de RESULTADO — so permitidas como WIG (RF-04: nao-controlaveis nao
// podem ser medida de direcao). volume e controlavel -> nao entra aqui.
export const RESULT_ONLY_METRICS = new Set(["profit", "roi_pct", "itm_pct", "abi"]);

// Bases que suportam fonte 'grind' (profitLoss USD-equiv + count session_tournaments).
// roi/itm/abi NAO: session_tournaments nao tem currency -> agregacao multi-moeda
// nao confiavel; ficam so no historico (getPerformanceByPeriod com FX).
export const GRIND_CAPABLE_METRICS = new Set(["profit", "volume"]);
