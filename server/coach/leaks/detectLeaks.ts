// =============================================================================
// Fase C #3 — getStatsLeaks: detecção real de leak (ADR-231)
//
// Helper PURO de síntese comportamental. Recebe os 3 conjuntos de sinais já
// lidos do DB (arrays planos) + `top`, consolida por statId, computa `severity`,
// ordena e retorna StatLeak[].
//
// Isolamento (D-A8 / lesson #36): NÃO importa @shared/schema, NÃO importa
// drizzle-orm, NÃO importa server/storage nem server/db. Importa apenas
// getStatById de shared/hud-stat-catalog.ts (módulo puro). NÃO chama new Date()
// (recebe currentMonth pronto — determinismo p/ teste).
// =============================================================================

import { getStatById } from "../../../shared/hud-stat-catalog";
import {
  WEIGHT_COACH_LEAK,
  WEIGHT_STAT_ANALYSIS_SESSION,
  WEIGHT_STAT_ANALYSIS_ENTRY,
  WEIGHT_FOCUS_MARK,
  CAP_STAT_ANALYSIS,
} from "./constants";
import type {
  StatLeak,
  SynthesizeLeaksInputs,
} from "./types";
// Validação compartilhada (catalog id OU custom_* shape, bloqueia path traversal).
// statId.ts é módulo puro (só importa hud-stat-catalog) — não arrasta rota/storage,
// mantém a pureza do helper (D-A8). Adaptador type-guard local porque a versão
// compartilhada retorna boolean (assinatura p/ seus callers).
import { isValidStatId as isValidStatIdShared } from "../statId";

function isValidStatId(statId: unknown): statId is string {
  return (
    typeof statId === "string" &&
    statId.length > 0 &&
    isValidStatIdShared(statId)
  );
}

// statName genérico para custom_* (sem catálogo).
const CUSTOM_STAT_NAME = "Stat personalizada";

// Acumulador interno por chave de consolidação.
interface Accum {
  statId: string;
  statName: string;
  benchmark: number | null;
  scoreS1: number;
  scoreS2Sessions: number;
  scoreS2Entries: number;
  scoreS3: number;
}

// Resolve statName + benchmark de um statId já validado (catálogo ou custom_*).
function labelFor(statId: string): { statName: string; benchmark: number | null } {
  const stat = getStatById(statId);
  if (stat) return { statName: stat.label, benchmark: (stat.targetMin + stat.targetMax) / 2 };
  // custom_* válido (não casa catálogo).
  return { statName: CUSTOM_STAT_NAME, benchmark: null };
}

function ensureAccum(
  map: Map<string, Accum>,
  statId: string,
  statName: string,
  benchmark: number | null,
): Accum {
  let acc = map.get(statId);
  if (!acc) {
    acc = {
      statId,
      statName,
      benchmark,
      scoreS1: 0,
      scoreS2Sessions: 0,
      scoreS2Entries: 0,
      scoreS3: 0,
    };
    map.set(statId, acc);
  }
  return acc;
}

export function synthesizeLeaks(inputs: SynthesizeLeaksInputs, top: number): StatLeak[] {
  // D-A4 — top<=0/NaN -> []; non-int -> floor.
  const n = Number.isFinite(top) ? Math.floor(top) : 0;
  if (n <= 0) return [];

  const map = new Map<string, Accum>();

  // --- S1: coach_leak_focus (só status='active') ---
  for (const leak of inputs.coachLeaks) {
    if (!leak || leak.status !== "active") continue;
    const rawKey = leak.baselineStatKey ?? "";
    // D-A7 — match exato, depois trim+lowercase defensivo.
    let resolvedId: string | null = null;
    if (getStatById(rawKey)) {
      resolvedId = rawKey;
    } else {
      const normalized = String(rawKey).trim().toLowerCase();
      if (getStatById(normalized)) resolvedId = normalized;
    }

    if (resolvedId) {
      // funde com S2/S3 pelo statId do catálogo.
      const { statName, benchmark } = labelFor(resolvedId);
      const acc = ensureAccum(map, resolvedId, statName, benchmark);
      acc.scoreS1 += WEIGHT_COACH_LEAK;
    } else {
      // órfão — leak próprio leak:<code> (não funde com nada).
      const key = `leak:${leak.leakCode}`;
      const description = (leak.description ?? "").trim();
      const statName = description.length > 0 ? description : leak.leakCode;
      const acc = ensureAccum(map, key, statName, null);
      acc.scoreS1 += WEIGHT_COACH_LEAK;
    }
  }

  // --- S2: stat_analysis (statId validado; entries null -> 0) ---
  for (const session of inputs.statAnalysisSessions) {
    const statId = session?.statId;
    if (!isValidStatId(statId)) continue;
    const { statName, benchmark } = labelFor(statId);
    const acc = ensureAccum(map, statId, statName, benchmark);
    acc.scoreS2Sessions += 1;
    const entries = session?.statAnalysisEntries;
    acc.scoreS2Entries += Array.isArray(entries) ? entries.length : 0;
  }

  // --- S3: user_focus_stats (mês corrente — já filtrado no storage) ---
  for (const focus of inputs.focusStats) {
    const statId = focus?.statId;
    if (!isValidStatId(statId)) continue;
    const { statName, benchmark } = labelFor(statId);
    const acc = ensureAccum(map, statId, statName, benchmark);
    acc.scoreS3 += WEIGHT_FOCUS_MARK;
  }

  // --- Computa severity por chave ---
  const leaks: StatLeak[] = [];
  for (const acc of map.values()) {
    const scoreS2Raw =
      WEIGHT_STAT_ANALYSIS_SESSION * acc.scoreS2Sessions +
      WEIGHT_STAT_ANALYSIS_ENTRY * Math.min(acc.scoreS2Entries, 10);
    const scoreS2 = Math.min(scoreS2Raw, CAP_STAT_ANALYSIS);
    const severity = acc.scoreS1 + scoreS2 + acc.scoreS3;
    if (severity <= 0) continue; // RF-03 — severity 0 não entra.
    leaks.push({
      statId: acc.statId,
      statName: acc.statName,
      value: null,
      benchmark: acc.benchmark,
      delta: null,
      severity,
      id: acc.statId,
      type: "stat_leak",
      description: acc.statName,
    });
  }

  // Ordena por severity desc; desempate por statId asc (determinismo).
  leaks.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.statId < b.statId ? -1 : a.statId > b.statId ? 1 : 0;
  });

  return leaks.slice(0, n);
}
