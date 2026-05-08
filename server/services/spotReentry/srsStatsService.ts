/**
 * Sprint Spot-Anki-Reentry-3 — service wrapper for SRS stats with cache.
 *
 * Reusa storage.getSrsStats + srsStatsCache para reduzir hits no DB.
 */

import { storage } from "../../storage";
import {
  getCachedSrsStats,
  setCachedSrsStats,
  type SrsStats,
} from "./srsStatsCache";

export async function getSrsStatsCached(userId: string): Promise<SrsStats> {
  const cached = getCachedSrsStats(userId);
  if (cached) return cached;

  const fresh = await (storage as any).getSrsStats(userId, new Date());
  const normalized: SrsStats = {
    pendingToday: Number(fresh?.pendingToday ?? 0),
    reviewedLast7Days: Number(fresh?.reviewedLast7Days ?? 0),
    accuracyLast7Days: Number(fresh?.accuracyLast7Days ?? 0),
    streakDays: Number(fresh?.streakDays ?? 0),
  };
  setCachedSrsStats(userId, normalized);
  return normalized;
}
