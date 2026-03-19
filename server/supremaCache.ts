/**
 * Simple in-memory cache with TTL for Suprema Poker API responses.
 */

const TTL = 3600000; // 1 hour in milliseconds

interface CacheEntry {
  data: any;
  timestamp: number;
}

export class SupremaCache {
  private store: Map<string, CacheEntry> = new Map();

  get(key: string): any | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp >= TTL) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: any): void {
    this.store.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}
