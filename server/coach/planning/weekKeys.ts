// =============================================================================
// server/coach/planning/weekKeys.ts — EST-6 / ADR-224
//
// Util compartilhado de chaves de semana. NAO unificar UTC vs BRT (CLAUDE.md §10):
//   - weekly_planning_sessions / study_weekly_plans  -> chave UTC (ymdUtc)
//   - coach_lesson_recommendations                   -> chave BRT (brtMondayYmd)
//
// `ymdUtc` foi extraido de server/services/studyWeeklyPlanService.ts (que agora
// importa daqui — DRY, mesmo comportamento).
// =============================================================================

/** "YYYY-MM-DD" usando os componentes UTC da data. */
export function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inverso de `ymdUtc`: "YYYY-MM-DD" (UTC) -> Date 00:00 UTC. */
export function ymdToUtcDate(weekStartDate: string): Date {
  const [y, m, d] = weekStartDate.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Proxima segunda 00:00:00.000 UTC. A partir de qualquer dia (incl. segunda)
 * retorna SEMPRE a segunda da PROXIMA semana (>= 1 dia a frente, nunca a semana
 * corrente). Domingo retorna a segunda do dia seguinte.
 */
export function nextMondayUtc(from: Date = new Date()): Date {
  const base = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0),
  );
  const dow = base.getUTCDay(); // 0=domingo .. 6=sabado
  // dias ate a proxima segunda: domingo(0)->1, segunda(1)->7, terca(2)->6, ...
  const daysAhead = ((8 - dow) % 7) || 7;
  base.setUTCDate(base.getUTCDate() + daysAhead);
  return base;
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 (America/Sao_Paulo, sem DST desde 2019)

/**
 * Segunda da semana NO FUSO America/Sao_Paulo (UTC-3), em "YYYY-MM-DD".
 * Usado SO para a chave BRT de coach_lesson_recommendations.
 *
 * Desloca a instante para o relogio de parede BRT (subtrai 3h), entao acha a
 * segunda dessa semana. Borda noturna: 01:00 UTC de segunda = 22:00 BRT de
 * domingo -> a semana BRT comeca na segunda anterior (guard contra drift UTC/BRT).
 */
export function brtMondayYmd(d: Date): string {
  // relogio de parede BRT representado como um Date "UTC-shiftado"
  const brt = new Date(d.getTime() - BRT_OFFSET_MS);
  const dow = brt.getUTCDay(); // 0=domingo .. 6=sabado, no relogio BRT
  // dias a voltar ate a segunda: segunda(1)->0, terca(2)->1, ..., domingo(0)->6
  const daysBack = (dow + 6) % 7;
  const monday = new Date(
    Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0, 0),
  );
  monday.setUTCDate(monday.getUTCDate() - daysBack);
  return ymdUtc(monday);
}
