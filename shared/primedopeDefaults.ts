// =============================================================================
// Sprint F4 — PrimeDope shared defaults (DRY de NETWORK_DEFAULTS, lesson #10)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md
// Lesson learned #10: defaults divergentes entre client e server quebram cache
// + criam divergencia silenciosa. Solucao: shared/primedopeDefaults.ts unica fonte
// de verdade. Ambos client e server importam destes mesmos defaults.
// =============================================================================

/**
 * Heuristica de rake medio por rede (em %). Usado como fallback quando o
 * tournament backfill (migration 0014) nao tem rake_pct preenchido para o
 * torneio especifico, ou quando nao ha nenhuma sample.
 */
export const NETWORK_DEFAULTS_RAKE: Record<string, number> = {
  GGNetwork: 10,
  GGPoker: 10,
  GG: 10,
  WPN: 8,
  PokerStars: 9,
  Stars: 9,
  Suprema: 10,
  PartyPoker: 8,
  "888poker": 8,
  "888": 8,
  Bodog: 8,
  Bovada: 8,
  CoinPoker: 7,
  Coin: 7,
  Chico: 8,
  iPoker: 8,
  Revolution: 8,
};

/**
 * Heuristica de ROI medio por rede (em %). Valores conservadores baseados em
 * benchmarks da comunidade. Usado como fallback quando templates nao trazem
 * avgRoi.
 */
export const NETWORK_DEFAULTS_ROI: Record<string, number> = {
  GGNetwork: 8,
  GGPoker: 8,
  GG: 8,
  WPN: 12,
  PokerStars: 5,
  Stars: 5,
  Suprema: 20,
  PartyPoker: 8,
  "888poker": 8,
  "888": 8,
  Bodog: 10,
  Bovada: 10,
  CoinPoker: 12,
  Coin: 12,
  Chico: 10,
  iPoker: 8,
  Revolution: 10,
};

/**
 * Default field size quando nao ha tournament backfill nem template.
 */
export const DEFAULT_PLAYERS_AVG = 1000;

/**
 * Default places paid (~15% do field size, comum em MTTs).
 * ROUND(1000 * 0.15) = 150
 */
export const DEFAULT_PLACES_PAID = 150;

/**
 * Fallback constante de FX rates (unidades por 1 USD, ADR-033).
 * Usado quando users.exchangeRates e wallets.exchangeRates ambos ausentes.
 */
export const FX_FALLBACK_CONSTANTS: Record<string, number> = {
  USD: 1.0,
  BRL: 5.0,
  EUR: 0.93,
  GBP: 0.78,
  CNY: 7.25,
  USDT: 1.0,
};

/**
 * Limites operacionais do PrimeDope service (ADR-054).
 */
export const PRIMEDOPE_LIMITS = {
  RATE_LIMIT_PER_USER_MS: 10_000, // 1 req / 10s / userId
  CONCURRENT_FETCHES: 3, // semaphore inline max
  CACHE_TTL_MS: 30 * 60 * 1000, // 30 min
  FALLBACK_STALE_MS: 24 * 3600 * 1000, // 24h
  RETENTION_DAYS: 90,
  FETCH_TIMEOUT_MS: 15_000,
  RETRY_BACKOFF_MS: 500,
  RETRY_MAX_ATTEMPTS: 2, // 1 retry => 2 attempts
};

/**
 * Multiplicadores aceitos no wizard (1=so este dia, 4=mes, 12=trimestre, 52=ano).
 */
export const ALLOWED_MULTIPLIERS = [1, 4, 12, 52] as const;

/**
 * Profile letters aceitos.
 */
export const ALLOWED_PROFILE_LETTERS = ["A", "B", "C"] as const;

function lookupCaseInsensitive(
  map: Record<string, number>,
  key: string,
): number | undefined {
  if (!key) return undefined;
  if (map[key] !== undefined) return map[key];
  const lowered = key.toLowerCase();
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === lowered) return map[k];
  }
  return undefined;
}

/**
 * Lookup case-insensitive + fallback default 8 (median rake da industria).
 */
export function getNetworkRakeDefault(site: string): number {
  const hit = lookupCaseInsensitive(NETWORK_DEFAULTS_RAKE, site);
  if (typeof hit === "number") return hit;
  return 8;
}

/**
 * Lookup case-insensitive + fallback default 10 (ROI conservador).
 */
export function getNetworkRoiDefault(site: string): number {
  const hit = lookupCaseInsensitive(NETWORK_DEFAULTS_ROI, site);
  if (typeof hit === "number") return hit;
  return 10;
}
