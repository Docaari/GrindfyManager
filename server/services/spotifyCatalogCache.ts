// Sprint SPOTIFY-DEEP / RF-03 + ADR-208 §3 — In-memory cache 5min TTL.
//
// Map<keyHash, {data, expiresAt}>. Key composta (userId, endpoint, queryObj).
// Sweep lazy on get(). Invalidacao explicita via invalidate(userId) — limpa
// pattern userId|*. Sem cache distribuido (Redis) — pre-launch baseline.

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface CatalogCacheOpts {
  ttlMs?: number;
}

export interface CatalogCache {
  get(userId: string, endpoint: string, query: Record<string, unknown>): unknown | null;
  set(
    userId: string,
    endpoint: string,
    query: Record<string, unknown>,
    value: unknown,
  ): void;
  invalidate(userId: string): void;
  _resetForTests(): void;
}

// Hash estavel para queryObj — sort keys p/ idempotencia.
function stableSerialize(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    parts.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join("&");
}

function buildKey(userId: string, endpoint: string, query: Record<string, unknown>): string {
  return `${userId}|${endpoint}|${stableSerialize(query)}`;
}

export function createCatalogCache(opts: CatalogCacheOpts = {}): CatalogCache {
  const ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  const store: Map<string, CacheEntry> = new Map();

  return {
    get(userId, endpoint, query) {
      const key = buildKey(userId, endpoint, query);
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.data;
    },
    set(userId, endpoint, query, value) {
      const key = buildKey(userId, endpoint, query);
      store.set(key, { data: value, expiresAt: Date.now() + ttlMs });
    },
    invalidate(userId) {
      const prefix = `${userId}|`;
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },
    _resetForTests() {
      store.clear();
    },
  };
}

// Singleton padrao para o pipeline de catalogo.
export const defaultSpotifyCatalogCache = createCatalogCache();
