/**
 * Wallet Cache (Sprint Bankroll-2)
 *
 * Cache em memoria de leituras de wallets com TTL 30 segundos.
 * Invalidado em qualquer mutacao de wallet (create/update/archive/transaction).
 *
 * Mesmo padrao do bankrollCache + selectorCache.
 */

const TTL_MS = 30 * 1000; // 30 seconds

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

function makeKey(userId: string, scope: string): string {
  return `${userId}:${scope}`;
}

export const walletCache = {
  get<T = any>(userId: string, scope: string): T | null {
    const key = makeKey(userId, scope);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set<T = any>(userId: string, scope: string, data: T): void {
    const key = makeKey(userId, scope);
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
