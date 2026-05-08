/**
 * Sprint Spot-Anki-Reentry-3 — server-side cache for SRS stats (RF-5).
 *
 * Lesson #21 (CLAUDE.md §9): cache server-side TTL precisa de invalidator
 * publico chamado por mutations. POST /grade/skip/bulk invalidam apos commit.
 *
 * TTL: 60s. Map<userId, { data, expiresAt }>.
 */

export type SrsStats = {
  pendingToday: number;
  reviewedLast7Days: number;
  accuracyLast7Days: number;
  streakDays: number;
};

type CacheEntry = {
  data: SrsStats;
  expiresAt: number;
};

const TTL_MS = 60_000;
const _cache = new Map<string, CacheEntry>();

export function getCachedSrsStats(userId: string): SrsStats | null {
  const entry = _cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    _cache.delete(userId);
    return null;
  }
  return entry.data;
}

export function setCachedSrsStats(userId: string, data: SrsStats): void {
  _cache.set(userId, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Invalida cache do user. Chamado por mutations (POST /grade, /skip, /bulk-from-session).
 */
export function invalidateSrsStatsCache(userId: string): void {
  _cache.delete(userId);
}

/**
 * Reset total — apenas para tests (lesson #21 _resetForTests).
 */
export function _resetSrsStatsCacheForTests(): void {
  _cache.clear();
}
