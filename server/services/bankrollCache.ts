/**
 * Bankroll History Cache (Q-Arch-4)
 *
 * Cache em memoria de GET /api/bankroll/history com TTL 5 minutos.
 * Invalidado pelo bankrollService em PUT /api/bankroll e POST /api/bankroll/snapshot.
 *
 * Mesmo padrao do selectorCache.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

function makeKey(userId: string, filtersHash: string): string {
  return `${userId}:${filtersHash}`;
}

export const bankrollCache = {
  get<T = any>(userId: string, filtersHash: string): T | null {
    const key = makeKey(userId, filtersHash);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set<T = any>(userId: string, filtersHash: string, data: T): void {
    const key = makeKey(userId, filtersHash);
    cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  },

  invalidateAllForUser(userId: string): void {
    const prefix = `${userId}:`;
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
