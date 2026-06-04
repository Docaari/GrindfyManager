/**
 * canonicalBuyIn — snap de buy-in (Sprint torneios-library-grouping, extraido
 * para shared/ no sprint biblioteca-administrar-dedup / ADR-200 Parte A).
 *
 * Helper PURO (sem I/O, sem deps de runtime) reusado por:
 *   - server/services/libraryGrouping.ts (agrupamento da aba Torneios)
 *   - shared/library-canonical-key.ts (key canonica de dedup)
 *
 * Snap de buy-in para inteiro "redondo" quando dentro da tolerancia relativa
 * de +-3% (com floor minimo de $0.15 para capturar centavos de fee). Colapsa
 * ruido de fee ($20+$1.60 -> 21.60 -> 22) sem snapar buy-ins baixos legitimos
 * ($1.50 nao vira $2; $5.50 nao vira $6).
 */
export function canonicalBuyIn(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const tol = Math.max(raw * 0.03, 0.15);
  const rounded = Math.round(raw);
  if (Math.abs(rounded - raw) <= tol) return rounded;
  return raw;
}
