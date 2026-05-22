// =============================================================================
// shared/numCoerce — Sprint AI-3.2 / RF-A1 (ADR-203 + ADR-204)
//
// `coerceFiniteNumber(value, fallback=0)` — helper compartilhado de coerção
// finite-number.
//
// STATUS (pos fix wave AI-3.2 reviewer):
//   - 2 callsites migrados: `server/coach/reportCost.ts` + `server/services/fxResolver.ts`.
//   - 4 callsites DEFERIDOS para AI-3.3: monthly/daily/quarterly/weekly generators
//     mantêm local `N`/`num`/`n` por compat PG numeric → string (driver pg retorna
//     string por default em DECIMAL/NUMERIC; este helper é estrito `typeof === "number"`).
//     Migração requer audit per-callsite + `coerceFiniteNumber(parseFloat(v))` explícito
//     na boundary do storage. Grep TODO em CLAUDE.md §10.
//
// Política:
//   - Aceita `unknown` (compat com JSON.parse + DB queries).
//   - NÃO coerce string automaticamente (callers fazem coerce explícito).
//   - Retorna fallback (default 0) para non-finite (NaN/Infinity/-Infinity)
//     OU non-number (string/null/undefined/object/array/boolean/BigInt).
//
// Lessons: #11 (default mínimo, sem throw).
// =============================================================================

export function coerceFiniteNumber(value: unknown, fallback: number = 0): number {
  if (typeof value !== "number") return fallback;
  return Number.isFinite(value) ? value : fallback;
}
