// =============================================================================
// statsLinkedThemesService — Sprint stats-themes-linking-1 (ADR-141 §2.4)
//
// Cache singleton para reverse lookup `GET /api/stats/:statId/linked-themes`.
// Pattern: lesson #21 — Map<key, {data, expiresAt}>, TTL 60s, invalidator
// publico chamado pelas mutations (RF-01.4 + RF-08.4 + RF-08.5), reset
// dedicado para tests (`_resetForTests` com underscore prefix).
//
// Key shape: `${userId}:${statId}` — cross-user isolation natural.
// =============================================================================

import { storage } from "../storage";

interface CacheEntry {
  data: any[];
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 5000;
const _cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, statId: string): string {
  return `${userId}:${statId}`;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of _cache) {
    if (entry.expiresAt <= now) _cache.delete(key);
  }
}

/**
 * Reverse lookup: temas do user atual que linkam a stat informada.
 * Cache hit retorna copia direta; miss bate `storage.getThemesLinkingStat`.
 *
 * Storage shape esperado (ADR-141 §2.4):
 *   [{ id, name, slug, category }]
 */
export async function getThemesLinkingStat(
  userId: string,
  statId: string,
): Promise<any[]> {
  const key = cacheKey(userId, statId);
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }
  const data = await (storage as any).getThemesLinkingStat(userId, statId);
  const safe = Array.isArray(data) ? data : [];
  if (_cache.size >= CACHE_MAX_SIZE) pruneExpired(now);
  _cache.set(key, { data: safe, expiresAt: now + CACHE_TTL_MS });
  return safe;
}

/**
 * Invalidator publico — chamado por mutations RF-01 + RF-08.
 * Sem statId: invalida TODAS entries do user.
 * Com statId: invalida apenas a key exata.
 */
export function invalidateStatsLinkedThemesCache(
  userId: string,
  statId?: string,
): void {
  if (statId) {
    _cache.delete(cacheKey(userId, statId));
    return;
  }
  const prefix = `${userId}:`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}

/** Test-only: reset completo. */
export function _resetForTests(): void {
  _cache.clear();
}
