// =============================================================================
// metaUi — constantes/helpers compartilhados da UI de Metas (ADR-241).
// SSoT de: formato YMD local, mapa visual de status (rotulo + cores) e rotulos
// de horizonte. Antes duplicados em MetasPage/MeasureCard/WigBanner/GoalsCalendar.
// =============================================================================

// YYYY-MM-DD no fuso LOCAL (distinto do ymdUtc do server — calendario e local).
export function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function todayYmd(): string {
  return localYmd(new Date());
}

// Mapa visual por status (4DX). pill = badge; bar/marker = barra de pace.
export interface StatusVisual {
  label: string;
  pill: string;
  bar: string;
  marker: string;
}
export const STATUS_VISUAL: Record<string, StatusVisual> = {
  ahead: { label: "Adiantado", pill: "bg-emerald-500/15 text-emerald-400 border-emerald-600/40", bar: "bg-emerald-500", marker: "bg-emerald-200" },
  on_track: { label: "No ritmo", pill: "bg-sky-500/15 text-sky-400 border-sky-600/40", bar: "bg-sky-500", marker: "bg-sky-200" },
  behind: { label: "Atrasado", pill: "bg-amber-500/15 text-amber-400 border-amber-600/40", bar: "bg-amber-500", marker: "bg-amber-200" },
  at_risk: { label: "Em risco", pill: "bg-red-500/15 text-red-400 border-red-600/40", bar: "bg-red-500", marker: "bg-red-200" },
  achieved: { label: "Concluido", pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50", bar: "bg-emerald-400", marker: "bg-emerald-200" },
};
export function statusVisual(status: string): StatusVisual {
  return STATUS_VISUAL[status] ?? { label: status, pill: "bg-muted text-muted-foreground border-border", bar: "bg-muted-foreground", marker: "bg-foreground" };
}

export const HORIZON_RANK: Record<string, number> = { week: 1, month: 2, quarter: 3, season: 4 };
export const HORIZON_LABEL: Record<string, string> = {
  week: "Semana",
  month: "Mes",
  quarter: "Trimestre",
  season: "Temporada (ano)",
};
export function horizonAtLeastQuarter(h: string): boolean {
  return (HORIZON_RANK[h] ?? 0) >= HORIZON_RANK.quarter;
}
