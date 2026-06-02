// =============================================================================
// server/coach/goals/adherenceBridge.ts — Metas 4DX fatia-2 (ADR-234 / D-1, D-4)
//
// Ponte de vocabulario: traduz o sourceMetric da meta (fatia-1) para o
// SourceMetric do MOTOR de aderencia (ADR-227) QUANDO aplicavel. Fonte UNICA da
// decisao "motor vs agregacao direta" (lesson #10 — nao espalhar if).
//
// + parser leak_focus (convencao de sufixo "leak_focus_progress:<statId>", sem
//   coluna nova / sem migration — D-4). statId validado via isValidStatId.
//
// Modulo PURO: literais, zero DB, zero new Date(). .test.ts -> node.
// =============================================================================

import type { SourceMetric } from "../adherence/types";
import { isValidStatId } from "../statId";

/** Ponte fatia-1 sourceMetric -> motor SourceMetric. Fonte UNICA da decisao. */
export const GOAL_METRIC_TO_ADHERENCE: Record<string, SourceMetric> = {
  sessions_per_week: "grind_sessions_count",
  grind_days: "grind_days",
  study_minutes_week: "study_minutes",
  study_sessions_count: "study_sessions_count",
};

/** true quando a meta resolve via getPlannedVsActual (tem entrada na ponte). */
export function resolvesViaAdherence(sourceMetric: string): boolean {
  return Object.prototype.hasOwnProperty.call(GOAL_METRIC_TO_ADHERENCE, sourceMetric);
}

/** O SourceMetric do motor para essa meta, ou null (agregacao direta). */
export function bridgedSourceMetric(sourceMetric: string): SourceMetric | null {
  return GOAL_METRIC_TO_ADHERENCE[sourceMetric] ?? null;
}

// ---------------------------------------------------------------------------
// leak_focus — convencao de sufixo (D-4). Sem coluna nova.
// ---------------------------------------------------------------------------
export const LEAK_FOCUS_PREFIX = "leak_focus_progress";

/** true se sourceMetric comeca com a raiz leak_focus_progress (com/sem statId). */
export function isLeakFocusMetric(sourceMetric: string): boolean {
  if (typeof sourceMetric !== "string" || sourceMetric.length === 0) return false;
  return sourceMetric === LEAK_FOCUS_PREFIX || sourceMetric.startsWith(`${LEAK_FOCUS_PREFIX}:`);
}

/**
 * "leak_focus_progress:<statId>" -> statId valido | null.
 * - sem statId (so a raiz) -> null
 * - sufixo vazio -> null
 * - statId invalido (nao catalog, nao custom_) -> null (via isValidStatId)
 * - sourceMetric que nao e leak_focus -> null
 */
export function parseLeakFocusStatId(sourceMetric: string): string | null {
  if (typeof sourceMetric !== "string") return null;
  const prefix = `${LEAK_FOCUS_PREFIX}:`;
  if (!sourceMetric.startsWith(prefix)) return null;
  const statId = sourceMetric.slice(prefix.length);
  if (!statId) return null;
  if (!isValidStatId(statId)) return null;
  return statId;
}

/**
 * Normaliza statId p/ casar com a chave de leak: getStatsLeaks/coach_leak_focus
 * podem usar a forma `leak:<code>` (leak orfao, ADR-231). Tira o prefixo `leak:`
 * antes de comparar. SSoT do match (reusado em goals.ts + leakFocusProgress.ts).
 */
export function normalizeStatIdForLeakMatch(statId: string): string {
  if (typeof statId !== "string") return statId;
  return statId.startsWith("leak:") ? statId.slice("leak:".length) : statId;
}
