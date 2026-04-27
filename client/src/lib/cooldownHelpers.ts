// =============================================================================
// Cool-down helpers — Sprint Cooldown-1 (MVP)
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-01)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
// =============================================================================

export type RedFlagSummary = {
  profit?: number;
  abiMed?: number;
  focoMedio?: number;
  inteligenciaEmocionalMedia?: number;
  interferenciasMedia?: number;
  duration?: number; // minutos
};

export type RedFlagResult = {
  hasFlags: boolean;
  reasons: string[];
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * detectRedFlags — analisa summary pos-sessao e retorna lista de motivos
 * que justificam destaque de cool-down (RF-01).
 *
 * Regras:
 *  - profit < -2 * abiMed                      -> 'profit_loss'
 *  - abiMed === 0 -> fallback profit < -50 USD -> 'profit_loss'
 *  - focoMedio < 4 OU IE < 4                   -> 'mental_state'
 *  - interferenciasMedia > 7                   -> 'interference'
 *  - duration > 360 min                         -> 'duration'
 *
 * Defesa em profundidade: NaN/null/undefined em qualquer campo nao crashea —
 * a regra correspondente simplesmente nao dispara.
 */
export function detectRedFlags(summary: RedFlagSummary | null | undefined): RedFlagResult {
  const reasons = new Set<string>();

  if (!summary || typeof summary !== "object") {
    return { hasFlags: false, reasons: [] };
  }

  const profit = summary.profit;
  const abiMed = summary.abiMed;
  const focoMedio = summary.focoMedio;
  const ie = summary.inteligenciaEmocionalMedia;
  const interf = summary.interferenciasMedia;
  const duration = summary.duration;

  // profit_loss
  if (isFiniteNumber(profit) && isFiniteNumber(abiMed)) {
    if (abiMed === 0) {
      // Fallback: profit < -50 USD
      if (profit < -50) reasons.add("profit_loss");
    } else if (abiMed > 0) {
      const threshold = -2 * abiMed;
      if (profit < threshold) reasons.add("profit_loss");
    }
  }

  // mental_state
  if (isFiniteNumber(focoMedio) && focoMedio < 4) {
    reasons.add("mental_state");
  }
  if (isFiniteNumber(ie) && ie < 4) {
    reasons.add("mental_state");
  }

  // interference
  if (isFiniteNumber(interf) && interf > 7) {
    reasons.add("interference");
  }

  // duration
  if (isFiniteNumber(duration) && duration > 360) {
    reasons.add("duration");
  }

  const list = Array.from(reasons);
  return {
    hasFlags: list.length > 0,
    reasons: list,
  };
}
