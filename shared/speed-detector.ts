/**
 * Speed detector — SSoT name-based classification (Sprint torneios-library-grouping).
 *
 * Centraliza a deteccao de velocidade (Normal/Turbo/Hyper) a partir de texto
 * (nome do torneio +/- coluna `speed` do CSV). Antes vivia duplicada em
 * `csvParser.detectSpeed` (so "SUPER TURBO" -> Hyper) e `detectCoinSpeed`
 * (CoinPoker keywords). Hyper era sub-detectado: nomes "Hyper", "Hyper-Turbo",
 * "Hyperturbo" caiam em Turbo. Consolidado aqui + reutilizado read-side em
 * `libraryGrouping.normalizeSpeed` p/ corrigir dado legado sem re-import.
 *
 * SSoT dos valores: shared/scoring.SPEED_BUCKETS = ["Normal","Turbo","Hyper"].
 */

export type SpeedBucket = "Normal" | "Turbo" | "Hyper";

// Hyper antes de Turbo: nomes hyper contem "turbo" ("Hyper-Turbo").
// Cobre: Hyper, Hyperturbo, Hyper-Turbo, Super Turbo, Ultra Turbo, 3-Speed (GG).
const HYPER_RE = /(hyper|super[\s\-]?turbo|ultra[\s\-]?turbo|3[\s\-]?speed)/i;
// Turbo + sinonimos de site (CoinPoker: Sprint/Bolt/Flash/Rapido).
const TURBO_RE = /(turbo|sprint|bolt|flash|r[áa]pido)/i;

const RANK: Record<SpeedBucket, number> = { Normal: 0, Turbo: 1, Hyper: 2 };

/** Classifica um texto livre (nome e/ou coluna speed) em SpeedBucket. */
export function classifySpeed(...texts: Array<string | null | undefined>): SpeedBucket {
  const s = texts.filter(Boolean).join(" ");
  if (!s) return "Normal";
  if (HYPER_RE.test(s)) return "Hyper";
  if (TURBO_RE.test(s)) return "Turbo";
  return "Normal";
}

/** Conveniencia: classifica apenas pelo nome. */
export function detectSpeedFromName(name: string | null | undefined): SpeedBucket {
  return classifySpeed(name);
}

/** Retorna a velocidade mais rapida entre dois sinais (Hyper > Turbo > Normal). */
export function fastestSpeed(a: string | null | undefined, b: string | null | undefined): SpeedBucket {
  const av = (RANK as Record<string, number>)[(a ?? "").trim()] ?? 0;
  const bv = (RANK as Record<string, number>)[(b ?? "").trim()] ?? 0;
  const order: SpeedBucket[] = ["Normal", "Turbo", "Hyper"];
  return order[Math.max(av, bv)];
}
