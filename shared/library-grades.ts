/**
 * Library confidence grades — single source of truth (server + client).
 *
 * Recalibrado na Sprint library-evolution Fase 1. Os thresholds antigos
 * (2000/1000/500/200) assumiam um unico mega-grupo e ficaram irreais depois
 * que o agrupamento parou de exigir buy-in/speed exatos (passou a juntar mais
 * torneios em menos grupos, porem cada grupo continua na casa das centenas, nao
 * dos milhares). Centralizar aqui evita o drift client/server descrito em
 * Docs/architecture/lessons-learned.md (#grades — server e SSoT).
 */

// Piso de visibilidade: grupos abaixo disso so aparecem no drill-down da familia
// (estatisticamente fracos demais para CI/ROI confiavel — alinhado ao guard
// volume>=23 ja usado em roiWithoutOutliers).
export const MIN_GROUP_VISIBLE = 30;

// Piso para uma FAMILIA aparecer no nivel superior da biblioteca. Abaixo disso
// e ruido. Faz parte da mesma escada de confianca que MIN_GROUP_VISIBLE e as
// grades A-F — por isso vive aqui, nao hardcoded no storage.
export const FAMILY_GROUP_FLOOR = 10;

export const GRADE_THRESHOLDS = {
  A: 500,
  B: 200,
  C: 100,
  D: 50,
  F: 30,
} as const;

export type LibraryGrade = "A" | "B" | "C" | "D" | "F";

export function confidenceGradeForVolume(volume: number): LibraryGrade {
  if (volume >= GRADE_THRESHOLDS.A) return "A";
  if (volume >= GRADE_THRESHOLDS.B) return "B";
  if (volume >= GRADE_THRESHOLDS.C) return "C";
  if (volume >= GRADE_THRESHOLDS.D) return "D";
  return "F";
}

export const GRADE_TOOLTIPS: Record<LibraryGrade, string> = {
  A: "A — 500+ torneios, altamente confiável",
  B: "B — 200-499 torneios, confiável",
  C: "C — 100-199 torneios, moderado",
  D: "D — 50-99 torneios, baixa confiabilidade",
  F: "F — 30-49 torneios, dados insuficientes",
};

export const GRADE_COLORS: Record<LibraryGrade, string> = {
  A: "bg-emerald-600",
  B: "bg-blue-600",
  C: "bg-yellow-600",
  D: "bg-orange-600",
  F: "bg-red-600",
};

export const GRADE_ORDER: Record<LibraryGrade, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
};
