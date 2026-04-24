/**
 * Tournament Selector — Selector Result Cache
 *
 * Cache em memoria por (userId, date, sources, lookbackDays, filtersHash).
 * TTL 30min.
 *
 * Decisao A6: invalidacao apos add_to_grid invalida APENAS a entrada da `date`
 * especifica (nao zera tudo).
 * Decisao Q3: chamada direta — `selectorCache.invalidateAllForUser(userId)` exposta
 * para use em casos de upload novo (limpa todas as entradas do user).
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  date: string;
}

const cache = new Map<string, CacheEntry<any>>();

function makeKey(userId: string, date: string, sources: string, lookbackDays: number, filtersHash: string): string {
  return `${userId}:${date}:${sources}:${lookbackDays}:${filtersHash}`;
}

export const selectorCache = {
  get<T = any>(userId: string, date: string, sources: string, lookbackDays: number, filtersHash: string): T | null {
    const key = makeKey(userId, date, sources, lookbackDays, filtersHash);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set<T = any>(userId: string, date: string, sources: string, lookbackDays: number, filtersHash: string, data: T): void {
    const key = makeKey(userId, date, sources, lookbackDays, filtersHash);
    cache.set(key, { data, expiresAt: Date.now() + TTL_MS, date });
  },

  /** Invalidate all entries for a user (used by upload handler). */
  invalidateAllForUser(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  },

  /** Invalidate entries for a specific (user, date) - per A6. */
  invalidateForDate(userId: string, date: string): void {
    const prefix = `${userId}:${date}:`;
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  },

  __resetForTest(): void {
    cache.clear();
  },
};
