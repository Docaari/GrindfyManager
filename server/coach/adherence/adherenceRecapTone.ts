// =============================================================================
// server/coach/adherence/adherenceRecapTone.ts — Motor de Aderência (ADR-227)
//
// Regras de tom A4 em ARQUIVO ÚNICO (lesson #10). O recap cobra COMPORTAMENTO
// específico (planejou X, realizou Y), NUNCA culpa ("você falhou/sempre/nunca/
// deveria ter"). Skip aparece como decisão neutra. dataSufficiency='low' -> não
// crava veredito numérico (D9), sinaliza ausência de plano/dado.
//
// O motor entrega só números; a narrativa final do recap (EST-5) é determinística.
// =============================================================================

import type { PlannedVsActual } from "./types";

/** Frase A4 de uma dimensão. Sem culpa; cobra comportamento ou reconhece skip. */
function lineFor(label: string, pva: PlannedVsActual): string {
  if (pva.dataSufficiency === "low") {
    return `${label}: ainda sem plano/dado suficiente da semana passada para comparar.`;
  }
  if (pva.breakdown.skipped) {
    return `${label}: você optou por pular esta dimensão — decisão consciente, sem problema.`;
  }
  if (pva.planned === 0 || pva.planned === null) {
    return `${label}: sem meta definida para a semana passada.`;
  }
  const planned = pva.planned;
  const actual = pva.actual;
  if (pva.breakdown.overachieved) {
    return `${label}: você planejou ${planned} e realizou ${actual} — superou o plano.`;
  }
  return `${label}: você planejou ${planned} e realizou ${actual}.`;
}

/** Monta o summaryText A4 do recap (grind + estudo). */
export function buildAdherenceSummary(grind: PlannedVsActual, study: PlannedVsActual): string {
  const lines: string[] = [];
  lines.push(lineFor("Grind", grind));
  lines.push(lineFor("Estudo", study));
  return lines.join(" ");
}
