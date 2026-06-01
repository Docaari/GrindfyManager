// =============================================================================
// server/coach/adherence/compute.ts — Motor de Aderência (ADR-227)
//
// Classificação PURA de compliance + breakdown a partir de (planned, actual,
// skipped, note, dataSufficiency). Sem I/O. Regras em DEC-MA5/RF-04.
// =============================================================================

import type {
  AdherenceBreakdown,
  AdherenceNote,
  DataSufficiency,
} from "./types";

export interface ComputeInput {
  /** null = sem plano; 0 = planejou descanso; >0 = plano real. */
  planned: number | null;
  actual: number;
  /** dimensão pulada conscientemente (steps.status='skipped'). */
  skipped: boolean;
  /** nota pré-resolvida pela fonte (source_stub/source_error/plan_from_weekly_plan/window_open). */
  presetNote?: AdherenceNote;
  /** janela ainda em curso (DEC-MA7). */
  windowOpen?: boolean;
}

export interface ComputeResult {
  compliancePct: number | null;
  dataSufficiency: DataSufficiency;
  breakdown: AdherenceBreakdown;
}

export function computeCompliance(input: ComputeInput): ComputeResult {
  const { planned, actual, skipped } = input;
  const presetNote = input.presetNote ?? null;
  const windowOpen = input.windowOpen === true;

  // 1) skipped — decisão consciente (DEC-MA5): nem sucesso nem falha.
  if (skipped) {
    return {
      compliancePct: null,
      dataSufficiency: windowOpen ? "low" : "ok",
      breakdown: {
        skipped: true,
        shortfall: null,
        overachieved: false,
        note: windowOpen ? "window_open" : presetNote,
      },
    };
  }

  // 2) sem plano — não há baseline (não cobrar).
  if (planned === null) {
    return {
      compliancePct: null,
      dataSufficiency: "low",
      breakdown: {
        skipped: false,
        shortfall: null,
        overachieved: false,
        note: presetNote ?? "no_plan",
      },
    };
  }

  // 3) planejou explicitamente 0 (descanso) — dado válido.
  if (planned === 0) {
    return {
      compliancePct: null,
      dataSufficiency: windowOpen ? "low" : "ok",
      breakdown: {
        skipped: false,
        shortfall: null,
        overachieved: false,
        note: windowOpen ? "window_open" : (presetNote ?? "planned_zero"),
      },
    };
  }

  // 4) plano real (>0).
  const overachieved = actual > planned;
  const compliancePct = Math.min(100, Math.round((actual / planned) * 100));
  const shortfall = overachieved ? null : Math.max(0, planned - actual);

  return {
    compliancePct,
    dataSufficiency: windowOpen ? "low" : "ok",
    breakdown: {
      skipped: false,
      shortfall,
      overachieved,
      note: windowOpen ? "window_open" : presetNote,
    },
  };
}
