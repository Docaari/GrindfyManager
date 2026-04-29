// =============================================================================
// Sprint F4 — hud_stat_targets in-memory cache (RNF-02)
//
// TTL 1h. Lookup O(1) por (statKey, format, stakeBucket).
// =============================================================================

import { storage } from "../storage";
import type { KnowledgeBaseLookup } from "./hudStatsResolver";
import type { HudStatTarget } from "@shared/schema";

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  loadedAt: number;
  byKey: Map<string, { targetMin: number; targetMax: number }>;
}

let cache: CacheEntry | null = null;

function buildKey(statKey: string, format: string, stakeBucket: string): string {
  return `${statKey}::${format}::${stakeBucket}`;
}

async function loadAll(): Promise<CacheEntry> {
  const rows: HudStatTarget[] = await storage.getHudStatTargets();
  const byKey = new Map<string, { targetMin: number; targetMax: number }>();
  // Latest version per (statKey, format, stakeBucket).
  const versionByKey = new Map<string, number>();
  for (const r of rows) {
    const k = buildKey(r.statKey, r.format, r.stakeBucket);
    const v = r.version ?? 1;
    if ((versionByKey.get(k) ?? 0) <= v) {
      versionByKey.set(k, v);
      byKey.set(k, {
        targetMin: Number(r.targetMin),
        targetMax: Number(r.targetMax),
      });
    }
  }
  return { loadedAt: Date.now(), byKey };
}

async function ensureCache(): Promise<CacheEntry> {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = await loadAll();
  }
  return cache;
}

export function invalidateHudStatTargetsCache(): void {
  cache = null;
}

/**
 * Async lookup (uso direto pelo Coach tool).
 */
export async function lookupHudStatTarget(
  statKey: string,
  format: string,
  stakeBucket: string,
): Promise<{ targetMin: number; targetMax: number } | null> {
  const c = await ensureCache();
  return c.byKey.get(buildKey(statKey, format, stakeBucket)) ?? null;
}

/**
 * Sync KnowledgeBaseLookup adapter — usado por resolveTarget em paths
 * que ja tem cache pre-carregada. Caller deve chamar `preloadHudStatTargets`
 * antes.
 */
export async function buildKnowledgeBaseLookup(): Promise<KnowledgeBaseLookup> {
  const c = await ensureCache();
  return {
    getTarget(statKey, format, stakeBucket) {
      return c.byKey.get(buildKey(statKey, format, stakeBucket)) ?? null;
    },
  };
}
