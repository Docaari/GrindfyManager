/**
 * Sprint UX-QW-3 RF-03 — `calendarDaysSince` util DST-aware.
 *
 * Spec: Docs/specs/sprint-ux-qw-3.md (RF-03)
 * ADR : Docs/architecture/decisions/175-calendar-days-since-dst-aware.md
 *
 * Calcula diferenca em DIAS CIVIS entre dois pontos, no fuso horario do user.
 * Diferente de `Math.floor(diff_ms / 86_400_000)` que falha em transicoes DST
 * (spring forward dia de 23h => 0.96 dias -> floor=0 quando devia ser 1;
 *  fall back dia de 25h => 1.04 dias -> floor=1 quando devia ser 0).
 *
 * Algoritmo:
 *   1. Resolve timeZone (default = Intl.DateTimeFormat().resolvedOptions().timeZone).
 *   2. Extrai YYYY-MM-DD de from/to no timeZone via en-CA formatter.
 *   3. Converte cada YYYY-MM-DD em Date.UTC(y, m-1, d).
 *   4. Retorna Math.round((utcTo - utcFrom) / 86_400_000).
 *   5. Input invalido -> NaN.
 *
 * Inputs aceitos: Date OU string (ISO completo, YYYY-MM-DD, etc).
 */

const DAY_MS = 86_400_000;

function toDate(v: Date | string): Date | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v;
  }
  if (typeof v === 'string') {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ymdInTimeZone(date: Date, timeZone: string): { y: number; m: number; d: number } | null {
  try {
    // en-CA garante formato YYYY-MM-DD reproduzivel sem regex de locale.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.format(date); // ex: "2026-05-20"
    const m = parts.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  } catch {
    return null;
  }
}

export function calendarDaysSince(
  from: Date | string,
  to: Date,
  timeZone?: string,
): number {
  const fromDate = toDate(from);
  const toDt = toDate(to);
  if (!fromDate || !toDt) return NaN;

  const tz =
    timeZone ??
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        return 'UTC';
      }
    })();

  const fromYmd = ymdInTimeZone(fromDate, tz);
  const toYmd = ymdInTimeZone(toDt, tz);
  if (!fromYmd || !toYmd) return NaN;

  const utcFrom = Date.UTC(fromYmd.y, fromYmd.m - 1, fromYmd.d);
  const utcTo = Date.UTC(toYmd.y, toYmd.m - 1, toYmd.d);
  return Math.round((utcTo - utcFrom) / DAY_MS);
}

export default calendarDaysSince;
