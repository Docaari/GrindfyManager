// =============================================================================
// server/coach/goals/leakFocusProgress.ts — Metas 4DX fatia-2 (ADR-234 / D-3)
//
// Helper PURO de progresso de leak_focus (medicao HONESTA — DEC-4). Recebe tudo
// pronto por composicao (lesson #34): leaks ja resolvidos, status do
// coach_leak_focus ja casado, contagem de stat_analysis na janela. SEM DB, SEM
// new Date(). NUNCA usa severity/delta (value/delta sao sempre null no StatLeak).
//
// Modelo de progresso (DEC-4 travada):
//   1. leakFocusStatus === 'resolved'    -> achieved, 100, ok, 'resolved'
//   2. leaksErrored                      -> at_risk, null, low, 'source_error'  (+log no caller)
//   3. leaks == null || leaks.length===0 -> at_risk, null, low, 'source_stub'   (+log no caller)
//   4. statId NAO em leaks (saiu radar)  -> esforco>0 ? ahead : on_track; pct esforco; ok; 'left_radar'
//   5. statId AINDA em leaks:
//        stat_analysis>0                 -> behind; pct esforco; ok; 'attacking'
//        senao                            -> at_risk; null; ok; 'no_attack'
//   compliancePct = min(100, round(count/target*100)) quando target>0; null se
//   degradado/target<=0/5b. NUNCA fabrica dado (lesson #11).
// =============================================================================

import type { GoalStatus } from "@shared/goals";
import type { StatLeak } from "../leaks/types";
import { normalizeStatIdForLeakMatch } from "./adherenceBridge";

export interface LeakFocusInputs {
  /** statId alvo da meta (ja parseado/validado pelo caller — D-4). */
  targetStatId: string;
  /** alvo de esforco da meta (goals.targetValue) — nro de stat_analysis na janela. */
  target: number;
  /** getStatsLeaks(userId, N) ja resolvido (top N). [] = stub/sem leaks. */
  leaks: StatLeak[] | null;
  /** true se getStatsLeaks lancou (caller capturou) — degrade source_error. */
  leaksErrored?: boolean;
  /** status do coach_leak_focus cujo statId casa com o alvo. undefined/null = nenhum. */
  leakFocusStatus?: string | null;
  /** nro de study_sessions_v2 mode='stat_analysis' do statId na janela (esforco). */
  statAnalysisCountInWindow: number;
}

export interface LeakFocusProgress {
  status: GoalStatus;
  compliancePct: number | null;
  dataSufficiency: "ok" | "low";
  note: "resolved" | "left_radar" | "attacking" | "no_attack" | "source_stub" | "source_error";
}

/** compliancePct via esforco — min(100, round(count/target*100)); null se target<=0. */
function effortPct(count: number, target: number): number | null {
  if (!(target > 0)) return null;
  return Math.min(100, Math.round((count / target) * 100));
}

/**
 * Casa o targetStatId contra o statId de um StatLeak. O StatLeak.statId pode ser
 * catalog id / custom_* / baselineStatKey cru / "leak:<code>" (orfao, ADR-231).
 * Normaliza ambos os lados strippando o prefixo "leak:".
 */
function statIdMatches(targetStatId: string, leakStatId: string): boolean {
  return (
    normalizeStatIdForLeakMatch(targetStatId) === normalizeStatIdForLeakMatch(leakStatId)
  );
}

export function evaluateLeakFocusProgress(input: LeakFocusInputs): LeakFocusProgress {
  const { targetStatId, target, leaks, leaksErrored, leakFocusStatus, statAnalysisCountInWindow } =
    input;

  // Regra 1 — resolucao vence tudo.
  if (leakFocusStatus === "resolved") {
    return { status: "achieved", compliancePct: 100, dataSufficiency: "ok", note: "resolved" };
  }

  // Regra 2 — fonte lancou (caller capturou).
  if (leaksErrored) {
    return { status: "at_risk", compliancePct: null, dataSufficiency: "low", note: "source_error" };
  }

  // Regra 3 — fonte stub/vazia.
  if (leaks == null || leaks.length === 0) {
    return { status: "at_risk", compliancePct: null, dataSufficiency: "low", note: "source_stub" };
  }

  const stillOnRadar = leaks.some((l) => statIdMatches(targetStatId, l.statId));
  const effort = statAnalysisCountInWindow > 0;

  // Regra 4 — saiu do radar.
  if (!stillOnRadar) {
    return {
      status: effort ? "ahead" : "on_track",
      compliancePct: effortPct(statAnalysisCountInWindow, target),
      dataSufficiency: "ok",
      note: "left_radar",
    };
  }

  // Regra 5 — ainda no radar.
  if (effort) {
    return {
      status: "behind",
      compliancePct: effortPct(statAnalysisCountInWindow, target),
      dataSufficiency: "ok",
      note: "attacking",
    };
  }
  return { status: "at_risk", compliancePct: null, dataSufficiency: "ok", note: "no_attack" };
}
