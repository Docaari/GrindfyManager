/**
 * Tournament Selector — Client Helpers
 *
 * Formatadores e utilitarios visuais para a feature Tournament Selector.
 * Usados por SelectorCard, SelectorDetailsModal, LibraryCardScoreBadge etc.
 */

import type { GradeLetter, ConfidenceLevel } from "../../../shared/scoring";

export interface GradeColor {
  bg: string;
  text: string;
  icon: string;
}

const GRADE_COLOR_MAP: Record<string, GradeColor> = {
  S: { bg: "bg-green-700", text: "text-white", icon: "trophy" },
  A: { bg: "bg-blue-600", text: "text-white", icon: "star" },
  B: { bg: "bg-yellow-400", text: "text-black", icon: "check" },
  C: { bg: "bg-orange-500", text: "text-black", icon: "alert" },
  D: { bg: "bg-red-600", text: "text-white", icon: "x" },
};

const FALLBACK_COLOR: GradeColor = { bg: "bg-gray-400", text: "text-white", icon: "help" };

export function getGradeColor(grade: GradeLetter | string): GradeColor {
  return GRADE_COLOR_MAP[grade as string] ?? FALLBACK_COLOR;
}

const GRADE_LABEL_MAP: Record<string, string> = {
  S: "Excelente",
  A: "Otimo",
  B: "Bom",
  C: "Regular",
  D: "Evitar",
};

export function getGradeLabel(grade: GradeLetter | string): string {
  return GRADE_LABEL_MAP[grade as string] ?? "—";
}

const CONFIDENCE_LABEL_MAP: Record<string, string> = {
  high: "Alta confianca",
  medium: "Media confianca",
  low: "Baixa confianca",
};

export function getConfidenceLabel(confidence: ConfidenceLevel | string): string {
  return CONFIDENCE_LABEL_MAP[confidence as string] ?? "—";
}

const TIME_OF_DAY_LABEL_MAP: Record<string, string> = {
  madrugada: "Madrugada (00h-06h)",
  manha: "Manha (06h-12h)",
  tarde: "Tarde (12h-18h)",
  "noite-cedo": "Noite cedo (18h-21h)",
  "noite-nobre": "Horario nobre (21h-00h)",
};

export function formatTimeOfDayBucket(bucket: string): string {
  return TIME_OF_DAY_LABEL_MAP[bucket] ?? bucket;
}

export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "0";
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return String(clamped);
}
