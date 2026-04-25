/**
 * Tournament Selector — Player Bundle Cache (RF-03 + ADR-016)
 *
 * Servico que agrega as 7 dimensoes de analytics em uma chamada e mantem
 * cache em memoria por (userId, lookbackDays) com TTL 5min.
 *
 * Decisao Q3: invalidacao DIRETA via `playerBundleCache.invalidate(userId)`
 * chamada pelo upload handler (Opcao A do indice de arquitetura).
 *
 * Decisao A6: invalidate(userId) limpa TODAS as entradas do user (varios lookbackDays).
 */

import { storage } from "../storage";
import type { PlayerAnalyticsBundle } from "../../shared/scoring";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: PlayerAnalyticsBundle;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function makeKey(userId: string, lookbackDays: number): string {
  return `${userId}:${lookbackDays}`;
}

function periodFromLookbackDays(d: number): string {
  // Map to existing period strings
  if (d <= 30) return "30d";
  if (d <= 90) return "90d";
  if (d <= 180) return "180d";
  return "all";
}

async function loadBundle(userId: string, lookbackDays: number): Promise<PlayerAnalyticsBundle> {
  const period = periodFromLookbackDays(lookbackDays);
  const filters = {};

  // Run all 7 analytics queries in parallel.
  //
  // Note (CRITICAL #1 + #2 fix): we explicitly use the *V2*/*Size* variants of buyIn and field
  // because the legacy getAnalyticsByBuyinRange / getAnalyticsByField return labels designed for
  // the dashboard ("$0-$5", "Top 5%", etc.) that do NOT match scoringConstants.BUYIN_BUCKETS /
  // FIELD_BUCKETS. Without this alignment, the scorer always falls back to emptySignal(50).
  const [bySite, byBuyIn, byCategory, bySpeed, byDayOfWeek, byTimeOfDay, byField] = await Promise.all([
    storage.getAnalyticsBySite(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsBySite failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsByBuyinRangeV2(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsByBuyinRangeV2 failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsByCategory(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsByCategory failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsBySpeed(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsBySpeed failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsByDayOfWeek(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsByDayOfWeek failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsByTimeOfDay(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsByTimeOfDay failed for user', userId, err);
      return [];
    }),
    storage.getAnalyticsByFieldSize(userId, period, filters).catch((err: Error) => {
      console.error('playerBundle: getAnalyticsByFieldSize failed for user', userId, err);
      return [];
    }),
  ]);

  let totalTournaments = 0;
  let overallRoi = 0;
  if (typeof (storage as any).countTournaments === "function") {
    try {
      totalTournaments = await (storage as any).countTournaments(userId);
    } catch {
      totalTournaments = 0;
    }
  }
  if (typeof (storage as any).getOverallRoi === "function") {
    try {
      overallRoi = await (storage as any).getOverallRoi(userId);
    } catch {
      overallRoi = 0;
    }
  }

  // Normalize into PlayerAnalyticsBundle shape (sometimes storage returns
  // arrays with slightly different keys — adapt defensively)
  const normSite = (bySite as any[]).map((b) => ({
    site: b.site,
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
    profit: typeof b.profit === "number" ? b.profit : Number(b.profit ?? 0),
  }));

  const normBuyIn = (byBuyIn as any[]).map((b) => ({
    range: b.range ?? b.buyinRange ?? "",
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  const normCategory = (byCategory as any[]).map((b) => ({
    category: b.category ?? b.type ?? "",
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  const normSpeed = (bySpeed as any[]).map((b) => ({
    speed: b.speed ?? "",
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  const normDow = (byDayOfWeek as any[]).map((b) => ({
    dayOfWeek: typeof b.dayOfWeek === "number" ? b.dayOfWeek : Number(b.dayOfWeek ?? 0),
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  const normTod = (byTimeOfDay as any[]).map((b) => ({
    bucket: b.bucket ?? "",
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  // CRITICAL #2 fix: getAnalyticsByFieldSize returns { range: 'pequeno'|'medio'|'grande'|'massivo', ... }
  // already aligned with FIELD_BUCKETS labels. Defensive fallback to b.bucket kept for legacy mocks.
  const normField = (byField as any[]).map((b) => ({
    range: b.range ?? b.bucket ?? "",
    sample: typeof b.sample === "number" ? b.sample : Number(b.volume ?? 0),
    roi: typeof b.roi === "number" ? b.roi : Number(b.roi ?? 0),
  }));

  // Sprint 1 ressalva 3 fix (UX-2 2026-04-25): `lookbackTournaments` agora
  // reflete torneios DENTRO da janela de lookback (period), nao o total
  // all-time. Necessario para cold start granular: <20 / 20-49 / >=50
  // torneios usam ESTE numero, nao totalTournaments.
  //
  // Cada torneio aparece exatamente uma vez em `bySite` (todo torneio tem um
  // site), entao `sum(bySite[].sample)` == count de torneios na janela. Em
  // dimensoes opcionais (category/speed/dow), torneios podem cair em "null"
  // bucket — bySite e mais robusto.
  const lookbackTournaments = normSite.reduce((acc, b) => acc + (b.sample || 0), 0);

  return {
    totalTournaments,
    lookbackTournaments,
    lookbackDays,
    overallRoi,
    bySite: normSite,
    byBuyIn: normBuyIn,
    byCategory: normCategory,
    bySpeed: normSpeed,
    byDayOfWeek: normDow,
    byTimeOfDay: normTod,
    byField: normField,
  };
}

export const playerBundleCache = {
  async getOrLoad(userId: string, lookbackDays: number): Promise<PlayerAnalyticsBundle> {
    const key = makeKey(userId, lookbackDays);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.data;
    }
    const data = await loadBundle(userId, lookbackDays);
    cache.set(key, { data, expiresAt: now + TTL_MS });
    return data;
  },

  invalidate(userId: string): void {
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

// ============================================================================
// MEDIUM #8: Helper to invalidate ALL tournament-related caches for a user.
// Called after any mutation that affects analytics: tournament CRUD, upload,
// add-to-grid (for the planning flow).
// ============================================================================
import { selectorCache } from "./selectorCache";

export function invalidateUserTournamentCaches(userId: string): void {
  try {
    playerBundleCache.invalidate(userId);
  } catch (err) {
    console.error('invalidateUserTournamentCaches: playerBundle.invalidate failed', userId, err);
  }
  try {
    selectorCache.invalidateAllForUser(userId);
  } catch (err) {
    console.error('invalidateUserTournamentCaches: selectorCache.invalidateAllForUser failed', userId, err);
  }
}
