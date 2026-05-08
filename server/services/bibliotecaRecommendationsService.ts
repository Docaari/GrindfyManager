/**
 * Sprint Estudos-Coach-Biblio-2 — RF-2 Service biblioteca recommendations.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-2
 * ADR  : 134
 *
 * Algoritmo (RF-2.2):
 *   1. leaks = getStatsLeaks(userId, top=3)
 *   2. para cada leak: findStudyThemesByLinkedStat(statId, userId)
 *   3. tema.linkedLessons -> getLibraryLessonsByIds (filtra is_published)
 *   4. cap 2 lessons por leak (anti-overflow)
 *   5. hidrata watchedPct via getLibraryLessonProgressByUser
 *   6. cache TTL 60min em-memoria + invalidator publico
 *   7. _resetForTests para limpeza de cache em test suite (lesson #21)
 *
 * Lessons:
 *   #11 apresentar dado, nao decorar
 *   #19 courseSlug+lessonSlug sempre hidratados (Wouter route casa)
 *   #21 _resetForTests para isolar tests
 *   #9 log antes de fallback em catch
 */

import { storage } from "../storage";

const CACHE_TTL_MS = 60 * 60 * 1000; // 60min
const REFRESH_RATE_LIMIT = 5; // 5/dia
const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: any;
  expiresAt: number;
}

interface RefreshLogEntry {
  timestamps: number[];
}

const cache = new Map<string, CacheEntry>();
const refreshLog = new Map<string, RefreshLogEntry>();

export function _resetForTests(): void {
  cache.clear();
  refreshLog.clear();
}

export function invalidateBibliotecaRecommendationsCache(userId: string): void {
  cache.delete(userId);
}

export async function isRefreshRateLimited(userId: string): Promise<boolean> {
  const now = Date.now();
  const entry = refreshLog.get(userId);
  if (!entry) return false;
  // Sliding 24h window
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < REFRESH_WINDOW_MS,
  );
  return entry.timestamps.length >= REFRESH_RATE_LIMIT;
}

export async function recordBibliotecaRefresh(userId: string): Promise<void> {
  const now = Date.now();
  const entry = refreshLog.get(userId) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < REFRESH_WINDOW_MS,
  );
  entry.timestamps.push(now);
  refreshLog.set(userId, entry);
}

export interface LeakInfo {
  statId: string;
  statName: string;
  value: number;
  benchmark: number;
  delta: number;
  severity: number;
}

export interface ThemeInfo {
  id: string;
  name: string;
  slug: string;
  isCurated: boolean;
}

export interface LessonInfo {
  id: string;
  title: string;
  courseSlug: string;
  lessonSlug: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  watchedPct: number;
}

export interface RecommendationCard {
  leak: LeakInfo;
  theme: ThemeInfo;
  lessons: LessonInfo[];
}

export interface RecommendationsResponse {
  recommendations: RecommendationCard[];
  generatedAt: string;
  cacheExpiresAt: string;
  cacheHit: boolean;
}

export async function generateBibliotecaRecommendations(
  userId: string,
): Promise<RecommendationsResponse> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { ...cached.data, cacheHit: true };
  }

  const leaks = (await (storage as any).getStatsLeaks(userId, 3)) ?? [];

  const recommendations: RecommendationCard[] = [];

  for (const leak of leaks as LeakInfo[]) {
    let theme: any = null;
    try {
      theme = await (storage as any).findStudyThemesByLinkedStat(
        leak.statId,
        userId,
      );
    } catch (err) {
      console.error("[biblioteca-rec] findStudyThemesByLinkedStat fail", err);
      continue;
    }
    if (!theme) continue;
    const linkedLessons: string[] = Array.isArray(theme.linkedLessons)
      ? theme.linkedLessons
      : [];
    if (linkedLessons.length === 0) continue;

    const lessons = (await (storage as any).getLibraryLessonsByIds(
      linkedLessons,
    )) as any[];
    const published = lessons.filter((l) => l.isPublished !== false);
    if (published.length === 0) continue;
    // Cap 2 lessons por leak.
    const capped = published.slice(0, 2);
    const ids = capped.map((l) => l.id);
    const progress = (await (storage as any).getLibraryLessonProgressByUser(
      userId,
      ids,
    )) as Record<string, number>;
    recommendations.push({
      leak: {
        statId: leak.statId,
        statName: leak.statName,
        value: leak.value,
        benchmark: leak.benchmark,
        delta: leak.delta,
        severity: leak.severity,
      },
      theme: {
        id: theme.id,
        name: theme.name,
        slug: theme.slug ?? "",
        isCurated: theme.isCurated === true,
      },
      lessons: capped.map((l) => ({
        id: l.id,
        title: l.title,
        courseSlug: l.courseSlug ?? "",
        lessonSlug: l.lessonSlug ?? l.slug ?? "",
        durationSeconds: Number(l.durationSeconds ?? 0),
        thumbnailUrl: l.thumbnailUrl ?? null,
        watchedPct: progress[l.id] ?? 0,
      })),
    });
  }

  const generatedAt = new Date(now).toISOString();
  const cacheExpiresAt = new Date(now + CACHE_TTL_MS).toISOString();
  const data = {
    recommendations,
    generatedAt,
    cacheExpiresAt,
  };
  cache.set(userId, { data, expiresAt: now + CACHE_TTL_MS });
  return { ...data, cacheHit: false };
}
