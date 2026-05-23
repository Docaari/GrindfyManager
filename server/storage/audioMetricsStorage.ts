// =============================================================================
// Sprint MP-VALIDATION / RF-03 — admin audio metrics storage.
//
// 8 SQL queries paralelas + canary drift legacy audio_* vs dot audio.*
// Cache in-memory 5min per range. `_resetCacheForTests()` exposto.
// =============================================================================

import { db } from "../db";
import { sql } from "drizzle-orm";

export type AudioMetricsRange = "7d" | "30d" | "90d";

export interface AudioMetricsKpis {
  mpDau: number;
  mpWau: number;
  avgListeningTimePerSessionSec: number;
  queueDepthMedian: number;
  queueDepthP95: number;
  spotifyToInternalFallbackRate: number;
  totalPlays: number;
  totalLessonCompletions: number;
}

export interface AudioMetricsLessonCompletion {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  completionPct: number;
  plays: number;
}

export interface AudioMetricsLessonPlays {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  plays: number;
}

export interface AudioMetricsResult {
  range: AudioMetricsRange;
  generatedAt: string;
  kpis: AudioMetricsKpis;
  topLessonsCompletion: AudioMetricsLessonCompletion[];
  topLessonsPlays: AudioMetricsLessonPlays[];
  canaryDrift: boolean;
  canaryDriftPct?: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CANARY_DRIFT_THRESHOLD = 0.2; // 20%

const _cache = new Map<string, { data: AudioMetricsResult; expiresAt: number }>();

export function _resetCacheForTests(): void {
  _cache.clear();
}

function rangeToInterval(range: AudioMetricsRange): string {
  if (range === "30d") return "30 days";
  if (range === "90d") return "90 days";
  return "7 days";
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getAudioMetrics(
  range: AudioMetricsRange = "7d",
): Promise<AudioMetricsResult> {
  const cached = _cache.get(range);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const interval = rangeToInterval(range);

  // Execute 9 queries paralelas + 2 canary.
  const [
    dauRes,
    wauRes,
    avgRes,
    queueRes,
    fallbackRes,
    totalPlaysRes,
    totalCompletionsRes,
    topCompletionRes,
    topPlaysRes,
    canaryLegacyRes,
    canaryDotRes,
  ] = await Promise.all([
    db.execute(
      sql.raw(
        `SELECT COUNT(DISTINCT user_id) AS dau FROM user_activity ` +
          `WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COUNT(DISTINCT user_id) AS wau FROM user_activity ` +
          `WHERE page = 'mini_player' AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COALESCE(AVG(duration), 0) AS avg_sec FROM user_activity ` +
          `WHERE action = 'audio_driver_active' AND created_at > NOW() - INTERVAL '${interval}' AND duration > 0`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT ` +
          `COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (metadata->>'queue_length')::int), 0) AS median, ` +
          `COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'queue_length')::int), 0) AS p95 ` +
          `FROM user_activity ` +
          `WHERE action IN ('audio.queue_add','audio_queue_add') ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT ` +
          `COALESCE(COUNT(*) FILTER (WHERE metadata->>'reason' IN ('token_expired','reconnect_failed_3x'))::float / ` +
          `NULLIF(COUNT(*), 0), 0) AS rate ` +
          `FROM user_activity ` +
          `WHERE action = 'audio_driver_switch' AND metadata->>'from' = 'spotify' ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COUNT(*) AS total FROM user_activity ` +
          `WHERE action IN ('audio.play','audio_play') ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COUNT(*) AS total FROM user_activity ` +
          `WHERE action IN ('lesson.completion_pct_100','audio.lesson_complete') ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT ` +
          `l.id AS lesson_id, l.course_slug, l.slug AS lesson_slug, ` +
          `COUNT(*) FILTER (WHERE ua.action = 'lesson.play_start')::int AS plays, ` +
          `COALESCE(COUNT(*) FILTER (WHERE ua.action = 'lesson.completion_pct_100')::float / ` +
          `NULLIF(COUNT(*) FILTER (WHERE ua.action = 'lesson.play_start'), 0), 0) AS completion_pct ` +
          `FROM library_lessons l ` +
          `LEFT JOIN user_activity ua ON ua.metadata->>'lesson_id' = l.id ` +
          `AND ua.created_at > NOW() - INTERVAL '${interval}' ` +
          `GROUP BY l.id, l.course_slug, l.slug ` +
          `HAVING COUNT(*) FILTER (WHERE ua.action = 'lesson.play_start') > 0 ` +
          `ORDER BY completion_pct DESC NULLS LAST ` +
          `LIMIT 20`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT ` +
          `l.id AS lesson_id, l.course_slug, l.slug AS lesson_slug, ` +
          `COUNT(*)::int AS plays ` +
          `FROM library_lessons l ` +
          `JOIN user_activity ua ON ua.metadata->>'lesson_id' = l.id ` +
          `WHERE ua.action IN ('lesson.play_start','audio.play') ` +
          `AND ua.created_at > NOW() - INTERVAL '${interval}' ` +
          `GROUP BY l.id, l.course_slug, l.slug ` +
          `ORDER BY plays DESC ` +
          `LIMIT 10`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COUNT(*) AS legacy_count FROM user_activity ` +
          `WHERE action LIKE 'audio\\_%' ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
    db.execute(
      sql.raw(
        `SELECT COUNT(*) AS dot_count FROM user_activity ` +
          `WHERE action LIKE 'audio.%' ` +
          `AND created_at > NOW() - INTERVAL '${interval}'`,
      ),
    ),
  ]);

  const dauRow = (dauRes as any)?.rows?.[0] ?? {};
  const wauRow = (wauRes as any)?.rows?.[0] ?? {};
  const avgRow = (avgRes as any)?.rows?.[0] ?? {};
  const queueRow = (queueRes as any)?.rows?.[0] ?? {};
  const fallbackRow = (fallbackRes as any)?.rows?.[0] ?? {};
  const totalPlaysRow = (totalPlaysRes as any)?.rows?.[0] ?? {};
  const totalCompletionsRow = (totalCompletionsRes as any)?.rows?.[0] ?? {};
  const topCompletionRows = (topCompletionRes as any)?.rows ?? [];
  const topPlaysRows = (topPlaysRes as any)?.rows ?? [];
  const canaryLegacyRow = (canaryLegacyRes as any)?.rows?.[0] ?? {};
  const canaryDotRow = (canaryDotRes as any)?.rows?.[0] ?? {};

  const legacyCount = num(canaryLegacyRow.legacy_count);
  const dotCount = num(canaryDotRow.dot_count);
  let canaryDrift = false;
  let canaryDriftPct: number | undefined;
  if (legacyCount > 0 || dotCount > 0) {
    const denom = Math.max(legacyCount, dotCount, 1);
    const diff = Math.abs(legacyCount - dotCount);
    canaryDriftPct = diff / denom;
    canaryDrift = canaryDriftPct > CANARY_DRIFT_THRESHOLD;
  }

  const result: AudioMetricsResult = {
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      mpDau: num(dauRow.dau),
      mpWau: num(wauRow.wau),
      avgListeningTimePerSessionSec: Math.round(num(avgRow.avg_sec)),
      queueDepthMedian: num(queueRow.median),
      queueDepthP95: num(queueRow.p95),
      spotifyToInternalFallbackRate: num(fallbackRow.rate),
      totalPlays: num(totalPlaysRow.total),
      totalLessonCompletions: num(totalCompletionsRow.total),
    },
    topLessonsCompletion: topCompletionRows.map((r: any) => ({
      lessonId: r.lesson_id ?? r.lessonId,
      courseSlug: r.course_slug ?? r.courseSlug ?? "",
      lessonSlug: r.lesson_slug ?? r.lessonSlug ?? "",
      completionPct: num(r.completion_pct ?? r.completionPct),
      plays: num(r.plays),
    })),
    topLessonsPlays: topPlaysRows.map((r: any) => ({
      lessonId: r.lesson_id ?? r.lessonId,
      courseSlug: r.course_slug ?? r.courseSlug ?? "",
      lessonSlug: r.lesson_slug ?? r.lessonSlug ?? "",
      plays: num(r.plays),
    })),
    canaryDrift,
    canaryDriftPct,
  };

  _cache.set(range, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
